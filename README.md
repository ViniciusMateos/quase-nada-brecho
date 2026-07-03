# Quase Nada Brechó

App de **gestão do brechó**: cataloga peças (com foto), organiza em **drops** e agenda
o cronograma de lançamentos. Nasceu de separar a parte de gerenciamento que morava no
Quase Nada Bots — lá agora fica só automação de Instagram (DM, Autolikes).

Identidade visual: laranja original da marca (`#FF8234`) — a cor de origem do brechó.

## Estrutura

```
quase-nada-brecho/
├── backend/          FastAPI + SQLite (peças, drops, upload de fotos, runs do scraper)
│   ├── app.py        rotas da API + WebSocket de logs
│   ├── db.py         schema + conexão SQLite
│   ├── pecas.py      CRUD das peças + KPIs do dashboard
│   ├── drops.py      CRUD dos drops + gerador automático
│   ├── scraper.py    ponte com o worker + import da planilha → SQLite
│   ├── run_manager.py  roda o scraper como subprocesso e faz stream do log
│   ├── notify.py     push (Expo) quando a raspagem termina
│   └── settings.py   config (token, paths, worker)
├── frontend/         Expo / React Native (mesmo esqueleto dos outros apps QN)
│   └── src/
│       ├── screens/  Hub, Peças, Drops, DropDetail, GerarDrops, Dashboard,
│       │             Sincronizar, Run (logs ao vivo), InstagramLogin, Settings
│       ├── lib/      api + cliente axios + push
│       ├── ui/       componentes (loader do cachorro, botões, cards, progresso)
│       └── theme.ts  paleta laranja
└── workers/
    └── brecho-tracker/   scraper Playwright do @brechoquasenadaa (movido do Bots)
```

## Funcionalidades

- **Peças** — cataloga cada peça com foto, título, categoria, tamanho, condição, compra/venda; marca vendida; filtra por disponível/vendida/sem-drop.
- **Drops** — agrupa peças em drops datados (rascunho → agendado → publicado).
- **Gerar drops** — o motor: distribui N peças em K drops (ou X por drop) de forma
  equilibrada e já monta o cronograma (semanal, quinzenal, etc). Ex.: 65 peças em 6 drops
  → `[11, 11, 11, 11, 11, 10]` em datas espaçadas.
- **Dashboard** — faturamento, lucro, ROI, ticket médio, estoque e quebra por drop/categoria.
- **Sincronizar (scraper)** — roda o worker `brecho-tracker` (Playwright) que raspa o
  Instagram do brechó, com **logs ao vivo** (WebSocket + UI animada) e barra de progresso.
  Ao terminar, importa a planilha pro SQLite (peças com `origem='scraper'`) — o dashboard
  reflete as vendas reais. As peças raspadas são **histórico** e não entram no planejamento
  de drops futuros (só o catálogo manual entra no gerador).

### Fluxo do scraper

1. **Conectar Instagram** (uma vez) — loga na conta pela WebView; a sessão é salva no servidor.
2. **Atualizar agora** — dispara a raspagem; acompanha os logs em tempo real.
3. Ao fim, a planilha é importada automaticamente pro banco.

> O worker tem dependências próprias (Playwright/Chrome) — veja
> `workers/brecho-tracker/requirements.txt` e rode `playwright install chromium` no servidor.

## Rodar

**Backend** (porta 8020):
```bash
cd backend
pip install -r requirements.txt
uvicorn app:app --reload --port 8020
```

**Frontend**:
```bash
cd frontend
npm install
npm start            # Expo — abre no dev client / Expo Go
```

No app, abra **Configurações** e informe a URL do backend + o token (`BRECHO_API_TOKEN`).

### Testar no Expo Go de qualquer rede (jeito Bots — via túnel)

Sem precisar estar no mesmo Wi-Fi. Três terminais:

```bash
# 1) backend local
cd backend && uvicorn app:app --host 0.0.0.0 --port 8020

# 2) expõe o backend na internet (localtunnel) → gera https://xxxx.loca.lt
npx localtunnel --port 8020

# 3) Metro por túnel (Expo Go pega o QR de qualquer rede)
cd frontend && npm run tunnel
```

No app (Expo Go) → **Configurações** → URL = a `https://xxxx.loca.lt`, token = o seu
`BRECHO_API_TOKEN`. O header `Bypass-Tunnel-Reminder` já pula a página de aviso do localtunnel.

> No Expo Go funciona catálogo, drops, fotos e dashboard. **Conectar Instagram** (captura
> de sessão) e **push** só rodam num **dev build** (`npm run build:dev:*`) — mesma limitação
> do Quase Nada Bots.

## Deploy

Mesmo padrão dos outros apps QN: backend na Oracle (`147.15.7.119`), frontend via EAS
build (perfis `development` e `preview` no `eas.json`).
