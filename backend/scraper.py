"""
Ponte com o worker `brecho-tracker` (Playwright) que raspa o Instagram do brechó.

Responsabilidades:
  - montar a linha de comando do worker a partir dos params da API
  - salvar os cookies do IG (sessão) no dir do worker
  - depois de uma raspagem, importar a planilha gerada (brecho_tracker.xlsx)
    pra dentro do SQLite (peças com origem='scraper'), pro dashboard refletir
    as vendas reais.

O worker em si (main.py, iglib.py, parser.py, planilha.py) é o mesmo que rodava
no Quase Nada Bots — foi movido pra cá sem alteração.
"""
import json
import subprocess
from datetime import date, datetime

import settings

COOKIES_FILE = "imported_cookies.json"
META_FILE = "imported_cookies.meta.json"
PLANILHA = "brecho_tracker.xlsx"

# alfabeto base64 dos shortcodes do Instagram + época (ms). O PK do post embute o
# timestamp de criação nos bits altos, então dá pra recuperar a data OFFLINE a partir
# do code. Usado como fallback quando o device do emulador não manda taken_at — sem
# isso, postado_em fica NULL e as peças caem num "drop fantasma" sem data (bug do emulador).
_IG_ALPH = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
_IG_EPOCH_MS = 1314220021721


def _ts_do_code(code):
    """shortcode do IG -> timestamp Unix (segundos) do post, ou None se não der."""
    try:
        mid = 0
        for ch in code:
            mid = mid * 64 + _IG_ALPH.index(ch)
        ts = ((mid >> 23) + _IG_EPOCH_MS) // 1000
        # sanidade: entre 2015 e agora (+1 dia de folga)
        import time as _t
        if 1420070400 <= ts <= int(_t.time()) + 86400:
            return ts
    except Exception:
        pass
    return None

# posição das colunas na aba "peças" (mesmo layout gerado pelo worker)
COL = {"code": 0, "drop": 1, "item": 3, "nome": 4, "compra": 5, "venda": 6,
       "tamanho": 7, "largura": 8, "comprimento": 9, "circunferencia": 10,
       "condicao": 11, "vendida": 12, "url": 13, "imagem_url": 15, "numero": 16}


def worker_dir():
    return settings.WORKER_DIR


def montar_cmd(params):
    """Traduz params (dict da API) nos argumentos da CLI do worker."""
    p = params or {}
    if p.get("import_cookies"):                 # conectar IG: só importa e sai
        return ["main.py", "--import-cookies", str(p["import_cookies"])]
    args = ["main.py"]
    if p.get("dry_run"):
        args.append("--dry-run")
    if p.get("full"):
        args.append("--full")
    if p.get("rematch"):
        args.append("--rematch")
    return args


def salvar_cookies(cookies):
    """Grava os cookies (lista, formato Cookie-Editor) no dir do worker. Devolve o
    nome do arquivo (relativo — a run roda com cwd = dir do worker)."""
    (settings.WORKER_DIR / COOKIES_FILE).write_text(
        json.dumps(cookies, ensure_ascii=False, indent=2), encoding="utf-8")
    return COOKIES_FILE


def salvar_meta(usuario):
    """Guarda QUEM conectou (só o @usuário + quando) pro app mostrar no cartão de status.
    Login/senha NUNCA vêm pro servidor — o @usuário é público e serve só de rótulo."""
    if not usuario:
        return
    (settings.WORKER_DIR / META_FILE).write_text(
        json.dumps({"usuario": str(usuario).lstrip("@").strip(),
                    "conectado_em": datetime.now().strftime("%Y-%m-%d %H:%M:%S")},
                   ensure_ascii=False), encoding="utf-8")


def ler_meta():
    f = settings.WORKER_DIR / META_FILE
    if not f.exists():
        return {}
    try:
        return json.loads(f.read_text(encoding="utf-8"))
    except Exception:
        return {}


