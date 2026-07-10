"""
Quase Nada Brechó — API.

Gestão do brechó: cataloga peças (com foto), organiza em drops e agenda o
cronograma. Fonte de verdade = SQLite local (data/brecho.db) + imagens em
data/uploads (servidas em /uploads).

Rodar local:   uvicorn app:app --reload --port 8020
Auth:          header `Authorization: Bearer <BRECHO_API_TOKEN>`
"""
import asyncio
import shutil
import uuid
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, UploadFile, File, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

import drops
import history
import liveactivity
import notify
import pecas
import scraper
import settings
from db import init_db
from run_manager import RunManager

app = FastAPI(title="Quase Nada Brechó — API", version="1.0.1")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)
init_db()
app.mount("/uploads", StaticFiles(directory=str(settings.UPLOADS_DIR)), name="uploads")
mgr = RunManager()


def auth(authorization: str = Header(None)):
    if authorization != f"Bearer {settings.API_TOKEN}":
        raise HTTPException(401, "token inválido")


# ───────────────────────────── geral ─────────────────────────────
@app.get("/health")
async def health():
    return {"ok": True, "app": "quase-nada-brecho"}


# ───────────────────────────── dashboard ─────────────────────────
@app.get("/brecho/dashboard", dependencies=[Depends(auth)])
async def dashboard():
    return pecas.dashboard()


# ───────────────────────────── peças ─────────────────────────────
@app.get("/brecho/pecas", dependencies=[Depends(auth)])
async def listar_pecas():
    return pecas.listar()


@app.post("/brecho/pecas", dependencies=[Depends(auth)])
async def add_peca(payload: dict):
    return pecas.add(payload)


@app.put("/brecho/pecas/{peca_id}", dependencies=[Depends(auth)])
async def editar_peca(peca_id: int, payload: dict):
    p = pecas.editar(peca_id, payload)
    if not p:
        raise HTTPException(404, "peça não encontrada")
    return p


@app.delete("/brecho/pecas/{peca_id}", dependencies=[Depends(auth)])
async def remover_peca(peca_id: int):
    pecas.remover(peca_id)
    return {"ok": True}


@app.post("/brecho/pecas/{peca_id}/imagem", dependencies=[Depends(auth)])
async def upload_imagem(peca_id: int, file: UploadFile = File(...)):
    if not pecas.obter(peca_id):
        raise HTTPException(404, "peça não encontrada")
    ext = Path(file.filename or "").suffix.lower() or ".jpg"
    if ext not in (".jpg", ".jpeg", ".png", ".webp", ".heic"):
        raise HTTPException(400, "formato de imagem não suportado")
    nome = f"{peca_id}-{uuid.uuid4().hex[:8]}{ext}"
    destino = settings.UPLOADS_DIR / nome
    with destino.open("wb") as f:
        shutil.copyfileobj(file.file, f)
    return pecas.set_imagem(peca_id, nome)


# ───────────────────────────── drops ─────────────────────────────
@app.get("/drops", dependencies=[Depends(auth)])
async def listar_drops():
    return drops.listar()


@app.get("/drops/todos", dependencies=[Depends(auth)])
async def listar_drops_todos():
    return drops.listar_todos()


@app.get("/drops/historico", dependencies=[Depends(auth)])
async def historico_drop(data: str = None):
    return drops.pecas_por_data(data)


@app.get("/drops/{drop_id}", dependencies=[Depends(auth)])
async def obter_drop(drop_id: int):
    d = drops.obter(drop_id)
    if not d:
        raise HTTPException(404, "drop não encontrado")
    return d


@app.post("/drops", dependencies=[Depends(auth)])
async def add_drop(payload: dict):
    return drops.add(payload)


@app.put("/drops/{drop_id}", dependencies=[Depends(auth)])
async def editar_drop(drop_id: int, payload: dict):
    d = drops.editar(drop_id, payload)
    if not d:
        raise HTTPException(404, "drop não encontrado")
    return d


@app.delete("/drops/{drop_id}", dependencies=[Depends(auth)])
async def remover_drop(drop_id: int):
    drops.remover(drop_id)
    return {"ok": True}


@app.put("/drops/{drop_id}/pecas", dependencies=[Depends(auth)])
async def set_pecas_drop(drop_id: int, payload: dict):
    if not drops.obter(drop_id):
        raise HTTPException(404, "drop não encontrado")
    return drops.set_pecas(drop_id, payload.get("peca_ids", []))


