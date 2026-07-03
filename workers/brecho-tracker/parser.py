"""
Parser da legenda do brechó → dados estruturados da peça.

Padrão real (1 post = 1 peça), confirmado por captura ao vivo:

    | ❌VENDIDO❌            (opcional; VENDIDO masc. / VENDIDA fem.)
    <nome da peça>          (tipo + marca/cor, texto livre)
    tam.: p (l 58 cm c 64 cm)
    condição: 9/10
    <observação opcional>
    R$:15                   (só quando DISPONÍVEL — vendida não traz preço)
    comente "fila"
    #brechoonline #brecho

Post de divulgação (sem condição/R$/VENDIDO/tam) → NÃO é peça (retorna None).
"""
import re

_VENDIDO_RX = re.compile(r"vendid[oa]", re.I)
_TAM_RX = re.compile(r"tam\.?\s*:\s*([^(\n]+)", re.I)
_MED_LC_RX = re.compile(r"l\s*([\d.,]+)\s*cm\s*c\s*([\d.,]+)\s*cm", re.I)
_CIRC_RX = re.compile(r"([\d.,]+)\s*cm\s*circunfer", re.I)
_SOLO_RX = re.compile(r"\(\s*([\d.,]+)\s*cm\s*\)")          # ex.: (27,5 cm) — tênis
_COND_RX = re.compile(r"condi[çc][ãa]o\s*:\s*(\d+\s*/\s*10)", re.I)
_PRECO_RX = re.compile(r"r\$\s*:?\s*([\d.,]+)", re.I)
_MEDIDAS_RAW_RX = re.compile(r"\(([^)]*\bcm\b[^)]*)\)", re.I)  # captura o "(...)" com cm

# vocabulário de tipos de peça (best-effort p/ a coluna "item")
_TIPOS = [
    "camiseta", "camisa", "calça", "calca", "moletom", "cinto", "boné", "bone",
    "colete", "saia", "suéter", "sueter", "jaqueta", "shorts", "short", "óculos",
    "oculos", "tênis", "tenis", "bucket", "polo", "vestido", "blusa", "casaco",
    "bermuda", "regata", "blusão", "blusao", "corta-vento", "corta vento",
    "agasalho", "cropped", "top", "macacão", "macacao", "bolsa", "mochila",
    "relógio", "relogio", "chapéu", "chapeu", "gorro", "touca", "luva", "meia",
    "cueca", "biquíni", "biquini", "maiô", "maio", "sunga",
]


def _num(s):
    """'3,5' → 3.5 ; '118' → 118.0 ; None se vazio."""
    if not s:
        return None
    s = s.strip().replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def _best(versions):
    cands = (versions or {}).get("candidates") or []
    return cands[0].get("url") if cands else None


def imagens_urls(item):
    """TODAS as fotos do post (cada slide do carrossel), na ordem. Lista de URLs.

    ⚠️ URLs da CDN do IG são assinadas e EXPIRAM (dias/semanas) — re-capturadas a cada run.
    """
    car = item.get("carousel_media")
    if car:
        urls = [_best((m or {}).get("image_versions2")) for m in car]
        return [u for u in urls if u]
    u = _best(item.get("image_versions2"))
    return [u] if u else []


def imagem_url(item):
    """URL da foto de capa (1ª do carrossel, ou a única)."""
    urls = imagens_urls(item)
    return urls[0] if urls else None


def _tipo_item(nome):
    """Best-effort: acha um tipo conhecido no nome; senão usa a 1ª palavra."""
    low = nome.lower()
    for t in _TIPOS:
        if re.search(rf"\b{re.escape(t)}\b", low):
            return t
    return low.split()[0] if low.split() else None


def eh_peca(legenda):
    """True se a legenda tem cara de peça (tem algum dos campos estruturais)."""
    t = legenda or ""
    return bool(_COND_RX.search(t) or _PRECO_RX.search(t) or _TAM_RX.search(t)
                or _VENDIDO_RX.search(t) or _MED_LC_RX.search(t))


