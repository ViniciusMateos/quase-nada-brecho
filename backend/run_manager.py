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


class Run:
    def __init__(self, params):
        self.id = f"run-{next(_counter)}"
        self.params = params or {}
        self.status = "iniciando"      # iniciando | rodando | finalizado | parado | erro
        self.started_at = time.time()
        self.ended_at = None
        self.returncode = None
        self.progress = None
        self.linhas = deque(maxlen=settings.MAX_LOG_LINES)
        self.subs = set()              # set[asyncio.Queue]
        self.proc = None

    def info(self):
        return {
            "id": self.id, "status": self.status,
            "started_at": self.started_at, "ended_at": self.ended_at,
            "returncode": self.returncode, "params": self.params,
            "linhas": len(self.linhas), "progress": self.progress,
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
        cmd = [settings.PYTHON_BIN] + scraper.montar_cmd(params)
        env = {**os.environ, "PYTHONUTF8": "1", "PYTHONUNBUFFERED": "1"}
        run.proc = await asyncio.create_subprocess_exec(
            *cmd, cwd=str(scraper.worker_dir()),
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT, env=env,
        )
        run.status = "rodando"
        asyncio.create_task(self._pump(run))
        return run

    async def _pump(self, run):
        try:
            async for raw in run.proc.stdout:
                linha = raw.decode("utf-8", "replace").rstrip("\r\n")
                if linha.startswith("[progress]"):
                    p = _parse_progress(linha)
                    if p:
                        run.progress = p
                await run.emitir(linha)
        except Exception as e:
            await run.emitir(f"[backend] erro lendo saída: {e}")
        run.returncode = await run.proc.wait()
        run.ended_at = time.time()
        if run.status != "parado":
            run.status = "finalizado" if run.returncode == 0 else "erro"

        # raspagem OK → importa a planilha pro banco
        if run.status == "finalizado" and not run.params.get("import_cookies"):
            try:
                stats = await asyncio.to_thread(scraper.importar)
                await run.emitir(
                    f"[backend] planilha importada pro app: {stats['novas']} novas, "
                    f"{stats['atualizadas']} atualizadas, {stats.get('reconciliadas', 0)} reconciliadas.")
            except Exception as e:
                await run.emitir(f"[backend] falha importando a planilha: {e}")

        await run.emitir(f"[backend] processo terminou (status={run.status}, code={run.returncode})")
        await self._push_fim(run)
        for q in list(run.subs):       # sinaliza fim (None) aos assinantes
            try:
                q.put_nowait(None)
            except Exception:
                pass

    async def _push_fim(self, run):
        """Notifica o celular quando a run termina (pula import de cookies)."""
        if run.params.get("import_cookies"):
            return
        if run.status == "erro":
            titulo, corpo = "Deu ruim", "O scraper do brechó parou com erro."
        elif run.status == "parado":
            titulo, corpo = "Parado", "O scraper do brechó foi parado."
        else:
            titulo, corpo = "Brechó atualizado", "Raspagem concluída e planilha sincronizada."
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
