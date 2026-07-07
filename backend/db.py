"""
Camada de banco (SQLite) do Quase Nada Brechó.

Duas tabelas:
  - drops : cada drop tem nome, data agendada e status (rascunho/agendado/publicado)
  - pecas : cada peça pertence (ou não) a um drop; guarda foto, preços e metadados

Conexão por-request com row_factory = dict, PRAGMA foreign_keys ligado.
"""
import sqlite3
from contextlib import contextmanager

import settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS drops (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nome        TEXT    NOT NULL,
    data        TEXT,                         -- ISO AAAA-MM-DD (data do drop)
    status      TEXT    NOT NULL DEFAULT 'rascunho',
    ordem       INTEGER NOT NULL DEFAULT 0,
    criado_em   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pecas (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nome        TEXT,
    item        TEXT,                         -- categoria (camisa, calça...)
    tamanho     TEXT,
    condicao    TEXT,
    compra      REAL    NOT NULL DEFAULT 0,   -- custo de aquisição
    venda       REAL    NOT NULL DEFAULT 0,   -- preço de venda
    vendida     INTEGER NOT NULL DEFAULT 0,
    imagem      TEXT,                         -- nome do arquivo em /uploads
    imagem_url  TEXT,                         -- URL externa (CDN do IG, quando vem do scraper)
    drop_id     INTEGER REFERENCES drops(id) ON DELETE SET NULL,
    origem      TEXT    NOT NULL DEFAULT 'manual',   -- 'manual' | 'scraper'
    code        TEXT,                         -- código do post IG (chave do scraper, p/ upsert)
    postado_em  TEXT,                         -- data do post (histórico, vindo do scraper)
    criado_em   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pecas_drop ON pecas(drop_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pecas_code ON pecas(code) WHERE code IS NOT NULL;
"""

# colunas adicionadas depois da v1 — migração leve pra bancos já criados
_MIGRACOES = [
    ("pecas", "imagem_url", "TEXT"),
    ("pecas", "origem", "TEXT NOT NULL DEFAULT 'manual'"),
    ("pecas", "code", "TEXT"),
    ("pecas", "postado_em", "TEXT"),
    ("pecas", "largura", "TEXT"),   # medida padrão: largura (l XXcm na legenda)
    ("pecas", "comprimento", "TEXT"),  # medida padrão: comprimento (c XXcm na legenda)
    ("pecas", "medida", "TEXT"),   # medidas especiais (JSON: circunferência do boné, palmilha do tênis)
    ("pecas", "observacao", "TEXT"),  # observação livre sobre a peça (vai no template do post)
    ("pecas", "consignado", "INTEGER NOT NULL DEFAULT 0"),  # peça de terceiro (só recebo uma parte)
    ("pecas", "consig_pct", "REAL"),  # % do valor da venda que fica pra mim (ex: 40) — modo 'pct'
    ("pecas", "consig_tipo", "TEXT NOT NULL DEFAULT 'pct'"),  # 'pct' (%) ou 'valor' (R$ fixo)
    ("pecas", "consig_valor", "REAL"),  # R$ fixo que fica pra mim por venda — modo 'valor'
    ("pecas", "so_manual", "INTEGER NOT NULL DEFAULT 0"),  # peça travada: o scraper NÃO atualiza
    ("pecas", "template", "TEXT"),  # legenda do post customizada à mão (senão gera automático no app)
]


def init_db():
    with conn() as c:
        c.executescript(SCHEMA)
        existentes = {r["name"] for r in c.execute("PRAGMA table_info(pecas)")}
        for _tab, col, tipo in _MIGRACOES:
            if col not in existentes:
                c.execute(f"ALTER TABLE pecas ADD COLUMN {col} {tipo}")


@contextmanager
def conn():
    c = sqlite3.connect(settings.DB_PATH)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys = ON")
    try:
        yield c
        c.commit()
    finally:
        c.close()


def rows(cur):
    return [dict(r) for r in cur.fetchall()]


def row(cur):
    r = cur.fetchone()
    return dict(r) if r else None