def _nome(legenda):
    """Primeira linha de conteúdo (sem o '|' inicial e sem a marca ❌VENDIDO❌)."""
    linhas = []
    for l in (legenda or "").split("\n"):
        l = l.strip()
        if l.startswith("|"):
            l = l[1:].strip()
        if not l:
            continue
        sem_x = l.replace("❌", "").strip().lower()
        if sem_x in ("vendido", "vendida"):
            continue
        linhas.append(l)
    return linhas[0] if linhas else None


def parse_post(item):
    """Recebe um item da API (com .code, .taken_at, .caption.text) e devolve o dict
    da peça — ou None se o post não for uma peça (divulgação)."""
    from datetime import datetime, timezone

    legenda = ((item.get("caption") or {}).get("text")) or ""
    if not eh_peca(legenda):
        return None

    nome = _nome(legenda)
    tam = _TAM_RX.search(legenda)
    med = _MED_LC_RX.search(legenda)
    circ = _CIRC_RX.search(legenda)
    solo = _SOLO_RX.search(legenda)
    cond = _COND_RX.search(legenda)
    preco = _PRECO_RX.search(legenda)
    medidas_raw = _MEDIDAS_RAW_RX.search(legenda)

    # vendida = a palavra "vendido/vendida" em QUALQUER lugar da legenda (com ou sem ❌,
    # maiúscula/minúscula, no meio de frase) — robusto, não depende do emoji nem de espaço.
    vendida = bool(_VENDIDO_RX.search(legenda))

    taken = item.get("taken_at")
    drop = (datetime.fromtimestamp(int(taken), tz=timezone.utc).astimezone().strftime("%Y-%m-%d")
            if taken else None)

    largura = _num(med.group(1)) if med else None
    comprimento = _num(med.group(2)) if med else None
    circunferencia = _num(circ.group(1)) if circ else None
    # tênis: medida única (27,5 cm) sem l/c → guarda como comprimento (tam. do pé)
    if comprimento is None and circunferencia is None and solo:
        comprimento = _num(solo.group(1))

    return {
        "code": item.get("code"),
        "url": f"https://www.instagram.com/p/{item.get('code')}/",
        "imagem_url": imagem_url(item),
        "imagens_urls": imagens_urls(item),
        "drop": drop,
        "item": _tipo_item(nome) if nome else None,
        "nome": nome,
        "tamanho": tam.group(1).strip() if tam else None,
        "largura": largura,
        "comprimento": comprimento,
        "circunferencia": circunferencia,
        "medidas": medidas_raw.group(0) if medidas_raw else None,
        "condicao": cond.group(1).replace(" ", "") if cond else None,
        "preco": _num(preco.group(1)) if preco else None,
        "vendida": vendida,
    }


# ───────────── teste rápido contra a amostra ─────────────
if __name__ == "__main__":
    import json
    import os
    import sys

    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    base = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(base, "output", "posts_sample.json"), encoding="utf-8") as f:
        amostra = json.load(f)

    # o posts_sample.json já vem resumido; reconstrói o formato que parse_post espera
    pecas, promo = [], 0
    for r in amostra:
        fake = {"code": r["code"],
                "taken_at": None,
                "caption": {"text": r["legenda"]}}
        p = parse_post(fake)
        if p is None:
            promo += 1
            continue
        p["drop"] = r["data"]   # usa a data já resumida
        pecas.append(p)

    print(f"\n{len(pecas)} peças  |  {promo} posts de divulgação (ignorados)\n")
    cab = f"{'code':12} {'drop':10} {'V':2} {'item':9} {'tam':5} {'larg':5} {'comp':5} {'circ':5} {'R$':6} {'cond':5} nome"
    print(cab)
    print("-" * len(cab))
    for p in pecas:
        print(f"{p['code']:12} {p['drop'] or '':10} {'❌' if p['vendida'] else '·':2} "
              f"{(p['item'] or '')[:9]:9} {(p['tamanho'] or '')[:5]:5} "
              f"{('' if p['largura'] is None else p['largura']):>5} "
              f"{('' if p['comprimento'] is None else p['comprimento']):>5} "
              f"{('' if p['circunferencia'] is None else p['circunferencia']):>5} "
              f"{('' if p['preco'] is None else p['preco']):>6} "
              f"{(p['condicao'] or ''):5} {(p['nome'] or '')[:34]}")
