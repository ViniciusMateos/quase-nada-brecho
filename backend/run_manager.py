"""
Gerenciador de execuções do scraper: roda o worker como subprocesso, captura o
stdout linha a linha e faz broadcast pros assinantes (WebSocket). Suporta parar.

Ao terminar uma raspagem de verdade (não import de cookies), importa a planilha
gerada pro SQLite — o dashboard passa a refletir as vendas reais.
"""
import asyncio
import itertools
import os
import signal
import time
from collections import deque

import history
import liveactivity
import notify
import scraper
import settings

_counter = itertools.count(1)


def _parse_progress(linha):
    """`[progress] <feitos> <total> <label...>` → dict (ou None se malformado)."""
    try:
        resto = linha[len("[progress]"):].strip()
        partes = resto.split(None, 2)
        done, total = int(partes[0]), int(partes[1])
        label = partes[2] if len(partes) > 2 else ""
        return {"done": done, "total": total, "label": label}
    except Exception:
        return None


def _parse_saldo(linha):
    """`[saldo] k=v k=v …` (em qualquer lugar da linha) → dict {k: int|str}."""
    i = linha.find("[saldo]")
    if i < 0:
        return None
    d = {}
    for tok in linha[i + len("[saldo]"):].split():
        if "=" not in tok:
            continue
        k, v = tok.split("=", 1)
        try:
            d[k] = int(v)
        except ValueError:
            d[k] = v
    return d or None


def _extrair_saldo_bots(data):
    """Best-effort: tira um saldo ({novas, atualizadas, …}) do dict da run do backend dos Bots.
    A reconciliação de verdade (novas/atualizadas/vendidas) acontece no POST /scraper/emulador/posts
    que o device faz, então aqui normalmente NÃO vem nada — devolve None sem quebrar. Tenta, nesta
    ordem: (1) um campo `saldo` já dict; (2) um marcador `[saldo] k=v …` no status_log (que pode
    ser lista de strings ou de dicts com o texto num dos campos conhecidos)."""
    if not isinstance(data, dict):
        return None
    s = data.get("saldo")
    if isinstance(s, dict) and s:
        return {k: v for k, v in s.items() if isinstance(v, (int, float, str))} or None
    log = data.get("status_log")
    linhas = []
    if isinstance(log, list):
        for item in log:
            if isinstance(item, str):
                linhas.append(item)
            elif isinstance(item, dict):
                linhas.append(str(item.get("linha") or item.get("msg") or item.get("texto") or ""))
    elif isinstance(log, str):
        linhas = log.splitlines()
    for linha in reversed(linhas):
        achado = _parse_saldo(linha)
        if achado:
            return achado
    return None