# ─────────────────────── scraper / runs ──────────────────────────
@app.post("/scraper/importar", dependencies=[Depends(auth)])
async def scraper_importar():
    """Importa a planilha atual do worker pro banco (sem raspar)."""
    return await asyncio.to_thread(scraper.importar)


@app.post("/runs", dependencies=[Depends(auth)])
async def start_run(payload: dict = None):
    payload = payload or {}
    # não deixa DUAS raspagens ao mesmo tempo (conectar Instagram é outro tipo, não conta)
    if not payload.get("import_cookies") and any(
        r.status in ("rodando", "iniciando") and not r.params.get("import_cookies")
        for r in mgr.runs.values()
    ):
        raise HTTPException(409, "Já tem uma raspagem rodando — espera terminar.")
    run = await mgr.start(payload)
    return run.info()


@app.get("/runs", dependencies=[Depends(auth)])
async def list_runs():
    return mgr.listar()


# precisa vir ANTES de /runs/{run_id} (senão "history" casa como run_id)
@app.get("/runs/history", dependencies=[Depends(auth)])
async def runs_history(status: str = None, desde: float = None, ate: float = None):
    return history.listar(status=status, desde=desde, ate=ate)


@app.get("/runs/{run_id}", dependencies=[Depends(auth)])
async def run_detail(run_id: str):
    r = mgr.get(run_id)
    if not r:
        raise HTTPException(404, "run não encontrado")
    return {**r.info(), "log": list(r.linhas)[-300:]}


@app.post("/runs/{run_id}/stop", dependencies=[Depends(auth)])
async def stop_run(run_id: str):
    if not await mgr.stop(run_id):
        raise HTTPException(404, "run não encontrado")
    return {"stopped": True}


@app.post("/runs/{run_id}/liveactivity", dependencies=[Depends(auth)])
async def run_liveactivity(run_id: str, payload: dict):
    """O app manda o push token da Live Activity que iniciou pra esta run — a partir
    daí o server empurra os updates da barra viva via APNs."""
    run = mgr.get(run_id)
    if not run:
        raise HTTPException(404, "run não encontrado")
    run.la_token = (payload.get("token") or "").strip() or None
    print(f"[la] token recebido p/ {run_id}: {'sim (' + str(len(run.la_token)) + ' chars)' if run.la_token else 'VAZIO'} "
          f"| configurado={liveactivity.configurado()}", flush=True)
    return {"ok": True}


@app.websocket("/runs/{run_id}/logs")
async def ws_logs(ws: WebSocket, run_id: str, token: str = ""):
    if token != settings.API_TOKEN:
        await ws.close(code=4401)
        return
    r = mgr.get(run_id)
    if not r:
        await ws.close(code=4404)
        return
    await ws.accept()
    q = asyncio.Queue()
    for l in list(r.linhas):              # histórico primeiro
        await ws.send_text(l)
    if r.status in ("finalizado", "parado", "erro"):
        await ws.close()
        return
    r.subs.add(q)
    try:
        while True:
            l = await q.get()
            if l is None:
                break
            await ws.send_text(l)
    except Exception:
        pass
    finally:
        r.subs.discard(q)
        try:
            await ws.close()
        except Exception:
            pass


# ─────────────────────── conexão Instagram ───────────────────────
@app.post("/instagram/session", dependencies=[Depends(auth)])
async def conectar_instagram(payload: dict):
    """Recebe os cookies capturados no app (WebView), grava a sessão do worker e
    dispara a importação (vira uma run que o app acompanha pelo log)."""
    cookies = payload.get("cookies")
    if not isinstance(cookies, list) or not cookies:
        raise HTTPException(400, "envie 'cookies' (lista não-vazia)")
    if not any(str(c.get("name")) == "sessionid" for c in cookies):
        raise HTTPException(400, "cookies sem 'sessionid' — sessão não está logada")
    arquivo = scraper.salvar_cookies(cookies)
    run = await mgr.start({"import_cookies": arquivo})
    return {"runs": [{"id": run.id}]}


# ─────────────────────── push (devices) ──────────────────────────
@app.post("/devices", dependencies=[Depends(auth)])
async def registrar_device(payload: dict):
    if not notify.registrar(payload.get("token")):
        raise HTTPException(400, "token vazio")
    return {"ok": True, "devices": len(notify.listar())}
