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
│   ├── drops.py      CRUD dos drops + histórico unificado por data
│   ├── scraper.py    ponte com a raspagem no emulador (via backend dos Bots) + reconciliação
│   ├── run_manager.py  runs com log ao vivo — espelha no app a run do emulador
│   ├── notify.py     push (Expo) quando a raspagem termina
│   └── settings.py   config (token, paths, worker)
├── frontend/         Expo / React Native (mesmo esqueleto dos outros apps QN)
│   └── src/
│       ├── screens/  Hub, Peças, Drops, DropDetail, Histórico, Dashboard, Calendário,
│       │             Sincronizar, Run (logs ao vivo), Conta do Instagram, InstagramLogin, Settings
│       ├── lib/      api + cliente axios + push
│       ├── i18n/     traduções PT/EN (packs por domínio) + transição scramble
│       ├── ui/       componentes (loader do cachorro, botões, cards, progresso)
│       ├── theme.ts + theme-context  paletas dark/light + troca animada (fade)
│       └── constants/otaVersion  contador OTA (sobe a cada eas update)
└── workers/
    └── brecho-tracker/   scraper Playwright antigo (legado — a raspagem hoje é pelo emulador)
```

## Funcionalidades

- **Peças** — cataloga cada peça com foto, nome, categoria (auto pela 1ª palavra do nome),
  tamanho, **medidas** (largura/comprimento + especiais com **nome livre** — circunferência,
  palmilha, manga… entram no template), condição (`x/10`), observação e compra/venda; marca
  vendida; filtra por disponível/vendida/sem-drop **e por categoria**, com ordenação
  recente↔antiga, mais um **filtro avançado** (bottom sheet) com filtros **combináveis** —
  estado do drop (sem drop / em algum drop / publicado / agendado / rascunho), consignado e
  origem (criada no app / raspada do Insta) — com badge de filtros ativos e "limpar filtros".
  A **busca é tolerante**: ignora acento, aceita as palavras em qualquer
  ordem e aguenta typo leve (casa por nome e categoria, em PT e traduzida). Mostra o **drop**
  da peça e permite **entrar nele** (pelo editor ou segurando a peça). Dá pra **selecionar
  várias** (segurar → "Selecionar", ou o botão no topo) e **apagar em lote**. O editor é um
  componente único, compartilhado com a tela de Drops, organizado em seções.
- **Consignado** — marca a peça como de terceiro + quanto fica pra você, escolhendo entre
  **% da venda** ou **valor fixo (R$)**; os relatórios (faturamento, lucro, dashboard, saldo
  do drop) contam **só a sua parte**, não o valor cheio (e mostram a % equivalente no fixo).
- **Manual (trava)** — protege os dados da peça (nome, preço, medidas, legenda, foto): a
  raspagem **não muda nada nem marca venda**. Ela só guarda o **link do post** e, se a legenda
  disser "vendido", **avisa pra conferir** (`CONFERIR` no log e no histórico da peça) — feito
  pra conjunto de 2 peças, que pode vender só uma.
- **Histórico da peça** — no editor, a linha do tempo do que aconteceu com a peça: criada, nova
  do Insta, preço mudou, vendida, dividida, conferir venda — pela raspagem ou por você.
- **Dividir conjunto** — vendeu só uma parte? A parte vendida vira uma peça nova já vendida
  (mesmo drop, data e foto) e o conjunto fica com o preço/custo que sobrou, à venda e com o
  link do post. Dashboard, calendário e drops contam certo sem ajuste nenhum.
- **Template do post** — dentro de cada peça, a legenda pronta (nome, medidas, condição,
  preço, observação, hashtags) com botão de **copiar** e link **abrir no Instagram**. Com o
  toggle **Manual** ligado, o template vira **editável** e o texto customizado é salvo.
- **Drops** — agrupa peças em drops datados (rascunho → agendado → publicado). Cada card mostra
  peças vendidas, faturamento, gasto, lucro e a **projeção** de faturamento **e de lucro líquido**
  (se tudo vender) — as projeções somem quando o drop esgota.
- **Código #p** — cada peça tem um número sequencial (`#p123`) que entra nas hashtags do
  template e é lido de volta da legenda no Insta. É a chave mais confiável pra casar o que o
  scraper vê com o que está no app (casa por `#p` → `code` → nome).
- **Dashboard** — faturamento, lucro, ROI, ticket médio, estoque e quebra por drop/categoria
  (peças consignadas entram só pela % que fica pra você); as linhas de categoria são atalho
  pra tela de peças já filtrada. **Filtro por período** (pills Tudo/30 dias/Este ano/Ano
  passado + um **calendário de faixa** personalizado): as métricas de venda passam a considerar
  só o que vendeu na janela (pela data da venda); o estoque segue como snapshot atual. As
  métricas menos óbvias (margem, ROI, taxa de venda, CMV, ticket médio…) têm um **"i"** do
  lado que abre uma explicação rápida do termo (o que é, a fórmula, um exemplo) — no Dashboard
  e no Calendário.
- **Calendário de vendas** — calendário navegável por mês que mostra as **vendas por dia** e,
  no topo, **faturamento, lucro, margem e ROI** do mês. Troca de mês pelas setas **ou
  arrastando pro lado** (segue o dedo + transição slide/fade). Cada peça vendida guarda a
  **data da venda** (editável; quando é estimada — backfill/scraper — pede confirmação); tocar
  numa venda abre a peça pra editar.
