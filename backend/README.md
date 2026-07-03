# Quase Nada Brechó — Backend

API de gestão do brechó: cataloga peças (com foto), organiza em **drops** e agenda
o cronograma. Fonte de verdade = SQLite (`data/brecho.db`); imagens em `data/uploads`
(servidas em `/uploads`).

## Rodar local

```bash
python -m venv .venv && source .venv/Scripts/activate   # Windows (Git Bash)
pip install -r requirements.txt
export BRECHO_API_TOKEN=dev-token          # opcional no dev
uvicorn app:app --reload --port 8020
```

Health: `GET http://localhost:8020/health`

## Auth

Header `Authorization: Bearer <BRECHO_API_TOKEN>` em tudo (menos `/health` e `/uploads`).

## Endpoints

| Método | Rota | O que faz |
|--------|------|-----------|
| GET | `/brecho/dashboard` | KPIs (faturamento, lucro, ROI, estoque) + por drop / categoria |
| GET | `/brecho/pecas` | lista todas as peças |
| POST | `/brecho/pecas` | cria peça |
| PUT | `/brecho/pecas/{id}` | edita peça |
| DELETE | `/brecho/pecas/{id}` | remove peça |
| POST | `/brecho/pecas/{id}/imagem` | upload da foto (multipart `file`) |
| GET | `/drops` | lista drops (com contagem de peças) |
| GET | `/drops/{id}` | drop + suas peças |
| POST | `/drops` | cria drop |
| PUT | `/drops/{id}` | edita drop (nome, data, status, ordem) |
| DELETE | `/drops/{id}` | remove drop (peças ficam sem drop) |
| PUT | `/drops/{id}/pecas` | define exatamente as peças do drop |
| POST | `/drops/gerar` | **gera drops automaticamente** e distribui as peças |

### `POST /drops/gerar`

```jsonc
{
  "qtd_drops": 6,            // OU "por_drop": 10
  "data_inicio": "2026-07-08",
  "intervalo_dias": 7,       // semanal
  "peca_ids": null,          // null = todas as peças sem drop
  "prefixo_nome": "Drop",
  "status": "agendado"
}
```

Embaralha as peças e reparte o mais uniforme possível (65 em 6 → `[11,11,11,11,11,10]`),
criando os drops já com as datas do cronograma.

## Variáveis de ambiente

- `BRECHO_API_TOKEN` — token da API
- `BRECHO_DATA_DIR` — onde ficam o banco e as imagens (default: `./data`)