def tem_sessao():
    """Existe sessão salva com sessionid? (NÃO bate no IG — só olha o arquivo, instantâneo)."""
    f = settings.WORKER_DIR / COOKIES_FILE
    if not f.exists():
        return False
    try:
        ck = json.loads(f.read_text(encoding="utf-8"))
        if isinstance(ck, dict) and "cookies" in ck:
            ck = ck["cookies"]
        return any(str(c.get("name")) == "sessionid" and c.get("value") for c in ck)
    except Exception:
        return False


def checar_sessao():
    """Roda o worker em modo --check-session (valida a sessão salva AO VIVO, sem raspar).
    Devolve 'ok' | 'sem_sessao' | 'erro'. Bloqueante (abre um mini-browser ~10-20s) —
    chame via asyncio.to_thread pra não travar o event loop."""
    if not tem_sessao():
        return "sem_sessao"
    try:
        r = subprocess.run(
            [str(settings.PYTHON_BIN), "main.py", "--check-session"],
            cwd=str(settings.WORKER_DIR), capture_output=True, text=True, timeout=150)
    except subprocess.TimeoutExpired:
        return "erro"
    if r.returncode == 0:
        return "ok"
    if r.returncode == 3:
        return "sem_sessao"
    return "erro"


# ─────────────────── import da planilha → SQLite ─────────────────
def _data_iso(v):
    if isinstance(v, (datetime, date)):
        return v.strftime("%Y-%m-%d")
    return str(v) if v else None


def _limpo(v):
    return None if v in (None, "", "N/A") else v


def _cel_int(r, i):
    """Lê uma célula como int (None se vazia ou fora do range — planilha antiga sem a coluna)."""
    if i < len(r) and r[i] not in (None, ""):
        try:
            return int(r[i])
        except (TypeError, ValueError):
            return None
    return None


def _post_url(code):
    return f"https://www.instagram.com/p/{code}/"


def ler_planilha():
    """Lê a aba 'peças' do brecho_tracker.xlsx. Devolve lista de dicts (ou [])."""
    import openpyxl
    path = settings.WORKER_DIR / PLANILHA
    if not path.exists():
        return []
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    if "peças" not in wb.sheetnames:
        wb.close()
        return []
    ws = wb["peças"]
    linhas = ws.iter_rows(values_only=True)
    next(linhas, None)                          # pula cabeçalho
    out = []
    for r in linhas:
        if not r or not r[COL["code"]]:
            continue
        out.append({
            "code": str(r[COL["code"]]),
            "drop": _data_iso(r[COL["drop"]]),
            "item": r[COL["item"]],
            "nome": r[COL["nome"]],
            "compra": r[COL["compra"]],
            "venda": r[COL["venda"]],
            "tamanho": r[COL["tamanho"]],
            "largura": r[COL["largura"]],
            "comprimento": r[COL["comprimento"]],
            "circunferencia": r[COL["circunferencia"]],
            "condicao": r[COL["condicao"]],
            "vendida": str(r[COL["vendida"]]).strip().lower() == "sim",
            "imagem_url": _limpo(r[COL["imagem_url"]]) or _post_url(r[COL["code"]]),
            "numero": _cel_int(r, COL["numero"]),   # #p<num> pro match no app
        })
    wb.close()
    return out


_VAZIO = {"novas": 0, "atualizadas": 0, "reconciliadas": 0, "recem_vendidas": 0, "eventos": [], "total": 0}


def _ler_pecas_dump():
    """Peças parseadas que o worker entregou (output/pecas.json)."""
    import json
    f = settings.WORKER_DIR / "output" / "pecas.json"
    if not f.exists():
        return []
    try:
        return json.loads(f.read_text(encoding="utf-8"))
    except Exception:
        return []


def importar():
    """Aplica as peças raspadas no app (SQLite) — o app é a fonte da verdade. Devolve stats."""
    import pecas
    items = _ler_pecas_dump()
    return pecas.upsert_scraper(items) if items else dict(_VAZIO)


def preview_import():
    """DRY-RUN: SIMULA o upsert no app com rollback — devolve o que MUDARIA (casadas por #p,
    novas, atualizadas, venderam) sem gravar nada."""
    import pecas
    items = _ler_pecas_dump()
    return pecas.upsert_scraper(items, preview=True) if items else dict(_VAZIO)


