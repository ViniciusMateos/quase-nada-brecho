"""
Peças do brechó: CRUD + KPIs do dashboard.

A matemática dos KPIs é a mesma do app antigo (faturamento, lucro, ROI, estoque),
mas agora lendo do SQLite em vez da planilha do scraper.
"""
import json
from collections import defaultdict

from db import conn, row, rows


def _med_str(v):
    """Formata uma medida numérica (58.0 → '58', 27.5 → '27.5'). None se vazio."""
    if v is None or v == "":
        return None
    try:
        f = float(v)
        return str(int(f)) if f == int(f) else str(f)
    except (TypeError, ValueError):
        return str(v).strip() or None


def _medida_json_circ(circ):
    """Circunferência raspada → JSON de medidas especiais (mesmo formato do app)."""
    s = _med_str(circ)
    return json.dumps([{"tipo": "Circunferência", "valor": s}], ensure_ascii=False) if s else None

EDITAVEIS = ("nome", "item", "tamanho", "largura", "comprimento", "medida", "observacao",
             "condicao", "compra", "venda", "vendida", "drop_id", "consignado", "consig_pct",
             "consig_tipo", "consig_valor", "so_manual", "template")


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _campo(p, k):
    if not _tem(p, k):
        return None
    return p.get(k) if hasattr(p, "get") else p[k]


def _receita(p):
    """Faturamento efetivo: se a peça é consignada, só conta a parte que fica pra mim —
    seja uma % da venda (modo 'pct') ou um valor fixo em R$ (modo 'valor')."""
    v = _num(_campo(p, "venda"))
    if not _campo(p, "consignado"):
        return v
    tipo = _campo(p, "consig_tipo") or "pct"
    if tipo == "valor":
        val = _num(_campo(p, "consig_valor"))
        return min(val, v) if val else v   # recebe o fixo, nunca mais que o preço da venda
    pct = _campo(p, "consig_pct")
    return v * (_num(pct) / 100.0) if pct else v


def _tem(p, k):
    if hasattr(p, "get"):
        return k in p
    try:
        return k in p.keys()
    except Exception:
        return False


