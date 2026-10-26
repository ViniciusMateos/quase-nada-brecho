"""
Peças do brechó: CRUD + KPIs do dashboard.

A matemática dos KPIs é a mesma do app antigo (faturamento, lucro, ROI, estoque),
mas agora lendo do SQLite em vez da planilha do scraper.
"""
import json
from collections import defaultdict
from datetime import date

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
             "consig_tipo", "consig_valor", "so_manual", "template", "vendida_em", "venda_estimada")


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
        elif k == "vendida_em":
            out[k] = (str(v)[:10] or None) if v not in (None, "", "null") else None
        elif k == "venda_estimada":
            out[k] = 1 if (v is True or str(v).strip().lower() in ("sim", "true", "1")) else 0
        else:
            out[k] = v
    return out


def _url(imagem):
    """URL da foto local, com ?v=<mtime>. O print recapturado é gravado com o MESMO nome
    (scraper-<code>.jpg) e o app guarda imagem em cache pela URL — sem a versão ele continuaria
    mostrando a foto velha (com as bolhas do IG) depois da recaptura."""
    if not imagem:
        return None
    try:
        import settings
        return f"/uploads/{imagem}?v={int((settings.UPLOADS_DIR / imagem).stat().st_mtime)}"
    except Exception:
        return f"/uploads/{imagem}"


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
        "vendida_em": r["vendida_em"] if "vendida_em" in r.keys() else None,
        "venda_estimada": bool(r["venda_estimada"]) if "venda_estimada" in r.keys() else False,
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
        _reg_evento(c, pid, "CRIADA", [], origem="manual")
    return obter(pid)


def _log_edicao_manual(c, peca_id, antes, d):
    """Histórico das mudanças MANUAIS que importam: virou/desmarcou vendida ou mudou o preço."""
    if "vendida" in d and int(d.get("vendida") or 0) != int(antes["vendida"] or 0):
        if d.get("vendida"):
            pr = _rs(d.get("venda", antes["venda"]))
            _reg_evento(c, peca_id, "VENDIDA", [pr] if pr else [], origem="manual")
        else:
            _reg_evento(c, peca_id, "DESMARCADA", ["venda desfeita"], origem="manual")
        return
    if "venda" in d and _rs(d.get("venda")) != _rs(antes["venda"]):
        _reg_evento(c, peca_id, "ATUALIZADA",
                    [f"preço {_rs(antes['venda']) or '—'} → {_rs(d.get('venda')) or '—'}"],
                    origem="manual")


def editar(peca_id, campos):
    d = _coagir(campos)
    # data da venda: marcou vendida sem informar data → assume hoje (data real, não estimada);
    # desmarcou vendida → limpa a data.
    if d.get("vendida") == 1 and "vendida_em" not in d:
        d["vendida_em"] = date.today().isoformat()
        d.setdefault("venda_estimada", 0)
    if d.get("vendida") == 0:
        d["vendida_em"] = None
        d["venda_estimada"] = 0
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
        antes = c.execute("SELECT vendida, venda FROM pecas WHERE id = ?", (peca_id,)).fetchone()
        c.execute(f"UPDATE pecas SET {sets} WHERE id = :id", d)
        if antes:
            _log_edicao_manual(c, peca_id, antes, d)
    return obter(peca_id)


def set_imagem(peca_id, nome_arquivo):
    with conn() as c:
        c.execute("UPDATE pecas SET imagem = ? WHERE id = ?", (nome_arquivo, peca_id))
    return obter(peca_id)