def sincronizar_planilha():
    """Reescreve a planilha do worker A PARTIR DO APP (fonte da verdade) — pra ficarem
    SINCRONIZADAS. Peça manual (sem code) entra com code='p<num>'. O worker usa isso só pra
    calcular o boundary (onde parar de descer o feed); quem reconcilia é o app. Chamado antes
    de cada raspagem e depois de importar."""
    import json
    from datetime import datetime
    import openpyxl
    import pecas
    ps = pecas.listar()["pecas"]
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "peças"
    ws.append(["code", "drop", "imagem", "item", "nome", "compra", "venda", "tamanho",
               "largura", "comprimento", "circunferencia", "condicao", "vendida", "url",
               "atualizado_em", "imagem_url", "numero", "so_manual"])
    agora = datetime.now().strftime("%Y-%m-%d %H:%M")
    for p in ps:
        real = p.get("code")
        code = real or (f"p{p['num']}" if p.get("num") else None)
        if not code:
            continue
        circ = None
        try:
            for m in json.loads(p.get("medida") or "[]"):
                if "circ" in (m.get("tipo") or "").lower():
                    circ = m.get("valor")
        except Exception:
            pass
        ws.append([
            code, p.get("postado_em"), None, p.get("item"), p.get("nome"),
            p.get("compra"), p.get("venda"), p.get("tamanho"),
            p.get("largura"), p.get("comprimento"), circ, p.get("condicao"),
            "sim" if p.get("vendida") else "não",
            _post_url(real) if real else None,
            agora, p.get("imagem_url"), p.get("num"), 1 if p.get("so_manual") else 0,
        ])
    wb.save(str(settings.WORKER_DIR / PLANILHA))
    return len(ps)


# ─────────────── raspagem pelo EMULADOR (conta auxiliar) ───────────────
def boundary_emulador():
    """Até onde o device precisa descer o feed: o menor #p entre as peças NÃO vendidas — tudo
    com num menor já está 100% vendido (o device para ao cruzar). Também devolve a data mais
    antiga de peça disponível (boundary por drop). Em --full o device ignora isso."""
    import pecas
    disp = [p for p in pecas.listar()["pecas"] if not p.get("vendida")]
    min_num = min((p["num"] for p in disp if p.get("num")), default=None)
    datas = [p.get("postado_em") for p in disp if p.get("postado_em")]
    return {"min_num": min_num, "boundary_drop": (min(datas) if datas else None)}


def alvos_emulador(n_recentes=40):
    """O que o device busca no INÍCIO da raspagem esperta (sem descer o feed inteiro) —
    devolvido por GET /scraper/emulador/alvos pra NÃO inflar os params do job:
      - disponiveis: peças NÃO vendidas que têm post (code). O device abre CADA uma pelo link
        (/p/<code>/), lê a legenda e vê se virou "vendido". [{code, num}]
      - recentes: codes dos posts mais novos que o app já conhece. O device lê o feed do TOPO
        e PARA no 1º code conhecido (dali pra trás é tudo conhecido) → só raspa o que é NOVO.
      - sem_link: #p das peças NÃO vendidas SEM code mas dentro de drop PUBLICADO = postadas, só
        que o device nunca pegou o link (fase B não abre). A fase A NÃO para no 1º conhecido
        enquanto faltar alguma: desce até achar a última (casa por #p) e aí para — drop 100% vendido
        abaixo dela nunca é relido. Peça sem drop = rascunho (não postada) → fica de fora.
      - conhecidos: #p de toda peça já raspada (tem code). A fase A reconhece post conhecido só
        pela legenda (leitura leve, sem print nem copiar-link) enquanto desce."""
    import pecas
    from db import conn
    ps = pecas.listar()["pecas"]
    # venda = preço atual no app: o device compara com o R$ do post e já mostra AO VIVO no log
    # "ATUALIZADA #pN · preço R$ x → R$ y" (quem grava de verdade continua sendo o upsert)
    disponiveis = [{"code": p["code"], "num": p.get("num"), "venda": p.get("venda")}
                   for p in ps if p.get("code") and not p.get("vendida")]
    com_code = [p for p in ps if p.get("code")]
    com_code.sort(key=lambda p: (p.get("postado_em") or "", p.get("num") or 0), reverse=True)
    recentes = [p["code"] for p in com_code[:n_recentes]]
    with conn() as c:
        publicados = {r["id"] for r in c.execute("SELECT id FROM drops WHERE status = 'publicado'")}
    sem_link_ps = [p for p in ps
                   if not p.get("code") and not p.get("vendida") and p.get("num")
                   and p.get("drop_id") in publicados]
    sem_link = [p["num"] for p in sem_link_ps]
    conhecidos = [p["num"] for p in com_code if p.get("num")]
    # profundidade = até onde a fase A desce atrás delas: nº de posts do topo até o drop MAIS ANTIGO
    # que tem peça sem link à venda (+ folga pros posts de divulgação, que não viram peça). Drop
    # mais antigo que isso não é relido. Se não achar a peça até lá, desiste dela nessa run.
    profundidade = None
    datas = [p.get("postado_em") or p.get("drop_data") for p in sem_link_ps]
    datas = [d for d in datas if d]
    if datas:
        lim = min(datas)
        n = sum(1 for p in ps if (p.get("postado_em") or p.get("drop_data") or "") >= lim)
        profundidade = int(n * 1.2) + 15
    return {"disponiveis": disponiveis, "recentes": recentes, "sem_link": sem_link,
            "conhecidos": conhecidos, "profundidade_sem_link": profundidade}