- **Histórico** — cada raspagem vira um registro com o que mudou (atualizadas, relacionadas,
  vendidas) e um log por peça (NOVA/RELACIONADA/ATUALIZADA/VENDIDA), filtrável por período.
- **Raspar Instagram (scraper)** — a raspagem roda num **emulador Android** com uma **conta
  auxiliar** lendo o perfil do brechó no app do Instagram (a **conta da loja nunca é usada**):
  o app pede, o backend enfileira um job no backend dos Bots, o agente do PC escolhe uma conta
  apta (com fallback se uma falhar) e o device devolve os posts pra cá. São duas partes:
  **peças novas** (lê o feed do topo até o 1º post que o app já conhece) e **conferência das
  peças à venda** (abre cada uma direto pelo link do post e vê se virou "vendido" ou mudou o
  preço — o Insta ganha nas disponíveis). Peça postada que ficou **sem link** é caçada no feed
  até o drop dela. A reconciliação casa por `#p` → `code` → nome e chega **em lotes de 10** (o
  app vai se atualizando durante a run). O **print da foto sai limpo** (sem a bolha de repost e
  o contador "1/3" do Insta) e fica salvo no servidor — não depende do link de imagem do IG,
  que expira. **Logs ao vivo** em seções, com o **status colorido** no começo de cada peça
  (NOVO, VENDIDA, ATUALIZADA com preço antigo → novo, DISPONÍVEL…) e um **resumo** no fim;
  barra de progresso, **Live Activity** e **parar imediato**. No topo da tela, o **painel de
  prontidão** mostra se o emulador está online, o status das contas auxiliares (apta /
  descansando até HH:MM / bloqueada) e a próxima da vez. Há ainda a **recaptura de fotos**
  (modo `fotos`), que passa por todas as peças com link e regrava só a foto. Se as peças de um
  **drop manual** aparecem no Insta, o drop vira **publicado** e a data sincroniza com o post.
- **Configurações** (engrenagem no Hub) — **tema claro/escuro** (troca com um fade de
  "cortina" no app inteiro) e **idioma PT/EN** (troca com a animação de embaralhar as
  letras). As categorias traduzem por dicionário (pela 1ª palavra do nome) e o filtro
  reordena alfabético pelo idioma ativo. As **notificações** também saem no idioma
  escolhido (o app manda o idioma, o backend responde em PT/EN). Ao abrir, os Ajustes
  **checam se há OTA mais nova** e, se tiver, mostram um aviso **"Atualização disponível"**
  com botão pra baixar e reabrir já atualizado. No rodapé, o **contador OTA** confirma qual
  bundle está rodando de fato (e o estado: verificando / atualizado / desatualizado).

### Fluxo do scraper

1. **Atualizar** (tela *Raspar Instagram*) — dispara a raspagem no emulador; antes, o painel de
   prontidão mostra se o emulador está online e se tem conta auxiliar apta.
2. Acompanhe a run ao vivo: Preparação → Peças novas → Conferindo as peças à venda → O que
   mudou → Resumo.
3. **Recaptura de fotos** — `POST /scraper/emulador/fotos/raspar` (sem botão no app; ~2h pra
   ~400 peças, ocupa o emulador principal nesse tempo).

> A parte do device depende da stack `quase-nada-bots-device` (agente + MuMu) e do backend dos
> Bots — configure `BOTS_BACKEND_URL` e `BOTS_BACKEND_TOKEN` no `.env` do backend.

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

O app de produção já abre **conectado** (URL e token embutidos no build) — só precisa mexer
em **Configurações** se apontar pra outro backend. No dev local, informe ali a URL + o token
(`BRECHO_API_TOKEN`).

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

- **Backend** na Oracle (`147.15.7.119`) com HTTPS fixo (`https://quasenadaserver1.duckdns.org/brecho`),
  nginx + systemd. O token da API vai como **variável de ambiente do EAS** (nunca no repo).
- **Frontend** via EAS build (perfis `development` e `preview` no `eas.json`), já com a URL
  e o token embutidos.
- **Updates (OTA)** com `expo-updates`: mudança de **JS** vai pro app pela internet com
  `eas update --branch preview` — sem build nem loja. Só o **nativo** (splash, ícone, Live
  Activity, lib nova) ainda exige build. `runtimeVersion` fica **fixo** (`1.0.0`) pra os
  updates continuarem compatíveis com os builds instalados; só sobe quando o nativo quebrar.
- **Scraper** roda no **emulador (MuMu) do PC**, pela stack dos Bots — o servidor do brechó só
  enfileira o job, recebe os posts e as fotos (`/scraper/emulador/*`) e espelha a run no app.
  As fotos ficam em `backend/data/uploads/scraper-<code>.jpg`, servidas em `/uploads` com
  `?v=<data do arquivo>` pra o app não mostrar a versão velha do cache. O worker Playwright
  em `workers/brecho-tracker` (headed sob Xvfb + proxy residencial, ver
  [`docs/PROXY_RESIDENCIAL.md`](docs/PROXY_RESIDENCIAL.md)) ficou como legado.
