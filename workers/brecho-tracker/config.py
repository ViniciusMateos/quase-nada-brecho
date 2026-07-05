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


def _envbool(nome, padrao):
    v = os.environ.get(nome)
    return padrao if v is None else v.strip().lower() in ("1", "true", "yes", "on")


# Default = PC (headed + Chrome real, menos detectável). No SERVIDOR headless (ARM,
# sem display), rode com IG_HEADLESS=1 e IG_CHROME_REAL=0 no ambiente (systemd
# Environment= ou export). Assim subir este arquivo pro server NÃO quebra o headless.
HEADLESS = _envbool("IG_HEADLESS", False)          # headed é menos detectável (PC)
USAR_CHROME_REAL = _envbool("IG_CHROME_REAL", True)  # usa o Chrome instalado (channel="chrome")
LOCALE = "pt-BR"
USER_AGENT = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36")

# ───────────────── Constantes da API web ───────────
IG_APP_ID = "936619743392459"
ASBD_ID = "359341"

# ───────────────────── Raspagem (scroll) ─────────────────────
# A raspagem oficial DESCE o perfil como humano e intercepta as respostas graphql
# que a página dispara sozinha (ver iglib.raspar_perfil_scroll). O IG serve o scroll
# natural sem estrangular — dá pra pegar o feed inteiro numa run, sem bloqueio.
SCROLL_MAX = 120                 # teto de scrolls (segurança; para antes no "estável")
SCROLL_ESTAVEL_MAX = 6           # nº de scrolls seguidos sem post novo p/ declarar fim
SCROLL_PAUSA_MS = (1800, 3800)   # pausa humana entre scrolls (ms)

# ── Legado (chamada /feed/user direta — estrangula; mantido só por referência) ──
POSTS_POR_PAGINA = 12
MAX_PAGINAS = 60
DELAY_PAGINA = (15.0, 30.0)
RATE_LIMIT_ESPERAS = (120.0, 240.0, 300.0)

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
RESUME_FILE = os.path.join(OUTPUT_DIR, "resume.json")  # progresso da paginação (retoma se travar)
LOG_FILE = os.path.join(OUTPUT_DIR, "run.log")
