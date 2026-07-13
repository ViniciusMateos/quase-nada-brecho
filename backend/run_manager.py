"""
Gerenciador de execuções do scraper: roda o worker como subprocesso, captura o
stdout linha a linha e faz broadcast pros assinantes (WebSocket). Suporta parar.

Ao terminar uma raspagem de verdade (não import de cookies), importa a planilha
gerada pro SQLite — o dashboard passa a refletir as vendas reais.
"""
import asyncio
import itertools
import os
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


def _proc_info(params):
    """Textos de exibição por TIPO de processo (raspagem do brechó x conectar Instagram).
    Usado no título da Live Activity / footer e nas notificações começou/terminou/parou."""
    if (params or {}).get("import_cookies"):
        return {
            "titulo": "Conectando Instagram",
            "inicio": ("Conectando Instagram", "Importando a sessão e validando o login…"),
            "fim_ok": ("Instagram conectado", "Sessão salva — já pode raspar o brechó."),
            "fim_erro": ("Deu ruim", "Não consegui conectar o Instagram."),
            "fim_parado": ("Parado", "A conexão do Instagram foi parada."),
        }
    return {
        "titulo": "Raspando o brechó",
        "inicio": ("Raspando o brechó", "Começando a descer o feed… te mostro o progresso."),
        "fim_ok": ("Brechó atualizado", "Raspagem concluída e planilha sincronizada."),
        "fim_erro": ("Deu ruim", "O scraper do brechó parou com erro."),
        "fim_parado": ("Parado", "O scraper do brechó foi parado."),
    }


class Run:
    def __init__(self, params):
        self.id = f"run-{next(_counter)}"
        self.params = params or {}
        self.status = "iniciando"      # iniciando | rodando | finalizado | parado | erro
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
        self.la_token = None           # push token da Live Activity (o app manda)
        self.la_bundle = None          # bundle do BUILD que criou a LA (.dev/.preview) — vira o tópico do APNs
        self._ult_la_pct = -100        # throttle (leve) dos updates da Live Activity
        self._ult_la_t = 0.0
        self._ult_la_status = None      # última linha de status refletida na LA (fase de abertura)
        self._ult_la_status_t = 0.0
        self.titulo = _proc_info(self.params)["titulo"]   # nome do processo (LA/footer)

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
        run.proc = await asyncio.create_subprocess_exec(
            *cmd, cwd=str(scraper.worker_dir()),
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT, env=env,
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
            run.status = "finalizado" if run.returncode == 0 else "erro"

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
        titulo, corpo = _proc_info(run.params)["inicio"]
        try:
            await asyncio.to_thread(
                notify.enviar, titulo, corpo, {"type": "start", "runId": run.id})
        except Exception:
            pass

    async def _maybe_push_progresso(self, run):
        """Push de progresso com a barrinha, com throttle (>=15% ou >=25s; nunca 100%)."""
        p = run.progress
        if not p or not p.get("total"):
            return
        pct = max(0, min(100, round(p["done"] / p["total"] * 100)))
        if pct >= 100:
            return
        agora = time.time()
        # Com Live Activity: atualiza a barra viva (throttle leve, sem poluir) e NÃO
        # manda notificação de progresso — a barra viva já é o indicador ao vivo.
        if run.la_token:
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
            return
        # Sem Live Activity → notificação de progresso com throttle (fallback).
        if pct - run._ult_push_pct < 15 and (agora - run._ult_push_t) < 25:
            return
        run._ult_push_pct = pct
        run._ult_push_t = agora
        barra = notify.barra_progresso(p["done"], p["total"])
        label = p.get("label") or f"{p['done']}/{p['total']}"
        try:
            await asyncio.to_thread(
                notify.enviar, run.titulo, f"{barra}  ·  {label}",
                {"type": "progress", "runId": run.id, "pct": pct,
                 "done": p["done"], "total": p["total"], "label": p.get("label", "")})
        except Exception:
            pass

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
        info = _proc_info(run.params)
        # encerra a Live Activity (a barra some do lock screen alguns segundos depois)
        if run.la_token:
            p = run.progress or {}
            try:
                ok, det = await asyncio.to_thread(
                    liveactivity.encerrar, run.la_token, 100,
                    p.get("done", 0), p.get("total", 0),
                    "concluído" if run.status == "finalizado" else run.status,
                    run.la_bundle)
                print(f"[la] end {run.id} -> ok={ok} {det}", flush=True)
            except Exception as e:
                print(f"[la] end {run.id} EXC {e}", flush=True)
        if run.status == "erro":
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
        if not run or not run.proc:
            return False
        if run.proc.returncode is None:
            run.status = "parado"
            try:
                run.proc.terminate()
            except Exception:
                pass
        return True

    def listar(self):
        return [r.info() for r in self.runs.values()]

    def get(self, run_id):
        return self.runs.get(run_id)
