"""
Configuração do backend "Quase Nada Brechó".

App de gestão do brechó: cataloga peças (com foto), organiza em drops e agenda
o cronograma. Fonte de verdade própria (SQLite) — não depende mais da planilha
do scraper. Valores sensíveis vêm de variáveis de ambiente (.env na Oracle).
"""
import os
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent

# Onde ficam o banco e as imagens das peças (persistente na Oracle via volume).
DATA_DIR = Path(os.environ.get("BRECHO_DATA_DIR", BASE / "data")).resolve()
DATA_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = DATA_DIR / "brecho.db"

# Imagens das peças gravadas aqui e servidas em /uploads/<arquivo>.
UPLOADS_DIR = DATA_DIR / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

# Token simples de API (MVP). Depois evolui pra JWT como o lembretes.
API_TOKEN = os.environ.get("BRECHO_API_TOKEN", "troca-esse-token-na-oracle")

# ── Scraper (worker brecho-tracker) ──────────────────────────────
# O worker fica ao lado: quase-nada-brecho/workers/brecho-tracker/
WORKER_DIR = Path(os.environ.get("BRECHO_WORKER_DIR", BASE.parent / "workers" / "brecho-tracker")).resolve()
# Python que roda o worker (na Oracle, aponte pro venv com playwright instalado).
PYTHON_BIN = os.environ.get("PYTHON_BIN", sys.executable)
# Buffer de log por run (linhas mantidas em memória p/ quem conectar depois).
MAX_LOG_LINES = int(os.environ.get("MAX_LOG_LINES", "3000"))