def reconciliar_emulador(posts, limpar_imagem=False):
    """Recebe os posts raspados PELO EMULADOR (conta auxiliar lendo o perfil no app) e
    reconcilia no app REUSANDO o mesmo parser e o mesmo upsert por code do Playwright. A foto
    é o print recortado (base64) — gravada como arquivo local e apontada pela peça (sem CDN).

    posts: [{code, taken_at?, legenda, imagem_b64?}]. Devolve stats (+ imagens salvas)."""
    import base64
    import sys
    import pecas
    if str(settings.WORKER_DIR) not in sys.path:
        sys.path.insert(0, str(settings.WORKER_DIR))
    import parser   # o MESMO parser da legenda do worker (só depende de `re`)
    import html as _html
    import re as _re

    itens, imagens = [], {}
    for p in (posts or []):
        code = p.get("code")
        # DEFESA: o device deve mandar a legenda já limpa, mas garante aqui também —
        # decodifica entidades (&#10;, &amp;…) e tira o prefixo "<usuário> | ". Sem isso, as
        # quebras vêm como "&#10;", o parser não acha as linhas e o NOME vira a legenda inteira
        # (bug que corrompeu 80 nomes na 1ª rodada do emulador).
        leg = _html.unescape(p.get("legenda") or "")
        leg = _re.sub(r"^\s*@?brechoquasenadaa\s*\|\s*", "", leg, flags=_re.I)
        # taken_at do device OU, se faltar, derivado do próprio code (o PK embute a data).
        # Garante que toda peça do emulador tenha postado_em — nada vai pro "drop fantasma".
        taken = p.get("taken_at") or (_ts_do_code(code) if code else None)
        peca = parser.parse_post({"code": code, "taken_at": taken,
                                  "caption": {"text": leg}})
        if peca is None:            # divulgação (sem condição/R$/vendido/tam) → ignora
            continue
        # post SEM link (SHARE falhou no device) só serve se tiver #p na legenda: o upsert casa por
        # número e marca a venda mesmo sem code. Sem code E sem #p não há como casar → descarta.
        if not code and peca.get("numero") is None:
            continue
        itens.append({
            "code": peca.get("code"), "drop": peca.get("drop"), "item": peca.get("item"),
            "nome": peca.get("nome"), "tamanho": peca.get("tamanho"),
            "largura": peca.get("largura"), "comprimento": peca.get("comprimento"),
            "circunferencia": peca.get("circunferencia"), "condicao": peca.get("condicao"),
            "venda": peca.get("preco"), "vendida": bool(peca.get("vendida")),
            "imagem_url": None, "numero": peca.get("numero"),
            "trecho_vendido": next((ln.strip()[:60] for ln in leg.splitlines()
                                    if _re.search(r"vendid", ln, _re.I)), None),
        })
        b64 = p.get("imagem_b64")
        if b64 and code:            # a foto migra por code; post sem link não atualiza imagem
            try:
                imagens[code] = base64.b64decode(b64)
            except Exception:
                pass

    # limpar_imagem=False: NÃO apaga a foto local de peça que o device não recapturou
    stats = pecas.upsert_scraper(itens, limpar_imagem=limpar_imagem) if itens else dict(_VAZIO)

    salvas = 0
    if imagens:
        by_code = {pe.get("code"): pe for pe in pecas.listar()["pecas"] if pe.get("code")}
        for code, raw in imagens.items():
            pe = by_code.get(code)
            if not pe or pe.get("so_manual"):   # peça travada: a foto é dela, o print não substitui
                continue
            nome = f"scraper-{code}.jpg"
            try:
                (settings.UPLOADS_DIR / nome).write_bytes(raw)
                pecas.set_imagem(pe["id"], nome)
                salvas += 1
            except Exception:
                pass
    stats = dict(stats)
    stats["imagens"] = salvas
    return stats


