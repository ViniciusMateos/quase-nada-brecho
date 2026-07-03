"""
Configuração do brecho-tracker.

Raspador do brechó @brechoquasenadaa: lê os posts (1 post = 1 peça), extrai os
dados da peça da legenda, detecta "VENDIDA" (legenda editada) e reconcilia com a
planilha — mantendo o controle de disponível/vendido ao longo dos drops.
"""
import os

_BASE = os.path.dirname(os.path.abspath(__file__))

# ─────────────────────────── Alvo ───────────────────────────
BRECHO_USERNAME = "brechoquasenadaa"

# ─────────────────────── Sessão / navegador ─────────────────
# Precisa estar logado (mesmo esquema dos outros workers: importar cookies 1x).
USER_DATA_DIR = os.path.join(_BASE, "browser_profile")


# ─────────────────────── Proxy (opcional, configurável pelo app) ──────────
# Grava proxy.json {enabled, server, username, password}. Formato do Playwright.
def _carregar_proxy():
    import json
    f = os.path.join(_BASE, "proxy.json")
    if os.path.exists(f):
        try:
            d = json.load(open(f, encoding="utf-8"))
            if d.get("enabled") and d.get("server"):
                return {k: d[k] for k in ("server", "username", "password") if d.get(k)}
        except Exception:
            pass
    return None


PROXY = _carregar_proxy()
HEADLESS = False                       # headed é menos detectável
USAR_CHROME_REAL = True                # usa o Chrome instalado (channel="chrome")
LOCALE = "pt-BR"
USER_AGENT = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36")

# ───────────────── Constantes da API web ───────────
IG_APP_ID = "936619743392459"
ASBD_ID = "359341"

# ───────────────────── Raspagem ─────────────────────
# Quantos posts puxar por página da timeline (a API aceita ~12).
POSTS_POR_PAGINA = 12
# Teto de segurança de páginas (12 * 60 = 720 posts) — a parada real é o boundary.
MAX_PAGINAS = 60
# Pausa humana entre páginas da timeline (segundos).
DELAY_PAGINA = (2.0, 5.0)

# ── Boundary (retomada) ──
# Drops ANTERIORES a esta data já estão 100% vendidos → não precisa raspar de novo.
# É salvo/atualizado no state.json automaticamente: vira a data do drop mais antigo
# que AINDA tem peça disponível. Na 1ª run fica vazio (raspa tudo).
# Para forçar, edite o state.json (campo "boundary_drop").

# ─────────────────────────── Planilha ──────────────────────
PLANILHA = os.path.join(_BASE, "quasenadabrecho.xlsx")   # base atual (referência)
PLANILHA_SAIDA = os.path.join(_BASE, "brecho_tracker.xlsx")  # nova, gerada/atualizada
ABA_DADOS = "Dados Gerais"   # aba principal (dashboard) — 1ª
ABA_PECAS = "peças"          # tabela detalhada — 2ª
ABA_GASTOS = "gastos"
# Linha (1-based) onde está o cabeçalho real (item/tamanho/.../auxiliar) na planilha base.
HEADER_LINHA = 5

# ─────────────────────── Miniaturas (imagem da peça) ───────────────────
THUMB_W = 110                 # lado máximo da miniatura embutida na planilha (px)

# ─────────────────────────── Paths ──────────────────────────
OUTPUT_DIR = os.path.join(_BASE, "output")
IMAGENS_DIR = os.path.join(OUTPUT_DIR, "imagens")   # cache de miniaturas (regenerável)
STATE_FILE = os.path.join(OUTPUT_DIR, "state.json")
LOG_FILE = os.path.join(OUTPUT_DIR, "run.log")
