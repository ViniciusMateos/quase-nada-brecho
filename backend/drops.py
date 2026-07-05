"""
Drops: agrupamentos datados de peças + o gerador automático.

O gerador é o motivo do app existir: você cataloga N peças, fala "distribui em K
drops a partir de tal data, de X em X dias", e ele:
  - embaralha as peças,
  - reparte o mais uniforme possível (resto vira +1 nos primeiros drops),
  - cria os drops já com as datas do cronograma,
  - carimba o drop_id em cada peça.

Ex.: 65 peças em 6 drops → tamanhos [11, 11, 11, 11, 11, 10].
"""
import random
from collections import defaultdict
from datetime import date, timedelta

from db import conn, row, rows

STATUS = ("rascunho", "agendado", "publicado")


def _drop_dict(r):
    return {
        "id": r["id"], "nome": r["nome"], "data": r["data"],
        "status": r["status"], "ordem": r["ordem"],
        "qtd_pecas": r["qtd_pecas"] if "qtd_pecas" in r.keys() else 0,
    }


_SELECT = """
SELECT d.*, (SELECT COUNT(*) FROM pecas p WHERE p.drop_id = d.id) AS qtd_pecas
FROM drops d
"""


# ─────────────────────────── CRUD ────────────────────────────────
def listar():
    with conn() as c:
        r = rows(c.execute(_SELECT + " ORDER BY d.ordem ASC, d.data ASC, d.id ASC"))
    return {"drops": [_drop_dict(x) for x in r]}


def obter(drop_id):
    from pecas import _peca_dict  # evita import circular no topo
    with conn() as c:
        d = row(c.execute(_SELECT + " WHERE d.id = ?", (drop_id,)))
        if not d:
            return None
        det = rows(c.execute(
            """SELECT p.*, dd.nome AS drop_nome, dd.data AS drop_data
               FROM pecas p LEFT JOIN drops dd ON dd.id = p.drop_id
               WHERE p.drop_id = ? ORDER BY p.vendida ASC, p.criado_em DESC""", (drop_id,)))
    return {**_drop_dict(d), "pecas": [_peca_dict(x) for x in det]}


def _proxima_ordem(c):
    r = c.execute("SELECT COALESCE(MAX(ordem), 0) + 1 AS n FROM drops").fetchone()
    return r["n"]


def add(campos):
    nome = (campos or {}).get("nome") or "Novo drop"
    data = (campos or {}).get("data")
    status = (campos or {}).get("status") or "rascunho"
    with conn() as c:
        ordem = _proxima_ordem(c)
        cur = c.execute(
            "INSERT INTO drops (nome, data, status, ordem) VALUES (?, ?, ?, ?)",
            (nome, data, status if status in STATUS else "rascunho", ordem))
        did = cur.lastrowid
    return obter(did)


def editar(drop_id, campos):
    campos = campos or {}
    permit = {}
    for k in ("nome", "data", "status", "ordem"):
        if k in campos:
            permit[k] = campos[k]
    if "status" in permit and permit["status"] not in STATUS:
        permit.pop("status")
    if not permit:
        return obter(drop_id)
    sets = ", ".join(f"{k} = :{k}" for k in permit)
    permit["id"] = drop_id
    with conn() as c:
        c.execute(f"UPDATE drops SET {sets} WHERE id = :id", permit)
    return obter(drop_id)


def remover(drop_id):
    """Remove o drop; as peças ficam sem drop (ON DELETE SET NULL)."""
    with conn() as c:
        c.execute("DELETE FROM drops WHERE id = ?", (drop_id,))
    return True


def set_pecas(drop_id, peca_ids):
    """Define exatamente quais peças pertencem ao drop. Só peças do catálogo manual
    entram — as do scraper já têm o drop delas no Insta."""
    ids = [int(x) for x in (peca_ids or [])]
    with conn() as c:
        c.execute("UPDATE pecas SET drop_id = NULL WHERE drop_id = ? AND origem = 'manual'", (drop_id,))
        for pid in ids:
            c.execute("UPDATE pecas SET drop_id = ? WHERE id = ? AND origem = 'manual'", (drop_id, pid))
    return obter(drop_id)


# ─────────────────────── gerador automático ──────────────────────
def _reparticao(total, k):
    """Divide `total` itens em `k` grupos o mais uniforme possível.
    Ex.: (65, 6) → [11, 11, 11, 11, 11, 10]."""
    base, resto = divmod(total, k)
    return [base + (1 if i < resto else 0) for i in range(k)]