def alvos_fotos_emulador():
    """Job "fotos" (recapturar a foto de TODAS as peças, limpa dos overlays do IG) — devolvido por
    GET /scraper/emulador/fotos/alvos: toda peça com link do post (code), MENOS as travadas
    (so_manual: a foto delas foi escolhida à mão). Ordem: à venda primeiro, depois as vendidas; em
    cada grupo, as mais novas (#p maior) primeiro — se a run parar no meio, o que aparece na loja já
    ficou limpo. [{code, num, nome}]"""
    import pecas
    ps = [p for p in pecas.listar()["pecas"] if p.get("code") and not p.get("so_manual")]
    ps.sort(key=lambda p: (bool(p.get("vendida")), -(p.get("num") or 0)))
    return [{"code": p["code"], "num": p.get("num"), "nome": p.get("nome")} for p in ps]


def salvar_fotos_emulador(posts):
    """Recebe SÓ as fotos recapturadas pelo emulador ([{code, imagem_b64}]) e grava IGUAL ao
    reconciliar_emulador: arquivo scraper-<code>.jpg em UPLOADS_DIR + pecas.set_imagem. NÃO toca em
    mais nenhum dado da peça (sem parser, sem upsert). Peça travada (so_manual) é pulada. Devolve
    stats {recebidas, imagens, travadas, sem_peca, invalidas} (o run_manager soma por run)."""
    import base64
    import pecas
    st = {"recebidas": 0, "imagens": 0, "travadas": 0, "sem_peca": 0, "invalidas": 0}
    by_code = {pe.get("code"): pe for pe in pecas.listar()["pecas"] if pe.get("code")}
    for p in (posts or []):
        st["recebidas"] += 1
        p = p if isinstance(p, dict) else {}
        code = p.get("code")
        try:
            raw = base64.b64decode(p.get("imagem_b64") or "")
        except Exception:
            raw = b""
        # só JPEG/PNG de verdade — lixo não sobrescreve a foto boa
        if not code or not (raw[:2] == b"\xff\xd8" or raw[:8] == b"\x89PNG\r\n\x1a\n"):
            st["invalidas"] += 1
            continue
        pe = by_code.get(code)
        if not pe:
            st["sem_peca"] += 1
            continue
        if pe.get("so_manual"):     # peça travada: a foto é dela, o print não substitui
            st["travadas"] += 1
            continue
        nome = f"scraper-{code}.jpg"
        try:
            (settings.UPLOADS_DIR / nome).write_bytes(raw)
            pecas.set_imagem(pe["id"], nome)
            st["imagens"] += 1
        except Exception:
            st["invalidas"] += 1
    return st


