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

# ── Raspagem pelo EMULADOR (via backend dos Bots) ────────────────
# A raspagem migrou do Playwright server-side pro emulador Android: uma conta AUXILIAR
# (não a da loja) lê o perfil do brechó no app e devolve os posts pra cá por HTTP. O app
# pede a raspagem → o backend do brechó enfileira um job no backend dos Bots → o agente roda
# no device → o device devolve os posts em /scraper/emulador/posts. Risco zero pra conta da loja.
BOTS_BACKEND_URL = os.environ.get("BOTS_BACKEND_URL", "").rstrip("/")   # ex.: https://quasenadaserver2.duckdns.org/bots
BOTS_BACKEND_TOKEN = os.environ.get("BOTS_BACKEND_TOKEN", "")
# Nome do bot no catálogo do backend dos Bots (a sessão dos Bots registra com esse id).
BOTS_SCRAPER_BOT = os.environ.get("BOTS_SCRAPER_BOT", "brecho-scraper")
# Base PÚBLICA deste backend (pra onde o device devolve os posts). O device faz
# POST {BRECHO_PUBLIC_BASE}/scraper/emulador/posts (o nginx /brecho/ remove o 1º /brecho).
BRECHO_PUBLIC_BASE = os.environ.get("BRECHO_PUBLIC_BASE", "https://quasenadaserver1.duckdns.org/brecho")
# Conta auxiliar leitora (opcional; vazio = o agente dos Bots escolhe uma "segue" livre).
BOTS_SCRAPER_CONTA = os.environ.get("BOTS_SCRAPER_CONTA", "")
# Navegação no device: "celula" (tap→lê→back, previsível), "swipe" ou "auto". Célula é o
# recomendado pela sessão dos Bots (igual ao fluxo do story, abrindo post a post).
BOTS_SCRAPER_NAV = os.environ.get("BOTS_SCRAPER_NAV", "celula")