def gerar(payload):
    """
    payload = {
      qtd_drops | por_drop : quantos drops OU quantas peças por drop
      data_inicio          : "AAAA-MM-DD" (default: hoje)
      intervalo_dias       : cadência entre drops (default: 7 = semanal)
      peca_ids             : lista de ids OU null = todas as peças sem drop
      prefixo_nome         : default "Drop"
      status               : status inicial dos drops (default "agendado")
    }
    """
    payload = payload or {}
    intervalo = int(payload.get("intervalo_dias") or 7)
    prefixo = (payload.get("prefixo_nome") or "Drop").strip() or "Drop"
    status = payload.get("status") or "agendado"
    if status not in STATUS:
        status = "agendado"

    di = payload.get("data_inicio")
    try:
        inicio = date.fromisoformat(di) if di else date.today()
    except ValueError:
        inicio = date.today()

    # quais peças entram
    ids = payload.get("peca_ids")
    with conn() as c:
        if ids:
            marks = ",".join("?" for _ in ids)
            r = rows(c.execute(f"SELECT id FROM pecas WHERE id IN ({marks})", [int(x) for x in ids]))
        else:
            # só peças do catálogo manual sem drop — o histórico do scraper não entra
            # no planejamento de drops futuros
            r = rows(c.execute("SELECT id FROM pecas WHERE drop_id IS NULL AND origem = 'manual'"))
    peca_ids = [x["id"] for x in r]
    if not peca_ids:
        return {"ok": False, "erro": "sem peças pra distribuir", "drops": []}

    total = len(peca_ids)
    if payload.get("qtd_drops"):
        k = max(1, int(payload["qtd_drops"]))
    elif payload.get("por_drop"):
        por = max(1, int(payload["por_drop"]))
        k = max(1, -(-total // por))          # ceil(total / por)
    else:
        k = 1
    k = min(k, total)

    random.shuffle(peca_ids)
    tamanhos = _reparticao(total, k)

    criados = []
    with conn() as c:
        ordem0 = _proxima_ordem(c)
        cursor = 0
        for i, tam in enumerate(tamanhos):
            data_drop = (inicio + timedelta(days=intervalo * i)).isoformat()
            nome = f"{prefixo} {i + 1}"
            cur = c.execute(
                "INSERT INTO drops (nome, data, status, ordem) VALUES (?, ?, ?, ?)",
                (nome, data_drop, status, ordem0 + i))
            did = cur.lastrowid
            fatia = peca_ids[cursor:cursor + tam]
            cursor += tam
            for pid in fatia:
                c.execute("UPDATE pecas SET drop_id = ? WHERE id = ?", (did, pid))
            criados.append(did)

    return {"ok": True, "drops": [obter(d) for d in criados]}


# ─────────────────── histórico unificado + saldo ─────────────────
def _saldo(pecas):
    from pecas import _receita   # consignada conta só a % que fica pra mim
    total = len(pecas)
    vend = [p for p in pecas if p["vendida"]]
    faturamento = sum(_receita(p) for p in vend)
    cmv = sum(p["compra"] for p in vend)          # custo do que vendeu
    gasto = sum(p["compra"] for p in pecas)       # investido no drop inteiro
    return {
        "qtd_pecas": total,
        "vendidas": len(vend),
        "disponiveis": total - len(vend),
        "faturamento": round(faturamento, 2),
        "gasto": round(gasto, 2),
        "lucro": round(faturamento - cmv, 2),      # lucro líquido do que vendeu
        "sold_out": total > 0 and len(vend) == total,
    }


def listar_todos():
    """Todos os drops: os manuais (tabela drops) + o histórico do scraper agrupado
    pela data do post. Ordenado do mais novo pro mais antigo, com o saldo de cada um."""
    from pecas import _peca_dict
    with conn() as c:
        drops_rows = rows(c.execute("SELECT * FROM drops"))
        pecas_rows = rows(c.execute(
            "SELECT p.*, d.nome AS drop_nome, d.data AS drop_data "
            "FROM pecas p LEFT JOIN drops d ON d.id = p.drop_id"))
    pecas = [_peca_dict(r) for r in pecas_rows]

    out = []
    for d in drops_rows:
        ps = [p for p in pecas if p["drop_id"] == d["id"]]
        out.append({"tipo": "manual", "id": d["id"], "nome": d["nome"], "data": d["data"],
                    "status": d["status"], **_saldo(ps)})

    hist = defaultdict(list)
    for p in pecas:
        if p.get("origem") == "scraper":
            hist[p.get("postado_em")].append(p)
    for data, ps in hist.items():
        out.append({"tipo": "historico", "id": None, "nome": None, "data": data,
                    "status": "publicado", **_saldo(ps)})

    # numeração cronológica: Drop 1 = o mais antigo (drafts sem data ficam por último = mais novos)
    for i, d in enumerate(sorted(out, key=lambda x: (x["data"] or "9999-12-31")), 1):
        d["numero"] = i
    # exibição: rascunho no topo, depois do mais novo pro mais antigo
    out.sort(key=lambda x: (0 if x["status"] == "rascunho" else 1, -x["numero"]))
    return {"drops": out}


def pecas_por_data(data):
    """Peças do scraper de um drop histórico (por data do post) — leitura do detalhe."""
    from pecas import _peca_dict
    with conn() as c:
        pr = rows(c.execute(
            "SELECT p.*, NULL AS drop_nome, NULL AS drop_data FROM pecas p "
            "WHERE p.origem = 'scraper' AND p.postado_em IS ? ORDER BY p.vendida ASC, p.venda DESC",
            (data,)))
    return {"pecas": [_peca_dict(r) for r in pr]}
