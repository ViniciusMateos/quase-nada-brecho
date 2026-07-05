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
from datetime import date, datetime

import settings

COOKIES_FILE = "imported_cookies.json"
PLANILHA = "brecho_tracker.xlsx"

# posição das colunas na aba "peças" (mesmo layout gerado pelo worker)
COL = {"code": 0, "drop": 1, "item": 3, "nome": 4, "compra": 5, "venda": 6,
       "tamanho": 7, "largura": 8, "comprimento": 9, "circunferencia": 10,
       "condicao": 11, "vendida": 12, "url": 13, "imagem_url": 15}


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


# ─────────────────── import da planilha → SQLite ─────────────────
def _data_iso(v):
    if isinstance(v, (datetime, date)):
        return v.strftime("%Y-%m-%d")
    return str(v) if v else None


def _limpo(v):
    return None if v in (None, "", "N/A") else v


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
        })
    wb.close()
    return out


def importar():
    """Lê a planilha do worker e faz upsert no SQLite. Devolve stats."""
    import pecas
    items = ler_planilha()
    if not items:
        return {"novas": 0, "atualizadas": 0, "total": 0}
    return pecas.upsert_scraper(items)