def _coagir(campos):
    """Normaliza só os campos que o app pode mandar."""
    out = {}
    for k, v in (campos or {}).items():
        if k not in EDITAVEIS:
            continue
        if k in ("compra", "venda"):
            out[k] = _num(v)
        elif k in ("vendida", "consignado", "so_manual"):
            out[k] = 1 if (v is True or str(v).strip().lower() in ("sim", "true", "1")) else 0
        elif k == "drop_id":
            out[k] = int(v) if v not in (None, "", "null") else None
        elif k in ("consig_pct", "consig_valor"):
            out[k] = _num(v) if v not in (None, "", "null") else None
        elif k == "consig_tipo":
            out[k] = "valor" if str(v).strip().lower() == "valor" else "pct"
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
        "largura": r["largura"] if "largura" in r.keys() else None,
        "comprimento": r["comprimento"] if "comprimento" in r.keys() else None,
        "medida": r["medida"] if "medida" in r.keys() else None,
        "observacao": r["observacao"] if "observacao" in r.keys() else None,
        "condicao": r["condicao"],
        "compra": _num(r["compra"]),
        "venda": _num(r["venda"]),
        "vendida": bool(r["vendida"]),
        "consignado": bool(r["consignado"]) if "consignado" in r.keys() else False,
        "consig_pct": r["consig_pct"] if "consig_pct" in r.keys() else None,
        "consig_tipo": (r["consig_tipo"] if "consig_tipo" in r.keys() else None) or "pct",
        "consig_valor": r["consig_valor"] if "consig_valor" in r.keys() else None,
        "so_manual": bool(r["so_manual"]) if "so_manual" in r.keys() else False,
        "template": r["template"] if "template" in r.keys() else None,
        # foto local (upload) tem prioridade; senão usa a URL externa (CDN do IG)
        "imagem_url": _url(r["imagem"]) or r["imagem_url"],
        "drop_id": r["drop_id"],
        "drop_nome": r["drop_nome"],
        "drop_data": r["drop_data"],
        "origem": r["origem"] if "origem" in r.keys() else "manual",
        "code": r["code"] if "code" in r.keys() else None,
        "num": r["num"] if "num" in r.keys() else None,
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
        d["num"] = _proximo_num(c)   # código sequencial da peça (#p<num>)
        cur = c.execute(
            """INSERT INTO pecas (nome, item, tamanho, largura, comprimento, medida, observacao,
                                  condicao, compra, venda, vendida, drop_id, consignado, consig_pct,
                                  consig_tipo, consig_valor, so_manual, template, num)
               VALUES (:nome, :item, :tamanho, :largura, :comprimento, :medida, :observacao,
                       :condicao, :compra, :venda, :vendida, :drop_id, :consignado, :consig_pct,
                       :consig_tipo, :consig_valor, :so_manual, :template, :num)""",
            {
                "nome": d.get("nome"), "item": d.get("item"), "tamanho": d.get("tamanho"),
                "largura": d.get("largura"), "comprimento": d.get("comprimento"),
                "medida": d.get("medida"), "observacao": d.get("observacao"),
                "condicao": d.get("condicao"), "compra": d.get("compra", 0.0),
                "venda": d.get("venda", 0.0), "vendida": d.get("vendida", 0),
                "drop_id": d.get("drop_id"),
                "consignado": d.get("consignado", 0), "consig_pct": d.get("consig_pct"),
                "consig_tipo": d.get("consig_tipo", "pct"), "consig_valor": d.get("consig_valor"),
                "so_manual": d.get("so_manual", 0), "template": d.get("template"),
                "num": d.get("num"),
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


def _proximo_num(c):
    """Próximo código sequencial de peça (#p<num>). Nunca reusa, mesmo após exclusão."""
    return (c.execute("SELECT COALESCE(MAX(num), 0) FROM pecas").fetchone()[0] or 0) + 1


def _rs(v):
    """Formata valor em R$ ('R$ 120' / 'R$ 39,90'); None se vazio/zero."""
    try:
        v = float(v)
    except (TypeError, ValueError):
        return None
    if v <= 0:
        return None
    return f"R$ {int(v)}" if v == int(v) else "R$ " + f"{v:.2f}".replace(".", ",")


def _ev(label, num, nome, mud):
    """Monta a linha do evento: 'LABEL | nome - p#12  ·  mudança  ·  mudança'."""
    ms = [m for m in mud if m]
    base = f"{label} | {nome} - p#{num}"
    return base + ("  ·  " + "  ·  ".join(ms) if ms else "")


def _mudancas(antes, campos, v_insta):
    """Lista de 'campo antes → depois' — só o que REALMENTE mudou (Insta é a fonte da verdade)."""
    mud = []

    def _s(v):
        return str(v).strip() if v not in (None, "") else ""

    def _mesmo_num(a, b):
        try:
            return float(a.replace(",", ".")) == float(b.replace(",", "."))
        except (ValueError, AttributeError):
            return False

    def dif(rotulo, a, b, numerico=False):
        a, b = _s(a), _s(b)
        if b and a != b and not (numerico and _mesmo_num(a, b)):
            mud.append(f"{rotulo} {a or '—'} → {b}")

    dif("nome:", antes["nome"], campos.get("nome"))
    if v_insta > 0:
        pa, pb = _rs(antes["venda"]), _rs(v_insta)
        if pb and pa != pb:
            mud.append(f"preço {pa or '—'} → {pb}")
    dif("tam", antes["tamanho"], campos.get("tamanho"))
    dif("larg", antes["largura"], campos.get("largura"), numerico=True)
    dif("comp", antes["comprimento"], campos.get("comprimento"), numerico=True)
    dif("cond", antes["condicao"], campos.get("condicao"))
    return mud


# ───────────────────── import do scraper ─────────────────────────
def upsert_scraper(items, preview=False):
    """Recebe peças raspadas (com `code`) e sincroniza no banco:
      - já existe com esse code → atualiza (preserva compra/venda manuais);
      - existe uma peça MANUAL planejada de mesmo nome (sem code) → reconcilia:
        promove ela a 'scraper' (ganha o drop real, sai do planejamento);
      - senão → insere nova.
    Devolve stats {novas, atualizadas, reconciliadas, total}."""
    novas = atualizadas = reconciliadas = recem_vendidas = conferidas = 0
    eventos = []   # log peça-a-peça do que muda NO APP (é o que aparece no run, dry ou normal)
    publicar = {}   # drop_id (manual) -> data do post no Insta: as peças do drop apareceram lá
    with conn() as c:
        for it in items:
            code = it.get("code")
            if not code:
                continue
            # Insta é a fonte da verdade: nome, medidas, condição, vendida etc vêm de lá.
            campos = {
                "nome": it.get("nome"), "item": it.get("item"), "tamanho": it.get("tamanho"),
                "largura": _med_str(it.get("largura")), "comprimento": _med_str(it.get("comprimento")),
                "condicao": it.get("condicao"), "vendida": 1 if it.get("vendida") else 0,
                "imagem_url": it.get("imagem_url"), "postado_em": it.get("drop") or it.get("postado_em"),
                # a foto OFICIAL do post (imagem_url) manda: limpa o upload local não-oficial do
                # planejamento pra ela aparecer. Não baixa nada — usa o link do Insta (que expira;
                # quando sumir, roda "Raspagem completa" que recaptura os links).
                "imagem": None,
            }
            # preço do Insta manda quando a peça está DISPONÍVEL (o post traz R$). Peça vendida
            # não traz preço na legenda → NÃO mexe na venda (preserva o valor pro faturamento).
            v_insta = _num(it.get("venda"))
            if v_insta > 0:
                campos["venda"] = v_insta
            # só sobrescreve a medida especial quando o post traz circunferência
            # (senão não apaga uma palmilha preenchida na mão)
            mj = _medida_json_circ(it.get("circunferencia"))
            if mj:
                campos["medida"] = mj
            nome_disp = (it.get("nome") or code)[:36]
            vend_nova = 1 if it.get("vendida") else 0
            numero = it.get("numero")   # do #p<num> na legenda — chave de match mais confiável
            sel = ("id, so_manual, drop_id, origem, vendida, num, nome, venda, "
                   "tamanho, largura, comprimento, condicao")
            # casa por NÚMERO primeiro (pega até a peça manual planejada, sem depender do nome);
            # senão, casa por CÓDIGO do post (peça já raspada antes).
            alvo = None
            if numero:
                alvo = c.execute(f"SELECT {sel} FROM pecas WHERE num = ?", (numero,)).fetchone()
            if not alvo:
                alvo = c.execute(f"SELECT {sel} FROM pecas WHERE code = ?", (code,)).fetchone()
            if alvo:
                if alvo["so_manual"]:
                    eventos.append(f"TRAVADA | {nome_disp} - p#{alvo['num']} (ignorada)")
                    continue   # peça travada como manual: scraper não atualiza nem duplica
                virou_vendida = bool(vend_nova and not alvo["vendida"])
                mud = _mudancas(alvo, campos, v_insta)
                sets = ", ".join(f"{k} = :{k}" for k in campos)
                # atualiza; se casou uma peça MANUAL (pelo num), promove a scraper e dá o code
                c.execute(f"UPDATE pecas SET {sets}, origem = 'scraper', code = :code WHERE id = :id",
                          {**campos, "code": code, "id": alvo["id"]})
                manual = alvo["origem"] == "manual"
                if manual:
                    reconciliadas += 1
                if virou_vendida:
                    recem_vendidas += 1
                    mud = ([_rs(alvo["venda"])] if _rs(alvo["venda"]) else []) + mud
                    eventos.append(_ev("VENDIDA", alvo["num"], nome_disp, mud))
                elif manual:
                    eventos.append(_ev("RELACIONADA", alvo["num"], nome_disp, mud))
                elif mud:
                    atualizadas += 1
                    eventos.append(_ev("ATUALIZADA", alvo["num"], nome_disp, mud))
                else:
                    conferidas += 1   # peça existente SEM mudança real → não loga (evita spam)
                if alvo["drop_id"] is not None and campos.get("postado_em"):
                    publicar[alvo["drop_id"]] = campos["postado_em"]
                continue

            # reconciliação por NOME (peça manual planejada sem num/tag na legenda — legado).
            nome = _norm(it.get("nome"))
            match = None
            if nome:
                match = c.execute(
                    f"SELECT {sel} FROM pecas WHERE origem = 'manual' AND code IS NULL "
                    "AND lower(trim(nome)) = ?", (nome,)).fetchone()
            if match and match["so_manual"]:
                eventos.append(f"TRAVADA | {nome_disp} - p#{match['num']} (ignorada)")
                continue   # peça TRAVADA de mesmo nome já existe → não atualiza NEM duplica
            if match:
                virou_vendida = bool(vend_nova and not match["vendida"])
                mud = _mudancas(match, campos, v_insta)
                sets = ", ".join(f"{k} = :{k}" for k in campos)
                if match["drop_id"] is not None:
                    c.execute(
                        f"UPDATE pecas SET {sets}, origem = 'scraper', code = :code WHERE id = :id",
                        {**campos, "code": code, "id": match["id"]})
                    if campos.get("postado_em"):
                        publicar[match["drop_id"]] = campos["postado_em"]
                else:
                    c.execute(
                        f"UPDATE pecas SET {sets}, origem = 'scraper', code = :code, drop_id = NULL "
                        "WHERE id = :id", {**campos, "code": code, "id": match["id"]})
                reconciliadas += 1
                label = "RELACIONADA"
                if virou_vendida:
                    recem_vendidas += 1
                    label = "VENDIDA"
                    mud = ([_rs(match["venda"])] if _rs(match["venda"]) else []) + mud
                eventos.append(_ev(label, match["num"], nome_disp, mud))
            else:
                novo_num = _proximo_num(c)   # nova peça raspada ganha código sequencial
                c.execute(
                    """INSERT INTO pecas (nome, item, tamanho, largura, comprimento, medida,
                                          condicao, compra, venda, vendida,
                                          imagem_url, origem, code, postado_em, num)
                       VALUES (:nome, :item, :tamanho, :largura, :comprimento, :medida,
                               :condicao, :compra, :venda, :vendida,
                               :imagem_url, 'scraper', :code, :postado_em, :num)""",
                    {**campos, "medida": campos.get("medida"), "compra": _num(it.get("compra")),
                     "venda": _num(it.get("venda")), "code": code, "num": novo_num})
                novas += 1
                pr = _rs(v_insta)
                mud = [pr] if pr else []
                if vend_nova:
                    recem_vendidas += 1
                    mud = mud + ["já vendida"]
                eventos.append(_ev("NOVA", novo_num, nome_disp, mud))

        # drops manuais cujas peças apareceram no Insta → publicado + data do Insta (fonte da verdade)
        for did, data_post in publicar.items():
            c.execute("UPDATE drops SET status = 'publicado', data = ? WHERE id = ?", (data_post, did))

        if preview:
            c.rollback()   # dry-run: calcula o que MUDARIA e desfaz tudo (não grava nada)

    return {"novas": novas, "atualizadas": atualizadas, "reconciliadas": reconciliadas,
            "recem_vendidas": recem_vendidas, "conferidas": conferidas,
            "drops_publicados": len(publicar), "eventos": eventos,
            "total": novas + atualizadas + reconciliadas}


# ─────────────────────────── KPIs ────────────────────────────────
def _kpis(pecas):
    vend = [p for p in pecas if p["vendida"]]
    disp = [p for p in pecas if not p["vendida"]]
    faturamento = sum(_receita(p) for p in vend)
    cmv = sum(p["compra"] for p in vend)
    lucro = faturamento - cmv
    est_valor = sum(_receita(p) for p in disp)
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
            b["faturamento"] += _receita(p)
            b["lucro"] += _receita(p) - p["compra"]
    return g


def dashboard():
    pecas = listar()["pecas"]
    if not pecas:
        return {"existe": False, "kpis": None, "por_drop": [], "por_categoria": []}

    # agrupa por drop de forma ÚNICA: peça em drop manual pelo drop_id (todos os drops
    # manuais se chamam "rascunho", então não dá pra agrupar por nome), peça raspada sem
    # drop pela data do post. O rótulo/numeração vem do resumo unificado (drops.listar_todos).
    import drops as _drops
    resumo = _drops.listar_todos()["drops"]
    manual_por_id = {d["id"]: d for d in resumo if d["tipo"] == "manual"}
    hist_por_data = {d["data"]: d for d in resumo if d["tipo"] == "historico"}
    for p in pecas:
        if p.get("drop_id") is not None:
            p["_gkey"] = f"m{p['drop_id']}"
        elif p.get("postado_em"):
            p["_gkey"] = f"h{p['postado_em']}"
        else:
            p["_gkey"] = "—"
    gd = _por_grupo(pecas, "_gkey")

    por_drop = []
    for k, v in gd.items():
        linha = {kk: round(vv, 2) if isinstance(vv, float) else vv for kk, vv in v.items()}
        d = None
        if k.startswith("m"):
            d = manual_por_id.get(int(k[1:]))
        elif k.startswith("h"):
            d = hist_por_data.get(k[1:])
        linha["numero"] = d["numero"] if d else None
        linha["drop"] = (d["data"] if d else None) or ""
        por_drop.append(linha)
    por_drop.sort(key=lambda x: x["faturamento"], reverse=True)

    gc = _por_grupo(pecas, "item")
    por_categoria = sorted(
        [{"item": k, **{kk: round(vv, 2) if isinstance(vv, float) else vv for kk, vv in v.items()}}
         for k, v in gc.items()],
        key=lambda x: x["faturamento"], reverse=True)

    return {"existe": True, "kpis": _kpis(pecas), "por_drop": por_drop, "por_categoria": por_categoria}