_TEXTOS = {
    "raspagem": {
        "pt": {
            "titulo": "Raspando o brechó",
            "inicio": ("Raspando o brechó", "Começando a descer o feed… te mostro o progresso."),
            "fim_ok": ("Brechó atualizado", "Raspagem concluída e planilha sincronizada."),
            "fim_erro": ("Deu ruim", "O scraper do brechó parou com erro."),
            "fim_sem_sessao": ("Sem sessão", "A sessão do Instagram expirou — reconecte no app pra raspar."),
            "fim_parado": ("Parado", "O scraper do brechó foi parado."),
        },
        "en": {
            "titulo": "Scraping the thrift",
            "inicio": ("Scraping the thrift", "Starting to scroll the feed… I'll show the progress."),
            "fim_ok": ("Thrift updated", "Scrape done and sheet synced."),
            "fim_erro": ("Something went wrong", "The thrift scraper stopped with an error."),
            "fim_sem_sessao": ("No session", "The Instagram session expired — reconnect in the app to scrape."),
            "fim_parado": ("Stopped", "The thrift scraper was stopped."),
        },
    },
    # job "fotos" do emulador: recaptura a foto (limpa) de todas as peças com link
    "fotos": {
        "pt": {
            "titulo": "Recapturando fotos",
            "inicio": ("Recapturando fotos", "Abrindo peça por peça pra tirar a foto de novo… demora umas horas."),
            "fim_ok": ("Fotos atualizadas", "Recaptura das fotos concluída."),
            "fim_erro": ("Deu ruim", "A recaptura das fotos parou com erro."),
            "fim_sem_sessao": ("Sem sessão", "A conta auxiliar caiu — confira as contas no app dos Bots."),
            "fim_parado": ("Parado", "A recaptura das fotos foi parada."),
        },
        "en": {
            "titulo": "Recapturing photos",
            "inicio": ("Recapturing photos", "Opening each item to take the photo again… takes a few hours."),
            "fim_ok": ("Photos updated", "Photo recapture done."),
            "fim_erro": ("Something went wrong", "The photo recapture stopped with an error."),
            "fim_sem_sessao": ("No session", "The helper account dropped — check the accounts in the Bots app."),
            "fim_parado": ("Stopped", "The photo recapture was stopped."),
        },
    },
    "conectar": {
        "pt": {
            "titulo": "Conectando Instagram",
            "inicio": ("Conectando Instagram", "Importando a sessão e validando o login…"),
            "fim_ok": ("Instagram conectado", "Sessão salva — já pode raspar o brechó."),
            "fim_erro": ("Deu ruim", "Não consegui conectar o Instagram."),
            "fim_sem_sessao": ("Sem sessão", "A sessão do Instagram expirou — reconecte no app."),
            "fim_parado": ("Parado", "A conexão do Instagram foi parada."),
        },
        "en": {
            "titulo": "Connecting Instagram",
            "inicio": ("Connecting Instagram", "Importing the session and checking the login…"),
            "fim_ok": ("Instagram connected", "Session saved — you can scrape now."),
            "fim_erro": ("Something went wrong", "Couldn't connect Instagram."),
            "fim_sem_sessao": ("No session", "The Instagram session expired — reconnect in the app."),
            "fim_parado": ("Stopped", "The Instagram connection was stopped."),
        },
    },
}


def _proc_info(params, lang="pt"):
    """Textos de exibição por TIPO de processo (raspagem x conectar Instagram) e IDIOMA.
    O app manda o idioma selecionado em params['lang'] (pt/en); usado no título da Live
    Activity / footer e nas notificações começou/terminou/parou."""
    p = params or {}
    tipo = "conectar" if p.get("import_cookies") else ("fotos" if p.get("modo") == "fotos" else "raspagem")
    idioma = lang if lang in ("pt", "en") else "pt"
    return _TEXTOS[tipo][idioma]


class Run:
    def __init__(self, params):
        self.id = f"run-{next(_counter)}"
        self.params = params or {}
        self.lang = self.params.get("lang") or "pt"   # idioma do app (notificações/LA)
        self.status = "iniciando"      # iniciando | rodando | finalizado | parado | erro | sem_sessao
        self.started_at = time.time()
        self.ended_at = None
        self.returncode = None
        self.progress = None
        self.saldo = None              # {novas, atualizadas, …} — do marcador [saldo]
        self.bloqueio = False          # detectou bloqueio do IG no log?
        self.linhas = deque(maxlen=settings.MAX_LOG_LINES)
        self.subs = set()              # set[asyncio.Queue]
        self.proc = None
        self._ult_push_pct = -100      # throttle dos pushes de progresso
        self._ult_push_t = 0.0
        self.bots_id = None            # id da run no backend dos Bots (só raspagem via emulador)
        self._pump_task = None         # task do _pump_emulador (pra cancelar no stop imediato)
        self.la_token = None           # push token da Live Activity (o app manda)
        self.la_bundle = None          # bundle do BUILD que criou a LA (.dev/.preview) — vira o tópico do APNs
        self._ult_la_pct = -100        # throttle (leve) dos updates da Live Activity
        self._ult_la_t = 0.0
        self._ult_la_status = None      # última linha de status refletida na LA (fase de abertura)
        self._ult_la_status_t = 0.0
        self.titulo = _proc_info(self.params, self.lang)["titulo"]   # nome do processo (LA/footer)

    def info(self):
        return {
            "id": self.id, "status": self.status,
            "started_at": self.started_at, "ended_at": self.ended_at,
            "returncode": self.returncode, "params": self.params,
            "linhas": len(self.linhas), "progress": self.progress,
            "titulo": self.titulo,
        }

    async def emitir(self, linha):
        self.linhas.append(linha)
        for q in list(self.subs):
            try:
                q.put_nowait(linha)
            except Exception:
                pass