def dividir(peca_id, campos):
    """"Dividir conjunto": vendeu só UMA parte de uma peça que é conjunto. Cria uma peça NOVA pra parte
    vendida (já vendida, mesmo drop, mesma data do post, foto do conjunto, travada) e o conjunto fica
    com o preço e o custo que SOBRARAM, à venda e com o link do post. Como dashboard, calendário e drops
    somam peça por peça, os números ficam certos sem mudar nada neles. O custo da parte sai proporcional
    ao preço. Devolve {"original": peça, "parte": peça nova}; ValueError se não dá pra dividir."""
    d = campos or {}
    nome = (d.get("nome") or "").strip()
    venda = _num(d.get("venda"))
    vendida_em = (d.get("vendida_em") or date.today().isoformat())[:10]
    with conn() as c:
        p = c.execute("SELECT * FROM pecas WHERE id = ?", (peca_id,)).fetchone()
        if not p:
            raise ValueError("peça não encontrada")
        if p["vendida"]:
            raise ValueError("essa peça já está vendida")
        if not nome:
            raise ValueError("diz qual parte vendeu")
        total = _num(p["venda"])
        if venda <= 0 or venda >= total:
            raise ValueError(f"o preço da parte tem que ser maior que zero e menor que {_rs(total) or 'o do conjunto'}")
        frac = venda / total
        compra_parte = round(_num(p["compra"]) * frac, 2)
        cv = p["consig_valor"]
        cv_parte = round(_num(cv) * frac, 2) if cv else None
        novo_num = _proximo_num(c)
        cur = c.execute(
            """INSERT INTO pecas (nome, item, condicao, compra, venda, vendida, vendida_em, venda_estimada,
                                  imagem, imagem_url, drop_id, origem, postado_em, consignado, consig_tipo,
                                  consig_pct, consig_valor, so_manual, observacao, num)
               VALUES (?, ?, ?, ?, ?, 1, ?, 0, ?, ?, ?, 'manual', ?, ?, ?, ?, ?, 1, ?, ?)""",
            (nome, nome.split()[0], p["condicao"], compra_parte, venda, vendida_em,
             p["imagem"], p["imagem_url"], p["drop_id"], p["postado_em"], p["consignado"],
             p["consig_tipo"], p["consig_pct"], cv_parte, f"parte do conjunto #p{p['num']}", novo_num))
        pid = cur.lastrowid
        sobra = round(total - venda, 2)
        c.execute("UPDATE pecas SET venda = ?, compra = ?, consig_valor = ? WHERE id = ?",
                  (sobra, round(_num(p["compra"]) - compra_parte, 2),
                   round(_num(cv) - cv_parte, 2) if cv else cv, peca_id))
        _reg_evento(c, peca_id, "DIVIDIDA",
                    [f"vendeu {nome} ({_rs(venda)}) → virou #p{novo_num}", f"sobrou {_rs(sobra)} à venda"],
                    origem="manual")
        _reg_evento(c, pid, "VENDIDA", [_rs(venda), f"parte do conjunto #p{p['num']}"], origem="manual")
    return {"original": obter(peca_id), "parte": obter(pid)}


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


def _reg_evento(c, peca_id, tipo, mud=None, origem="scraper"):
    """Grava no HISTÓRICO da peça o que aconteceu (vendida, preço mudou, nova…). `mud` = lista de
    strings de mudança (pode ser vazia). É o que o app mostra no detalhe da peça."""
    if not peca_id:
        return
    texto = "  ·  ".join(m for m in (mud or []) if m)
    c.execute("INSERT INTO peca_eventos (peca_id, tipo, texto, origem) VALUES (?, ?, ?, ?)",
              (peca_id, tipo, texto, origem))


def historico(peca_id):
    """Eventos da peça, do mais novo pro mais antigo (pro detalhe da peça no app)."""
    with conn() as c:
        evs = rows(c.execute(
            "SELECT id, criado_em, tipo, texto, origem FROM peca_eventos "
            "WHERE peca_id = ? ORDER BY id DESC", (peca_id,)))
    return {"eventos": evs}


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
# O EMULADOR manda SEM data do post e SEM URL de CDN. NÃO sobrescreve esses campos com vazio —
# senão apaga a data/imagem que a peça já tinha (foi o que criou o "drop fantasma" das sem-data).
_PRESERVA_SE_VAZIO = ("postado_em", "imagem_url")
def _campos_update(campos):
    return {k: v for k, v in campos.items() if v or k not in _PRESERVA_SE_VAZIO}


