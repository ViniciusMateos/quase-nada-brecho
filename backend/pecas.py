"""
Peças do brechó: CRUD + KPIs do dashboard.

A matemática dos KPIs é a mesma do app antigo (faturamento, lucro, ROI, estoque),
mas agora lendo do SQLite em vez da planilha do scraper.
"""
from collections import defaultdict

from db import conn, row, rows

EDITAVEIS = ("nome", "item", "tamanho", "condicao", "compra", "venda", "vendida", "drop_id")


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _coagir(campos):
    """Normaliza só os campos que o app pode mandar."""
    out = {}
    for k, v in (campos or {}).items():
        if k not in EDITAVEIS:
            continue
        if k in ("compra", "venda"):
            out[k] = _num(v)
        elif k == "vendida":
            out[k] = 1 if (v is True or str(v).strip().lower() in ("sim", "true", "1")) else 0
        elif k == "drop_id":
            out[k] = int(v) if v not in (None, "", "null") else None
        else:
            out[k] = v
    return out


def _url(imagem):
    return f"/uploads/{imagem}" if imagem else None


def _peca_dict(r):
    return {
        "id": r["id"],
        "nome": r["nome"],
        "item": r["item"],
        "tamanho": r["tamanho"],
        "condicao": r["condicao"],
        "compra": _num(r["compra"]),
        "venda": _num(r["venda"]),
        "vendida": bool(r["vendida"]),
        # foto local (upload) tem prioridade; senão usa a URL externa (CDN do IG)
        "imagem_url": _url(r["imagem"]) or r["imagem_url"],
        "drop_id": r["drop_id"],
        "drop_nome": r["drop_nome"],
        "drop_data": r["drop_data"],
        "origem": r["origem"] if "origem" in r.keys() else "manual",
        "code": r["code"] if "code" in r.keys() else None,
        "postado_em": r["postado_em"] if "postado_em" in r.keys() else None,
    }


_SELECT = """
SELECT p.*, d.nome AS drop_nome, d.data AS drop_data
FROM pecas p LEFT JOIN drops d ON d.id = p.drop_id
"""


# ─────────────────────────── CRUD ────────────────────────────────
def listar():
    with conn() as c:
        r = rows(c.execute(_SELECT + " ORDER BY p.vendida ASC, p.criado_em DESC"))
    return {"pecas": [_peca_dict(x) for x in r]}


def obter(peca_id):
    with conn() as c:
        r = row(c.execute(_SELECT + " WHERE p.id = ?", (peca_id,)))
    return _peca_dict(r) if r else None


def add(campos):
    d = _coagir(campos)
    with conn() as c:
        cur = c.execute(
            """INSERT INTO pecas (nome, item, tamanho, condicao, compra, venda, vendida, drop_id)
               VALUES (:nome, :item, :tamanho, :condicao, :compra, :venda, :vendida, :drop_id)""",
            {
                "nome": d.get("nome"), "item": d.get("item"), "tamanho": d.get("tamanho"),
                "condicao": d.get("condicao"), "compra": d.get("compra", 0.0),
                "venda": d.get("venda", 0.0), "vendida": d.get("vendida", 0),
                "drop_id": d.get("drop_id"),
            },
        )
        pid = cur.lastrowid
    return obter(pid)


def editar(peca_id, campos):
    d = _coagir(campos)
    # peça do scraper já tem o drop dela no Insta — não deixa jogar num drop manual
    if "drop_id" in d:
        with conn() as c:
            r = c.execute("SELECT origem FROM pecas WHERE id = ?", (peca_id,)).fetchone()
        if r and r["origem"] == "scraper":
            d.pop("drop_id")
    if not d:
        return obter(peca_id)
    sets = ", ".join(f"{k} = :{k}" for k in d)
    d["id"] = peca_id
    with conn() as c:
        c.execute(f"UPDATE pecas SET {sets} WHERE id = :id", d)
    return obter(peca_id)


def set_imagem(peca_id, nome_arquivo):
    with conn() as c:
        c.execute("UPDATE pecas SET imagem = ? WHERE id = ?", (nome_arquivo, peca_id))
    return obter(peca_id)


def remover(peca_id):
    with conn() as c:
        c.execute("DELETE FROM pecas WHERE id = ?", (peca_id,))
    return True


def _norm(s):
    return (s or "").strip().lower()