class RunManager:
    def __init__(self):
        self.runs = {}
        # acumula o stats (eventos peça-a-peça + números) de cada lote do POST /scraper/emulador/posts,
        # por run dos Bots (run_id que o device manda). Consumido no _finalizar_emulador pra logar o
        # peça-a-peça + "resumo:" igual à raspagem antiga. {bots_run_id: {eventos:[...], novas, ...}}
        self._emu_stats = {}

    def acumular_emulador(self, bots_run_id, stats):
        """Soma os números e concatena os `eventos` de cada lote que o device envia (são ~7 lotes
        por raspagem). Chamado pelo handler do POST /scraper/emulador/posts."""
        if not bots_run_id or not isinstance(stats, dict):
            return
        acc = self._emu_stats.setdefault(str(bots_run_id), {"eventos": []})
        for k, v in stats.items():
            if k == "eventos":
                acc["eventos"].extend(v or [])
            elif isinstance(v, bool):
                acc.setdefault(k, v)
            elif isinstance(v, (int, float)):
                acc[k] = acc.get(k, 0) + v

    async def start(self, params):
        run = Run(params)
        self.runs[run.id] = run
        # antes de raspar: reescreve a planilha do worker A PARTIR DO APP (espelho sincronizado)
        # — o worker usa só pro boundary; quem é a fonte da verdade é o app.
        if not (params or {}).get("import_cookies"):
            try:
                await asyncio.to_thread(scraper.sincronizar_planilha)
            except Exception as e:
                print(f"[sync] falha ao espelhar planilha: {e}", flush=True)
        cmd = [settings.PYTHON_BIN] + scraper.montar_cmd(params)
        env = {**os.environ, "PYTHONUTF8": "1", "PYTHONUNBUFFERED": "1"}
        # HEADED sob display virtual (Xvfb) em vez de headless. MEDIDO no Bots e confirmado aqui:
        # o Chromium HEADLESS pega o 1º lote (~68 posts) e o carregador infinito do IG NÃO
        # re-engata — a run morre "incompleta" (precisava rodar 2-3x pra pegar). Com janela
        # (mesmo virtual) o feed desce inteiro numa run só. xvfb-run cria um display descartável
        # por run (sem daemon, sem sudo). Liga por padrão; desliga com BRECHO_XVFB=0 no .env.
        # Import de cookie é só validação HTTP (sem browser) → não precisa de Xvfb nem headed.
        eh_import = bool((params or {}).get("import_cookies"))
        if not eh_import and os.environ.get("BRECHO_XVFB", "1").strip().lower() not in ("0", "false", "no", "off"):
            cmd = ["xvfb-run", "-a"] + cmd
            env["IG_HEADLESS"] = "0"
        run.proc = await asyncio.create_subprocess_exec(
            *cmd, cwd=str(scraper.worker_dir()),
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT, env=env,
            # grupo de processo PRÓPRIO: o worker vira `xvfb-run → python → chromium → Xvfb`.
            # Sem isto, o stop mataria só o xvfb-run e deixaria python/chromium/Xvfb ÓRFÃOS
            # comendo CPU (o problema clássico do server 1). Com o grupo, o stop mata a árvore.
            start_new_session=True,
        )
        run.status = "rodando"
        asyncio.create_task(self._pump(run))
        asyncio.create_task(self._push_inicio(run))
        return run

    async def _pump(self, run):
        try:
            async for raw in run.proc.stdout:
                linha = raw.decode("utf-8", "replace").rstrip("\r\n")
                if linha.startswith("[progress]"):
                    p = _parse_progress(linha)
                    if p:
                        run.progress = p
                        await self._maybe_push_progresso(run)
                elif "[saldo]" in linha:
                    s = _parse_saldo(linha)
                    if s:
                        run.saldo = s
                if "⛔" in linha or "BLOQUEIO" in linha:
                    run.bloqueio = True
                await run.emitir(linha)
                await self._maybe_status_la(run, linha)
        except Exception as e:
            await run.emitir(f"[backend] erro lendo saída: {e}")
        run.returncode = await run.proc.wait()
        run.ended_at = time.time()
        if run.status != "parado":
            if run.returncode == 0:
                run.status = "finalizado"
            elif run.returncode == 3:
                run.status = "sem_sessao"   # worker saiu com code 3 = sessão do IG expirou
            else:
                run.status = "erro"

        # raspagem OK → dry-run: PRÉVIA do app (rollback); normal: importa de verdade
        if run.status == "finalizado" and not run.params.get("import_cookies"):
            dry = bool(run.params.get("dry_run"))
            try:
                st = await asyncio.to_thread(scraper.preview_import if dry else scraper.importar)
                if st:
                    evs = st.get("eventos", [])
                    for ev in evs[:120]:
                        await run.emitir(ev)
                    if len(evs) > 120:
                        await run.emitir(f"   … e mais {len(evs) - 120} peças")
                    nada = "  (nada gravado)" if dry else ""
                    conf = f", {st['conferidas']} sem mudança" if st.get("conferidas") else ""
                    await run.emitir(
                        f"resumo: {st['novas']} novas, {st.get('reconciliadas', 0)} relacionadas, "
                        f"{st['atualizadas']} atualizadas, {st.get('recem_vendidas', 0)} venderam{conf}{nada}")
                    if not dry:
                        run.saldo = {"novas": st["novas"], "atualizadas": st["atualizadas"],
                                     "reconciliadas": st.get("reconciliadas", 0),
                                     "recem_vendidas": st.get("recem_vendidas", 0)}
                        try:      # re-espelha a planilha com o app já atualizado
                            await asyncio.to_thread(scraper.sincronizar_planilha)
                        except Exception:
                            pass
            except Exception as e:
                await run.emitir(f"[backend] falha no import/simulação do app: {e}")

        await run.emitir(f"[backend] processo terminou (status={run.status}, code={run.returncode})")
        self._gravar_historico(run)
        await self._push_fim(run)
        for q in list(run.subs):       # sinaliza fim (None) aos assinantes
            try:
                q.put_nowait(None)
            except Exception:
                pass

    # ───────────── raspagem pelo EMULADOR (espelha a run do backend dos Bots) ─────────────
    async def start_emulador(self, params):
        """Dispara a raspagem no EMULADOR (via backend dos Bots) e cria um Run do brechó que
        ESPELHA a run remota. Assim a tela de Run do app (WS /runs/{id}/logs + GET /runs/{id})
        funciona IGUAL à raspagem antiga do Playwright, sem mudança no app. Devolve o Run."""
        p = params or {}
        run = Run(p)                    # mesma classe/forma do self.start; titulo = "Raspando o brechó"
        #                                 (ou "Recapturando fotos" no modo fotos)
        self.runs[run.id] = run
        try:
            resp = await asyncio.to_thread(
                scraper.enfileirar_raspagem_emulador, bool(p.get("full")), p.get("lang") or "pt",
                p.get("modo"))
            bots_id = resp["id"]
        except Exception as e:
            run.status = "erro"
            run.ended_at = time.time()
            await run.emitir(f"[backend] não consegui iniciar a raspagem no emulador: {e}")
            self._gravar_historico(run)
            return run
        run.status = "rodando"
        run.bots_id = bots_id          # guarda pra o stop poder parar a run de verdade nos Bots
        await run.emitir("─── Preparação ───")
        run._pump_task = asyncio.create_task(self._pump_emulador(run, bots_id))
        asyncio.create_task(self._push_inicio(run))
        return run

    async def _pump_emulador(self, run, bots_id):
        """Faz polling do GET /runs/{bots_id} do backend dos Bots e reflete no Run do brechó:
        barra de progresso (run.progress + Live Activity) e TODAS as linhas novas do log do módulo
        (WS). Quando a run remota termina, fecha o Run igual ao fim do _pump (notificação,
        histórico e sinal de fim pros assinantes). Teto de ~45 min pra não acompanhar pra sempre
        (o job "fotos" passa pelo brechó INTEIRO, ~2h pra ~390 peças → teto de 6h)."""
        TERMINAIS = {"finalizado", "erro", "parado", "sem_sessao"}
        teto_min = 6 * 60 if run.params.get("modo") == "fotos" else 45
        deadline = time.time() + teto_min * 60
        cauda = []                      # últimas linhas do log dos Bots já repassadas (acha onde parei)
        try:
            while time.time() < deadline:
                await asyncio.sleep(3)
                try:
                    data = await asyncio.to_thread(scraper.obter_run_bots, bots_id)
                except Exception:
                    continue            # rede/timeout pontual → tenta de novo no próximo ciclo
                if not isinstance(data, dict):
                    continue

                p = data.get("progress") or {}
                if p.get("total"):
                    run.progress = {"done": int(p.get("done") or 0), "total": int(p["total"]),
                                    "label": p.get("label") or ""}
                    await self._maybe_push_progresso(run)      # atualiza a Live Activity

                # repassa as linhas NOVAS do log (conta escolhida, alvos, fallback de conta, peça a
                # peça, avisos). Antes só ia o progresso e a tela do app ficava muda.
                cauda = await self._repassar_log_bots(run, data, cauda)

                status = data.get("status")
                if status in TERMINAIS:
                    run.status = status
                    saldo = _extrair_saldo_bots(data)          # best-effort (quase sempre vazio)
                    if saldo:
                        run.saldo = saldo
                    await self._finalizar_emulador(run, bots_id)
                    return
        except Exception as e:
            await run.emitir(f"[backend] erro acompanhando a raspagem no emulador: {e}")

        # saiu do laço sem a run remota terminar (teto de tempo / exceção) → fecha mesmo assim
        if run.ended_at is None:
            if run.status not in TERMINAIS:
                run.status = "erro"
            await run.emitir("[backend] parei de acompanhar a raspagem (tempo limite).")
            await self._finalizar_emulador(run, bots_id)

    _CAUDA = 25                         # quantas linhas já repassadas guardo pra achar onde parei

    @staticmethod
    def _txt_linha(item):
        if isinstance(item, dict):
            item = item.get("linha") or item.get("msg") or item.get("texto") or ""
        return str(item or "").rstrip()

    async def _repassar_log_bots(self, run, data, cauda):
        """Repassa pro Run do brechó as linhas do log da run dos Bots que ainda não foram.
        O GET dos Bots manda `log` = cabeçalho (30 1ªs linhas, fixas) + as últimas 300 do resto, e
        `linhas` = tamanho do buffer (TRAVA em 3000) — então índice não serve. Acha onde parei pelo
        CONTEÚDO: procura a sequência das últimas linhas já repassadas (`cauda`) na parte contínua do
        log e repassa só o que vem depois. `[progress]` vira 2 linhas: a crua (o app usa pra barra e
        não lista) + "label done/total" (aparece no log). Marcadores internos ([saldo], [conta], "===")
        ficam de fora. Devolve a nova cauda."""
        log = data.get("log")
        if not isinstance(log, list):
            return cauda
        txt = [self._txt_linha(x) for x in log]
        linhas = data.get("linhas")
        partido = isinstance(linhas, int) and linhas > len(txt) and len(txt) > 30
        stream = txt[30:] if partido else txt   # log partido: só a parte depois do cabeçalho é contínua
        if not cauda:
            novas = txt                          # 1º poll com conteúdo: o log ainda é a run inteira
        else:
            novas = stream                       # não achou onde parei (>300 linhas num poll): manda a cauda
            k = min(len(cauda), len(stream))
            bloco = cauda[-k:] if k else []
            if bloco:
                fim = next((i for i in range(len(stream) - k, -1, -1) if stream[i:i + k] == bloco), None)
                if fim is not None:
                    novas = stream[fim + k:]
        for s in novas:
            if not s:
                continue
            if s.startswith("[progress]"):
                pr = _parse_progress(s)
                if pr:
                    await run.emitir(s)
                    await run.emitir(f"{pr['label']} {pr['done']}/{pr['total']}".strip())
                continue
            if s.startswith(("[saldo]", "[conta]")) or s.lstrip().startswith("==="):
                continue
            # linhas do agente dos Bots: as de início/fim do job repetem as nossas → fora; as de
            # conta viram "rótulo ··· valor" (o app desenha alinhado, em vez do texto corrido)
            if s.startswith(("[backend] job enfileirado", "[backend] job do emulador terminou")):
                continue
            for pref, rot in (("contas auxiliares na vez:", "Contas na vez"),
                              ("contas que falharam antes:", "Contas que falharam")):
                if s.lower().startswith(pref):
                    s = f"{rot} ··· {s[len(pref):].strip()}"
                    break
            if s.startswith("[espera]"):
                s = "aguardando: " + s[len("[espera]"):].strip()
            await run.emitir(s)
        return (list(cauda) + list(novas))[-self._CAUDA:]

    async def _finalizar_emulador(self, run, bots_id=None):
        """Fecha o Run espelhado igual ao fim do _pump: LOGA o peça-a-peça + 'resumo:' (igual à
        raspagem antiga), marca o término, grava no histórico, notifica o celular (push + encerra a
        Live Activity) e sinaliza (None) os assinantes do WS pra encerrarem a conexão. Idempotente:
        se já fechou (ended_at setado), não faz nada."""
        if run.ended_at is not None:
            return
        run.ended_at = time.time()
        # peça-a-peça + resumo: o POST /scraper/emulador/posts acumulou os eventos/números de cada
        # lote por run_id dos Bots. Emite o que foi processado (inclusive se foi PARADO no meio).
        st = self._emu_stats.pop(str(bots_id), None) if bots_id else None
        fotos = run.params.get("modo") == "fotos"
        if st and fotos and run.status in ("finalizado", "parado"):
            # job "fotos": só imagens — resumo próprio (o POST /scraper/emulador/fotos acumulou)
            await run.emitir("─── Resumo ───")
            await run.emitir(f"Fotos salvas ··· {st.get('imagens', 0)}")
            for rot, k in (("Travadas (puladas)", "travadas"), ("Sem peça no app", "sem_peca"),
                           ("Inválidas", "invalidas")):
                if st.get(k):
                    await run.emitir(f"{rot} ··· {st[k]}")
            run.saldo = {"imagens": st.get("imagens", 0)}
        elif st and run.status in ("finalizado", "parado"):
            # as linhas peça a peça ("O que mudou") o próprio módulo já loga e chegam pelo repasse —
            # aqui só o resumo, em "rótulo ··· valor"
            await run.emitir("─── Resumo ───")
            for rot, k in (("Novas", "novas"), ("Relacionadas", "reconciliadas"),
                           ("Atualizadas", "atualizadas"), ("Venderam", "recem_vendidas"),
                           ("Sem mudança", "conferidas")):
                await run.emitir(f"{rot} ··· {st.get(k, 0)}")
            if st.get("a_conferir"):
                await run.emitir(f"Conferir na mão ··· {st['a_conferir']} (peça travada com post dizendo vendido)")
            run.saldo = {"novas": st.get("novas", 0), "atualizadas": st.get("atualizadas", 0),
                         "reconciliadas": st.get("reconciliadas", 0),
                         "recem_vendidas": st.get("recem_vendidas", 0),
                         "conferidas": st.get("conferidas", 0)}
        fim = {"finalizado": "concluída", "parado": "parada", "erro": "com erro",
               "sem_sessao": "sem sessão"}.get(run.status, run.status)
        await run.emitir(f"[backend] {'recaptura das fotos' if fotos else 'raspagem'} {fim}.")
        self._gravar_historico(run)
        await self._push_fim(run)
        for q in list(run.subs):
            try:
                q.put_nowait(None)
            except Exception:
                pass

    def _gravar_historico(self, run):
        """Persiste o saldo da raspagem no histórico (pula import de cookies)."""
        if run.params.get("import_cookies"):
            return
        history.registrar({
            "id": run.id, "bot": "brecho",
            "dry_run": bool(run.params.get("dry_run")),
            "started_at": run.started_at, "ended_at": run.ended_at,
            "duracao_s": int((run.ended_at or run.started_at) - run.started_at),
            "status": run.status, "bloqueio": run.bloqueio,
            "saldo": run.saldo or {},
        })

    async def _push_inicio(self, run):
        titulo, corpo = _proc_info(run.params, run.lang)["inicio"]
        try:
            await asyncio.to_thread(
                notify.enviar, titulo, corpo, {"type": "start", "runId": run.id})
        except Exception:
            pass

    async def _maybe_push_progresso(self, run):
        """Atualiza a barra viva da Live Activity (throttle leve). SEM LA, não manda NADA:
        o progresso aparece na tela da Run (logs ao vivo + barra) e no fim vem a notificação
        de conclusão. Antes, sem LA, isto mandava notificação de PROGRESSO a cada ~15% — poluía
        o lock screen com um monte de '... 14% descendo o feed'. Removido de propósito."""
        p = run.progress
        if not p or not p.get("total") or not run.la_token:
            return
        pct = max(0, min(100, round(p["done"] / p["total"] * 100)))
        if pct >= 100:
            return
        agora = time.time()
        if pct - run._ult_la_pct < 3 and (agora - run._ult_la_t) < 3:
            return
        run._ult_la_pct = pct
        run._ult_la_t = agora
        try:
            ok, det = await asyncio.to_thread(
                liveactivity.atualizar, run.la_token, pct,
                p["done"], p["total"], p.get("label", ""), run.la_bundle)
            print(f"[la] update {run.id} {pct}% -> ok={ok} {det}", flush=True)
        except Exception as e:
            print(f"[la] update {run.id} EXC {e}", flush=True)

    async def _maybe_status_la(self, run, linha):
        """Enquanto NÃO há progresso real (fase de abrir navegador/logar/carregar feed —
        ~70s em que o scraper ainda não emite [progress]), reflete a última linha de
        status na Live Activity, pra ela não ficar 'começando' parada. Como quem empurra
        é o SERVER via APNs, isso atualiza no lock screen mesmo com o app fechado."""
        if not run.la_token or run.progress is not None:
            return
        txt = (linha or "").strip()
        # só frases de status "humanas": ignora marcadores ([progress]/[saldo]/[backend]) e URLs
        if not txt or txt.startswith("[") or "://" in txt:
            return
        agora = time.time()
        if txt == run._ult_la_status or (agora - run._ult_la_status_t) < 6:
            return
        run._ult_la_status = txt
        run._ult_la_status_t = agora
        try:
            # total 0 = modo "começando" no widget → mostra só o label (sem barra/%)
            ok, det = await asyncio.to_thread(
                liveactivity.atualizar, run.la_token, 0, 0, 0, txt[:40], run.la_bundle)
            print(f"[la] status {run.id} '{txt[:40]}' -> ok={ok} {det}", flush=True)
        except Exception:
            pass

    async def _push_fim(self, run):
        """Notifica o celular quando a run termina (raspagem OU conexão do Insta)."""
        info = _proc_info(run.params, run.lang)
        # encerra a Live Activity (a barra some do lock screen alguns segundos depois)
        if run.la_token:
            p = run.progress or {}
            try:
                ok, det = await asyncio.to_thread(
                    liveactivity.encerrar, run.la_token, 100,
                    p.get("done", 0), p.get("total", 0),
                    "concluído" if run.status == "finalizado"
                    else ("sem sessão" if run.status == "sem_sessao" else run.status),
                    run.la_bundle)
                print(f"[la] end {run.id} -> ok={ok} {det}", flush=True)
            except Exception as e:
                print(f"[la] end {run.id} EXC {e}", flush=True)
        if run.status == "sem_sessao":
            titulo, corpo = info["fim_sem_sessao"]
        elif run.status == "erro":
            titulo, corpo = info["fim_erro"]
        elif run.status == "parado":
            titulo, corpo = info["fim_parado"]
        else:
            titulo, corpo = info["fim_ok"]
        try:
            await asyncio.to_thread(notify.enviar, titulo, corpo, {"runId": run.id})
        except Exception:
            pass

    async def stop(self, run_id):
        run = self.runs.get(run_id)
        if not run:
            return False
        # raspagem no EMULADOR (sem subprocesso): para IMEDIATO do lado do app — marca parado, fecha
        # a run (push/histórico/WS) e cancela o acompanhamento; em PARALELO pede o stop no backend dos
        # Bots (a run de verdade no device), sem travar a resposta esperando a rede.
        if run.bots_id is not None:
            if run.ended_at is not None:
                return True            # já fechou
            if run.status in ("rodando", "iniciando"):
                run.status = "parado"
            if run._pump_task:
                run._pump_task.cancel()   # para de espelhar (não re-finaliza)
            asyncio.create_task(self._parar_bots_async(run, run.bots_id))
            await self._finalizar_emulador(run, run.bots_id)
            return True
        # raspagem antiga (Playwright): mata o subprocesso (árvore xvfb→python→chromium→Xvfb)
        if not run.proc:
            return False
        if run.proc.returncode is None:
            run.status = "parado"
            self._parar_gracioso(run.proc)
        return True

    async def _parar_bots_async(self, run, bots_id):
        """Pede o stop no backend dos Bots sem travar a resposta do /stop (a run do app já fechou)."""
        try:
            await asyncio.to_thread(scraper.parar_run_bots, bots_id)
        except Exception as e:
            await run.emitir(f"[backend] aviso: não confirmei o stop no emulador ({e}).")

    def _parar_gracioso(self, proc):
        """Manda SIGINT (= Ctrl+C) pro worker cair no `except KeyboardInterrupt` e sair LIMPO
        ('Interrompido' + fecha o browser no finally do playwright), em vez de SIGTERM que
        virava erro. Só escala pra SIGTERM e depois SIGKILL se ele teimar em não sair.

        Sinaliza o GRUPO inteiro (xvfb-run → python → chromium → Xvfb): com o Xvfb no meio,
        matar só o proc deixava chromium/Xvfb órfãos rodando (CPU presa no server 1)."""
        def _sinal(sig):
            try:
                os.killpg(os.getpgid(proc.pid), sig)      # o grupo inteiro
            except Exception:
                try:
                    proc.send_signal(sig)
                except Exception:
                    pass
        _sinal(signal.SIGINT)                     # Ctrl+C — saída limpa

        async def _escalar():
            await asyncio.sleep(10)                # tempo do KeyboardInterrupt rodar + fechar browser
            if proc.returncode is None:
                _sinal(signal.SIGTERM)
                await asyncio.sleep(6)
                if proc.returncode is None:
                    _sinal(signal.SIGKILL)        # chromium/Xvfb travado: mata na marra
        asyncio.create_task(_escalar())

    def listar(self):
        return [r.info() for r in self.runs.values()]

    def get(self, run_id):
        return self.runs.get(run_id)