def _sync_travada(c, alvo, code, vend_nova, postado_em, trecho_vendido=None):
    """Peça TRAVADA (so_manual): o scraper não mexe nos DADOS nem na VENDA dela. Ex.: conjunto de 2
    peças — se só uma vende, a legenda diz "vendido" e marcar o conjunto inteiro estaria errado. Ele só:
      - guarda o LINK do post (code): sem o link a conferência por link nunca alcança a peça;
      - AVISA pra conferir na mão quando o post diz "vendido" e a peça está à venda no app — uma vez
        por texto (não repete a cada raspagem enquanto o trecho "vendido" da legenda for o mesmo).
    Devolve (label, mudanças): "CONFERIR" (aviso), "ATUALIZADA" (só ganhou o link) ou None."""
    sets, params, mud = [], {"id": alvo["id"]}, []
    if code and not alvo["code"]:
        dono = c.execute("SELECT id FROM pecas WHERE code = ? AND id <> ?", (code, alvo["id"])).fetchone()
        if not dono:                      # code é único: não rouba de outra peça
            sets.append("code = :code")
            params["code"] = code
            mud.append("link do post guardado")
    if postado_em and not alvo["postado_em"]:
        sets.append("postado_em = :pe")
        params["pe"] = postado_em
    if sets:
        c.execute(f"UPDATE pecas SET {', '.join(sets)} WHERE id = :id", params)
    if vend_nova and not alvo["vendida"]:
        aviso = f"post diz vendido: «{trecho_vendido}»" if trecho_vendido else "o post diz vendido"
        ja = c.execute("SELECT texto FROM peca_eventos WHERE peca_id = ? AND tipo = 'CONFERIR' "
                       "ORDER BY id DESC LIMIT 1", (alvo["id"],)).fetchone()
        if not (ja and aviso in (ja["texto"] or "")):
            return "CONFERIR", mud + [aviso]
    return ("ATUALIZADA", mud) if mud else None