def enfileirar_raspagem_emulador(full=False, lang="pt", modo=None):
    """Pede a raspagem pelo EMULADOR: calcula o boundary e cria um job no backend dos Bots
    (POST /runs). O agente do PC injeta brecho_base/brecho_token/run_id a partir do config
    local — por isso NÃO vão nos params (que aparecem no histórico de runs do app). Devolve
    o run.info() do backend dos Bots (com o id da run) pro app acompanhar.
    modo="fotos" = job de RECAPTURAR a foto de todas as peças (o módulo do device só tira foto)."""
    import json
    import urllib.request
    if not settings.BOTS_BACKEND_URL:
        raise RuntimeError("BOTS_BACKEND_URL não configurado (backend dos Bots).")
    params = {
        "full": bool(full), "lang": lang,
        "navegacao": settings.BOTS_SCRAPER_NAV,
    }
    if modo == "fotos":               # só repassa modo conhecido (a raspagem normal fica igual)
        params["modo"] = "fotos"
    if settings.BOTS_SCRAPER_CONTA:   # conta auxiliar leitora (opcional; senão o agente escolhe)
        params["conta_leitora"] = settings.BOTS_SCRAPER_CONTA
    body = json.dumps({"bot": settings.BOTS_SCRAPER_BOT, "params": params}).encode("utf-8")
    req = urllib.request.Request(
        settings.BOTS_BACKEND_URL + "/runs", data=body, method="POST",
        headers={"Content-Type": "application/json",
                 "Authorization": f"Bearer {settings.BOTS_BACKEND_TOKEN}"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode("utf-8"))


def obter_run_bots(bots_id):
    """Consulta o estado de uma run no backend dos Bots: GET /runs/{bots_id} → devolve o dict
    (run.info() do Bots: id, status, progress{done,total,label}, status_log). O brechó faz
    polling disso pra ESPELHAR o progresso da raspagem do emulador na tela de Run do app.
    Bloqueante (urllib) — chame via asyncio.to_thread."""
    import json
    import urllib.request
    if not settings.BOTS_BACKEND_URL:
        raise RuntimeError("BOTS_BACKEND_URL não configurado (backend dos Bots).")
    req = urllib.request.Request(
        f"{settings.BOTS_BACKEND_URL}/runs/{bots_id}",
        headers={"Authorization": f"Bearer {settings.BOTS_BACKEND_TOKEN}"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode("utf-8"))


def parar_run_bots(bots_id):
    """Pede pro backend dos Bots PARAR a run do emulador (POST /runs/{id}/stop). O agente seta o
    flag de parada e o módulo cai fora no próximo checkpoint. Idempotente do lado dos Bots. 404 =
    a run já não está na memória deles (backend reiniciou / já terminou) → trato como 'já terminou',
    NÃO como erro. Bloqueante (urllib) — chame via asyncio.to_thread. Devolve o HTTP status."""
    import urllib.error
    import urllib.request
    if not settings.BOTS_BACKEND_URL:
        raise RuntimeError("BOTS_BACKEND_URL não configurado (backend dos Bots).")
    req = urllib.request.Request(
        f"{settings.BOTS_BACKEND_URL}/runs/{bots_id}/stop", data=b"", method="POST",
        headers={"Authorization": f"Bearer {settings.BOTS_BACKEND_TOKEN}"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return 404        # run já sumiu dos Bots = já terminou; não é erro
        raise


def prontidao_emulador():
    """PROXY pro backend dos Bots: prontidão da raspagem pelo emulador (agente/PC online + status das
    contas auxiliares aptas pro rodízio). Serve o painel 'tá pronto pra rodar?' do app SEM expor o
    token dos Bots. Em falha de rede/config, devolve um payload 'offline' pra tela não quebrar.
    Bloqueante (urllib) — chame via asyncio.to_thread."""
    import json
    import urllib.request
    offline = {"pronto": False, "resumo": "não consegui falar com o emulador", "agente_online": False,
               "ultimo_ping_ha_s": -1, "emulador_ocupado": False, "proxima": None, "contas": [],
               "erro": True}
    if not settings.BOTS_BACKEND_URL:
        return offline
    try:
        req = urllib.request.Request(
            f"{settings.BOTS_BACKEND_URL}/emulador/raspagem/prontidao",
            headers={"Authorization": f"Bearer {settings.BOTS_BACKEND_TOKEN}"})
        with urllib.request.urlopen(req, timeout=12) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception:
        return offline
