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
│   ├── scraper.py    ponte com o worker + import da planilha → SQLite
│   ├── run_manager.py  roda o scraper como subprocesso e faz stream do log
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
    └── brecho-tracker/   scraper Playwright do @brechoquasenadaa (movido do Bots)
```

## Funcionalidades

- **Peças** — cataloga cada peça com foto, nome, categoria (auto pela 1ª palavra do nome),
  tamanho, **medidas** (largura/comprimento + especiais com **nome livre** — circunferência,
  palmilha, manga… entram no template), condição (`x/10`), observação e compra/venda; marca
  vendida; filtra por disponível/vendida/sem-drop **e por categoria**, com ordenação
  recente↔antiga. A **busca é tolerante**: ignora acento, aceita as palavras em qualquer
  ordem e aguenta typo leve (casa por nome e categoria, em PT e traduzida). Mostra o **drop**
  da peça e permite **entrar nele** (pelo editor ou segurando a peça). Dá pra **selecionar
  várias** (segurar → "Selecionar", ou o botão no topo) e **apagar em lote**. O editor é um
  componente único, compartilhado com a tela de Drops, organizado em seções.
- **Consignado** — marca a peça como de terceiro + quanto fica pra você, escolhendo entre
  **% da venda** ou **valor fixo (R$)**; os relatórios (faturamento, lucro, dashboard, saldo
  do drop) contam **só a sua parte**, não o valor cheio (e mostram a % equivalente no fixo).
- **Manual (trava)** — marca peças 100% manuais pra o scraper **nunca** atualizar nem promover.
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
  no topo, **faturamento, lucro, margem e ROI** do mês. Cada peça vendida guarda a **data da
  venda** (editável; quando é estimada — backfill/scraper — pede confirmação); tocar numa
  venda abre a peça pra editar.
- **Histórico** — cada raspagem vira um registro com o que mudou (atualizadas, relacionadas,
  vendidas) e um log por peça (NOVA/RELACIONADA/ATUALIZADA/VENDIDA), filtrável por período.
- **Sincronizar (scraper)** — roda o worker `brecho-tracker` (Playwright) que raspa o
  Instagram do brechó **descendo o perfil como humano** e interceptando as respostas
  (graphql) que a própria página dispara — colhendo **só os posts da própria conta** (o IG
  serve post de outras contas junto: sugestão/tag/reels) — sem chamar a API em rajada, então **não toma
  rate-limit** e pega o feed inteiro numa run. A **completude** é conferida pelo total de posts
  do perfil: se o carregamento infinito não engatar (empaca nos primeiros), ele **re-arma** e,
  no limite, **aborta com erro** (raspagem incompleta) em vez de reconciliar meia raspagem. Se
  a sessão do Instagram estiver inválida (login/checkpoint/conta indisponível), a run não vira
  **erro** e sim **sem sessão** (a run identifica a causa real e pede pra reconectar, sem tom de
  "deu ruim"). O worker é um **raspador puro**: só despeja
  os posts parseados; **quem reconcilia é o backend**. O **app é a fonte única da verdade**
  e a planilha virou só um **espelho** gerado dele. A reconciliação casa cada post por
  `#p` → `code` → nome, atualiza preço/medidas/venda (Insta ganha nas peças disponíveis) e
  gera um **log rico por peça**. Tem três modos: **Atualizar** (grava), **Prévia** (roda
  igualzinho mas dá rollback, não grava nada) e **Completa** (re-lê o feed inteiro e
  recaptura as fotos, pra quando um link do Insta expira). Não deixa **duas raspagens ao
  mesmo tempo**, tem **logs ao vivo** (WebSocket + UI animada), barra de progresso e
  **Live Activity** (anel de progresso na tela de bloqueio / ilha dinâmica). Peças
  **manuais/travadas** o scraper nunca mexe. No topo, um **cartão de status da conta**
  mostra qual **@conta** está conectada e se a **sessão está viva** (verde "pode rodar" /
  vermelho "reconecte") — a checagem ao vivo bate no IG por uma **requisição HTTP** (~2s,
  sem abrir navegador), pra você saber de cara se dá pra raspar ou se precisa reconectar.
  Se as peças de um **drop manual** aparecem no Insta, o app entende que o drop foi
  publicado: mantém as peças no drop, marca-o como **publicado** e **sincroniza a data**
  com o post.
- **Configurações** (engrenagem no Hub) — **tema claro/escuro** (troca com um fade de
  "cortina" no app inteiro) e **idioma PT/EN** (troca com a animação de embaralhar as
  letras). As categorias traduzem por dicionário (pela 1ª palavra do nome) e o filtro
  reordena alfabético pelo idioma ativo. As **notificações** também saem no idioma
  escolhido (o app manda o idioma, o backend responde em PT/EN). Ao abrir, os Ajustes
  **checam se há OTA mais nova** e, se tiver, mostram um aviso **"Atualização disponível"**
  com botão pra baixar e reabrir já atualizado. No rodapé, o **contador OTA** confirma qual
  bundle está rodando de fato (e o estado: verificando / atualizado / desatualizado).

### Fluxo do scraper

1. **Conectar Instagram** — em *Conta do Instagram* dá pra salvar login+senha **no aparelho**
   (SecureStore, nunca no servidor), com **usuário editável** e **olho** pra ver/ocultar a senha.
   Ao reconectar, o app preenche e loga sozinho na WebView, mas **só captura a sessão quando você
   toca em "Conectar"** — assim dá pra resolver captcha/checkpoint/confirmar email **antes** e
   nunca capturar uma sessão inválida.
2. **Atualizar agora** — dispara a raspagem; acompanha os logs em tempo real.
3. Ao fim, o backend reconcilia o que foi raspado com o acervo do app e re-espelha a planilha.

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
- **Scraper** roda headless no servidor. Ele **rola o perfil e intercepta as respostas**
  (em vez de chamar a API em rajada), o que evita o rate-limit do Instagram. Ainda sai por
  um **proxy residencial** (túnel SSH reverso pela internet de casa) pra usar um IP de
  verdade — veja [`docs/PROXY_RESIDENCIAL.md`](docs/PROXY_RESIDENCIAL.md).