# ───────────────────── import do scraper ─────────────────────────
def upsert_scraper(items):
    """Recebe peças raspadas (com `code`) e sincroniza no banco:
      - já existe com esse code → atualiza (preserva compra/venda manuais);
      - existe uma peça MANUAL planejada de mesmo nome (sem code) → reconcilia:
        promove ela a 'scraper' (ganha o drop real, sai do planejamento);
      - senão → insere nova.
    Devolve stats {novas, atualizadas, reconciliadas, total}."""
    novas = atualizadas = reconciliadas = 0
    with conn() as c:
        for it in items:
            code = it.get("code")
            if not code:
                continue
            campos = {
                "nome": it.get("nome"), "item": it.get("item"), "tamanho": it.get("tamanho"),
                "condicao": it.get("condicao"), "vendida": 1 if it.get("vendida") else 0,
                "imagem_url": it.get("imagem_url"), "postado_em": it.get("drop") or it.get("postado_em"),
            }
            existe = c.execute("SELECT id FROM pecas WHERE code = ?", (code,)).fetchone()
            if existe:
                sets = ", ".join(f"{k} = :{k}" for k in campos)
                c.execute(f"UPDATE pecas SET {sets} WHERE code = :code", {**campos, "code": code})
                atualizadas += 1
                continue

            # reconciliação: peça manual planejada (sem code) de mesmo nome vira scraper
            nome = _norm(it.get("nome"))
            match = None
            if nome:
                match = c.execute(
                    "SELECT id FROM pecas WHERE origem = 'manual' AND code IS NULL "
                    "AND lower(trim(nome)) = ?", (nome,)).fetchone()
            if match:
                sets = ", ".join(f"{k} = :{k}" for k in campos)
                c.execute(
                    f"UPDATE pecas SET {sets}, origem = 'scraper', code = :code, drop_id = NULL "
                    "WHERE id = :id", {**campos, "code": code, "id": match["id"]})
                reconciliadas += 1
            else:
                c.execute(
                    """INSERT INTO pecas (nome, item, tamanho, condicao, compra, venda, vendida,
                                          imagem_url, origem, code, postado_em)
                       VALUES (:nome, :item, :tamanho, :condicao, :compra, :venda, :vendida,
                               :imagem_url, 'scraper', :code, :postado_em)""",
                    {**campos, "compra": _num(it.get("compra")), "venda": _num(it.get("venda")), "code": code})
                novas += 1
    return {"novas": novas, "atualizadas": atualizadas, "reconciliadas": reconciliadas,
            "total": novas + atualizadas + reconciliadas}


# ─────────────────────────── KPIs ────────────────────────────────
def _kpis(pecas):
    vend = [p for p in pecas if p["vendida"]]
    disp = [p for p in pecas if not p["vendida"]]
    faturamento = sum(p["venda"] for p in vend)
    cmv = sum(p["compra"] for p in vend)
    lucro = faturamento - cmv
    est_valor = sum(p["venda"] for p in disp)
    est_custo = sum(p["compra"] for p in disp)
    total = len(pecas)
    return {
        "total": total,
        "vendidas": len(vend),
        "disponiveis": len(disp),
        "taxa_venda": round(len(vend) / total * 100, 1) if total else 0,
        "faturamento": round(faturamento, 2),
        "cmv": round(cmv, 2),
        "lucro": round(lucro, 2),
        "margem_pct": round(lucro / faturamento * 100, 1) if faturamento else 0,
        "roi_pct": round(lucro / cmv * 100, 1) if cmv else 0,
        "ticket_medio": round(faturamento / len(vend), 2) if vend else 0,
        "custo_medio": round(cmv / len(vend), 2) if vend else 0,
        "investido_total": round(sum(p["compra"] for p in pecas), 2),
        "estoque_valor": round(est_valor, 2),
        "estoque_custo": round(est_custo, 2),
        "estoque_lucro_potencial": round(est_valor - est_custo, 2),
    }


def _por_grupo(pecas, chave_label):
    g = defaultdict(lambda: {"total": 0, "vendidas": 0, "faturamento": 0.0, "lucro": 0.0})
    for p in pecas:
        k = p.get(chave_label) or "—"
        b = g[str(k)]
        b["total"] += 1
        if p["vendida"]:
            b["vendidas"] += 1
            b["faturamento"] += p["venda"]
            b["lucro"] += p["venda"] - p["compra"]
    return g


def dashboard():
    pecas = listar()["pecas"]
    if not pecas:
        return {"existe": False, "kpis": None, "por_drop": [], "por_categoria": []}

    # peça do app agrupa pelo nome do drop; peça raspada (sem drop do app) pela data do post
    for p in pecas:
        p["_drop_label"] = p.get("drop_nome") or p.get("postado_em") or "—"
    gd = _por_grupo(pecas, "_drop_label")
    por_drop = sorted(
        [{"drop": k, **{kk: round(vv, 2) if isinstance(vv, float) else vv for kk, vv in v.items()}}
         for k, v in gd.items()],
        key=lambda x: x["faturamento"], reverse=True)

    # anexa a numeração cronológica do drop (mesma de drops.listar_todos)
    import drops as _drops
    num_por_label = {}
    for d in _drops.listar_todos()["drops"]:
        lbl = d["nome"] if d["nome"] else d["data"]
        if lbl is not None:
            num_por_label[str(lbl)] = d["numero"]
    for linha in por_drop:
        linha["numero"] = num_por_label.get(str(linha["drop"]))

    gc = _por_grupo(pecas, "item")
    por_categoria = sorted(
        [{"item": k, **{kk: round(vv, 2) if isinstance(vv, float) else vv for kk, vv in v.items()}}
         for k, v in gc.items()],
        key=lambda x: x["faturamento"], reverse=True)

    return {"existe": True, "kpis": _kpis(pecas), "por_drop": por_drop, "por_categoria": por_categoria}