def upsert_scraper(items, preview=False, limpar_imagem=True):
    """Recebe peças raspadas (com `code`) e sincroniza no banco:
      - já existe com esse code → atualiza (preserva compra/venda manuais);
      - existe uma peça MANUAL planejada de mesmo nome (sem code) → reconcilia:
        promove ela a 'scraper' (ganha o drop real, sai do planejamento);
      - senão → insere nova.
    Devolve stats {novas, atualizadas, reconciliadas, total}."""
    novas = atualizadas = reconciliadas = recem_vendidas = conferidas = a_conferir = 0
    eventos = []   # log peça-a-peça do que muda NO APP (é o que aparece no run, dry ou normal)
    publicar = {}   # drop_id (manual) -> data do post no Insta: as peças do drop apareceram lá
    with conn() as c:
        for it in items:
            code = it.get("code")
            numero = it.get("numero")   # #p<num> da legenda — casa até sem o link do post
            if not code and not numero:
                continue   # sem code E sem #p: não há como casar nem inserir com segurança
            # Insta é a fonte da verdade: nome, medidas, condição, vendida etc vêm de lá.
            campos = {
                "nome": it.get("nome"), "item": it.get("item"), "tamanho": it.get("tamanho"),
                "largura": _med_str(it.get("largura")), "comprimento": _med_str(it.get("comprimento")),
                "condicao": it.get("condicao"), "vendida": 1 if it.get("vendida") else 0,
                "imagem_url": it.get("imagem_url"), "postado_em": it.get("drop") or it.get("postado_em"),
            }
            # Playwright: a foto OFICIAL é a URL de CDN (imagem_url), então zera o upload local
            # do planejamento (limpar_imagem=True) pra ela aparecer. EMULADOR: não há URL de CDN —
            # a foto é o print recortado, gravado via set_imagem DEPOIS do upsert — então
            # limpar_imagem=False NÃO mexe no `imagem` (preserva a foto local; não apaga nada de
            # peça que o device não recapturou).
            if limpar_imagem:
                campos["imagem"] = None
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
            nome_disp = (it.get("nome") or code or (f"#p{numero}" if numero else "?"))[:36]
            vend_nova = 1 if it.get("vendida") else 0
            sel = ("id, so_manual, drop_id, origem, vendida, num, nome, venda, "
                   "tamanho, largura, comprimento, condicao, code, postado_em")
            # casa por NÚMERO primeiro (pega até a peça manual planejada, sem depender do nome);
            # senão, casa por CÓDIGO do post (peça já raspada antes).
            alvo = None
            if numero:
                alvo = c.execute(f"SELECT {sel} FROM pecas WHERE num = ?", (numero,)).fetchone()
            if not alvo:
                alvo = c.execute(f"SELECT {sel} FROM pecas WHERE code = ?", (code,)).fetchone()
            if alvo:
                if alvo["so_manual"]:
                    # travada: dados intocados; só o link do post e a venda sincronizam
                    r = _sync_travada(c, alvo, code, vend_nova, campos.get("postado_em"),
                                      it.get("trecho_vendido"))
                    if r:
                        label, mud = r
                        if label == "CONFERIR":
                            a_conferir += 1
                        else:
                            atualizadas += 1
                        eventos.append(_ev(label, alvo["num"], nome_disp, mud + ["peça travada: confere na mão"]))
                        _reg_evento(c, alvo["id"], label, mud)
                    else:
                        conferidas += 1
                    continue
                virou_vendida = bool(vend_nova and not alvo["vendida"])
                mud = _mudancas(alvo, _campos_update(campos), v_insta)
                if virou_vendida:   # carimba a data da venda (estimada = dia da detecção; confirmável no app)
                    campos["vendida_em"] = date.today().isoformat()
                    campos["venda_estimada"] = 1
                cu = _campos_update(campos)   # pula postado_em/imagem_url VAZIOS (não apaga o existente)
                sets = ", ".join(f"{k} = :{k}" for k in cu)
                if code:
                    # post COM link: fonte completa → promove a scraper e grava o code
                    c.execute(f"UPDATE pecas SET {sets}, origem = 'scraper', code = :code WHERE id = :id",
                              {**cu, "code": code, "id": alvo["id"]})
                else:
                    # post SEM link (SHARE falhou) casado por #p: atualiza os campos (inclui vendida),
                    # mas NÃO promove a scraper nem mexe em code/postado_em — senão a peça ficaria sem
                    # data e reviveria o "drop fantasma". Melhor registrar a venda do que perdê-la.
                    c.execute(f"UPDATE pecas SET {sets} WHERE id = :id", {**cu, "id": alvo["id"]})
                manual = (alvo["origem"] == "manual") and bool(code)   # só conta reconciliação se deu code
                if manual:
                    reconciliadas += 1
                if virou_vendida:
                    recem_vendidas += 1
                    mud = ([_rs(alvo["venda"])] if _rs(alvo["venda"]) else []) + mud
                    eventos.append(_ev("VENDIDA", alvo["num"], nome_disp, mud))
                    _reg_evento(c, alvo["id"], "VENDIDA", mud)
                elif manual:
                    eventos.append(_ev("RELACIONADA", alvo["num"], nome_disp, mud))
                    _reg_evento(c, alvo["id"], "RELACIONADA", mud)
                elif mud:
                    atualizadas += 1
                    eventos.append(_ev("ATUALIZADA", alvo["num"], nome_disp, mud))
                    _reg_evento(c, alvo["id"], "ATUALIZADA", mud)
                else:
                    conferidas += 1   # peça existente SEM mudança real → não loga (evita spam)
                if alvo["drop_id"] is not None and campos.get("postado_em"):
                    publicar[alvo["drop_id"]] = campos["postado_em"]
                continue

            # não casou por #p nem por code. Sem link não dá pra inserir (viraria peça sem
            # code/sem data = drop fantasma) — registra e segue; só insere peça NOVA se tiver code.
            if not code:
                eventos.append(f"SEM LINK | {nome_disp} - #p{numero or '?'} (não casou, pulada)")
                continue

            # reconciliação por NOME (peça manual planejada sem num/tag na legenda — legado).
            nome = _norm(it.get("nome"))
            match = None
            if nome:
                match = c.execute(
                    f"SELECT {sel} FROM pecas WHERE origem = 'manual' AND code IS NULL "
                    "AND lower(trim(nome)) = ?", (nome,)).fetchone()
            if match and match["so_manual"]:
                # travada de mesmo nome: não duplica nem mexe nos dados — só link do post e venda
                r = _sync_travada(c, match, code, vend_nova, campos.get("postado_em"),
                                  it.get("trecho_vendido"))
                if r:
                    label, mud = r
                    if label == "CONFERIR":
                        a_conferir += 1
                    else:
                        atualizadas += 1
                    eventos.append(_ev(label, match["num"], nome_disp, mud + ["peça travada: confere na mão"]))
                    _reg_evento(c, match["id"], label, mud)
                else:
                    conferidas += 1
                continue
            if match:
                virou_vendida = bool(vend_nova and not match["vendida"])
                mud = _mudancas(match, _campos_update(campos), v_insta)
                if virou_vendida:   # carimba a data da venda (estimada = dia da detecção)
                    campos["vendida_em"] = date.today().isoformat()
                    campos["venda_estimada"] = 1
                cu = _campos_update(campos)   # pula postado_em/imagem_url VAZIOS (não apaga o existente)
                sets = ", ".join(f"{k} = :{k}" for k in cu)
                if match["drop_id"] is not None:
                    c.execute(
                        f"UPDATE pecas SET {sets}, origem = 'scraper', code = :code WHERE id = :id",
                        {**cu, "code": code, "id": match["id"]})
                    if campos.get("postado_em"):
                        publicar[match["drop_id"]] = campos["postado_em"]
                else:
                    c.execute(
                        f"UPDATE pecas SET {sets}, origem = 'scraper', code = :code, drop_id = NULL "
                        "WHERE id = :id", {**cu, "code": code, "id": match["id"]})
                reconciliadas += 1
                label = "RELACIONADA"
                if virou_vendida:
                    recem_vendidas += 1
                    label = "VENDIDA"
                    mud = ([_rs(match["venda"])] if _rs(match["venda"]) else []) + mud
                eventos.append(_ev(label, match["num"], nome_disp, mud))
                _reg_evento(c, match["id"], label, mud)
            else:
                novo_num = _proximo_num(c)   # nova peça raspada ganha código sequencial
                cur = c.execute(
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
                _reg_evento(c, cur.lastrowid, "NOVA", mud)

        # drops manuais cujas peças apareceram no Insta → publicado + data do Insta (fonte da verdade)
        for did, data_post in publicar.items():
            c.execute("UPDATE drops SET status = 'publicado', data = ? WHERE id = ?", (data_post, did))

        if preview:
            c.rollback()   # dry-run: calcula o que MUDARIA e desfaz tudo (não grava nada)

    return {"novas": novas, "atualizadas": atualizadas, "reconciliadas": reconciliadas,
            "recem_vendidas": recem_vendidas, "conferidas": conferidas, "a_conferir": a_conferir,
            "drops_publicados": len(publicar), "eventos": eventos,
            "total": novas + atualizadas + reconciliadas}


# ─────────────────────────── KPIs ────────────────────────────────
# vendas dentro da janela [desde, ate] pela data da venda (vendida_em, YYYY-MM-DD).
# datas None = sem limite daquele lado. Peça vendida sem vendida_em fica de fora da janela.
def _venda_no_periodo(p, desde, ate):
    if not p["vendida"]:
        return False
    d = (p.get("vendida_em") or "")[:10]
    if not d:
        return False
    if desde and d < desde:
        return False
    if ate and d > ate:
        return False
    return True


def _kpis(vend, disp):
    faturamento = sum(_receita(p) for p in vend)
    cmv = sum(p["compra"] for p in vend)
    lucro = faturamento - cmv
    est_valor = sum(_receita(p) for p in disp)
    est_custo = sum(p["compra"] for p in disp)
    total = len(vend) + len(disp)
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
        "investido_total": round(cmv + est_custo, 2),
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


def dashboard(desde=None, ate=None):
    pecas = listar()["pecas"]
    if not pecas:
        return {"existe": False, "kpis": None, "por_drop": [], "por_categoria": []}

    # Período (opcional) = janela de VENDAS pela data da venda. As métricas de venda
    # (faturamento, lucro, margem, ROI, ticket, por_drop/categoria) consideram só o que
    # vendeu na janela; o ESTOQUE segue sendo o snapshot atual (peças ainda disponíveis).
    if desde or ate:
        vend = [p for p in pecas if _venda_no_periodo(p, desde, ate)]
    else:
        vend = [p for p in pecas if p["vendida"]]
    disp = [p for p in pecas if not p["vendida"]]
    pecas = vend + disp   # base do dashboard (vendas do período + estoque atual)

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

    return {"existe": True, "kpis": _kpis(vend, disp), "por_drop": por_drop, "por_categoria": por_categoria}
