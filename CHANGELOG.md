# Changelog

## [1.5.2] — 2026-08-18

### Corrigido
- fix: **scraper só coleta post da própria conta** do brechó — o IG serve posts de outras contas junto no scroll (sugestão/tag/reels relacionados) e eles viravam peça (ex.: um "Bazar" de outra loja); agora o coletor filtra pelo `user.username` da conta

### Notas
- Mudança só no worker (deploy por `scp`); sem OTA e sem mudança nativa. `runtimeVersion` segue `1.0.0`.

## [1.5.1] — 2026-08-16

### Adicionado
- feat: **seleção múltipla** na tela de Peças — segurar uma peça mostra "Selecionar" (ou o botão no topo), entra no modo de seleção (check + borda), e apaga **várias de uma vez** com confirmação

### Corrigido
- fix: **duplo-toque no botão de importar** (carrossel) não duplica mais a importação — trava síncrona por ref, além do botão já desabilitar no loading

### Notas
- Sem mudança nativa: entregue por OTA #29 (`runtimeVersion` segue `1.0.0`).

## [1.5.0] — 2026-08-13

### Adicionado
- feat: **Live Activity com anel de progresso** (roda que preenche + % no miolo) na cor do brechó — lock screen, ilha compacta, minimal e expandida; **precisa de build nativo** (não vai por OTA)

### Modificado
- update: no **calendário de vendas**, ao escolher um dia a tela desce suave até o começo da lista de peças (meses maiores não escondem mais as vendas embaixo da dobra)

### Corrigido
- fix: worker marca **"sem sessão" como erro** em vez de "finalizado" — sessão do Instagram expirada não vira mais sucesso mentiroso; o app pede pra reconectar
- fix: anel do LA não corta na ilha compacta, fecha limpo no 100% e a logo não serrilha (interpolation)

### Documentação
- docs: guia do Live Activity com anel pra replicar no app Bots (`docs/LIVE_ACTIVITY_ANEL.md`)

### Notas
- **Este release tem mudança nativa** (o Live Activity): exige **build** (feito no perfil `preview`); `runtimeVersion` segue `1.0.0`, então os OTAs continuam compatíveis. O resto (calendário, worker) foi por OTA #28 + `scp`.

## [1.4.0] — 2026-08-05

### Adicionado
- feat: **projeção de lucro líquido** nos cards de drop (além da projeção de faturamento, se tudo vender); as projeções somem quando o drop esgota

### Corrigido
- fix: **scraper não estabiliza cedo** — a completude passa a ser guiada pelo total de posts do perfil; se o carregamento infinito do IG não engatar (empaca nos primeiros), ele re-arma o carregador e insiste, e no limite aborta com erro (raspagem incompleta) em vez de reconciliar meia raspagem achando que é o feed inteiro

### Notas
- Sem mudança nativa: `runtimeVersion` segue em `1.0.0`; entregue por OTA (frontend, OTA #26) + `scp` (backend + worker)

## [1.3.0] — 2026-07-31

### Adicionado
- feat: **dashboard filtrável por período** — pills (Tudo, 30 dias, Este ano, Ano passado) + um **calendário de faixa** personalizado; as métricas de venda (faturamento, lucro, margem, ROI, ticket, por drop/categoria) passam a considerar só o que vendeu na janela (pela data da venda), com fade rápido na troca; o estoque segue como snapshot atual

### Modificado
- update: no calendário de vendas, ao desmarcar o dia o scroll volta pro topo animado em vez do salto seco

### Corrigido
- fix: filtro **"sem drop"** das peças agora conta também o drop histórico (pela data do post) — peça raspada não vaza mais como "sem drop"

### Notas
- Sem mudança nativa: `runtimeVersion` segue em `1.0.0`; entregue por OTA (frontend, OTA #25) + `scp` (backend)

## [1.2.0] — 2026-07-29

### Adicionado
- feat: **calendário de vendas** — captura a data da venda (editável, com data estimada que pede confirmação), tela navegável por mês com vendas por dia, custo/lucro por peça e métricas do mês (faturamento, lucro, margem e ROI)
- feat: **conta do Instagram com auto-login** salva no aparelho (login+senha no SecureStore, nunca no servidor) — reconecta num toque preenchendo e logando sozinho, resolvendo o vai-e-volta do checkpoint/confirmar email
- feat: **busca tolerante** nas peças — ignora acento, aceita palavras em qualquer ordem e tolera typo leve (subsequência); casa por nome e categoria (PT e traduzida)
- feat: **teclado desce** ao arrastar/tocar fora do input (lista de peças, editor, conta do Instagram e carrossel de nomear)

### Modificado
- update: **editor de peça repaginado** em seções (a peça, preço, medidas e detalhes, organização, venda, legenda do post)

### Corrigido
- fix: **calendário do editor** não trava mais entre trocas de mês e o clique rápido não some o nome do mês (mês+ano num estado só, com o vira-ano dentro do updater)
- fix: **data do editor** (meses, dias da semana e placeholder) traduzindo conforme o idioma selecionado
- fix: **worker** lê o total de posts pela página do perfil — removido o `web_profile_info` que às vezes dava 400 por bug do IG

### Notas
- Sem mudança nativa: `runtimeVersion` segue em `1.0.0`; entregue por OTA (frontend, OTA #18) + `scp` (worker)

## [1.1.0] — 2026-07-28

### Adicionado
- feat: **tema claro/escuro** no app inteiro, com troca animada (fade de "cortina" no driver nativo) e persistência
- feat: **idioma PT/EN** com transição de embaralhar letras (scramble); categorias traduzidas por dicionário (pela 1ª palavra do nome) e filtro reordenado alfabético pelo idioma ativo
- feat: **tela de Configurações** (engrenagem no Hub) com cards de tema e idioma
- feat: **notificações em PT/EN** conforme o idioma selecionado no app (o app manda o idioma, o backend responde localizado)
- feat: **contador OTA** no rodapé do Settings (sobe a cada `eas update` — prova de qual bundle está rodando de fato)

### Corrigido
- fix: scraper não reporta mais 0 posts como "finalizado" (raspagem incompleta mascarada de sucesso) — agora vira erro; o interceptador do feed colhe de mais endpoints além do graphql

### Removido
- chore: card de servidor (URL/token) do Settings — são fixos/embutidos no build

### Notas
- Sem mudança nativa: `runtimeVersion` segue em `1.0.0`; tudo entregue por OTA (frontend) + `scp` (backend/worker)

## [1.0.5] — 2026-07-26

### Corrigido
- fix: ajustes na tela de drops
  - no seletor de drop da peça, drops já **publicados** não aparecem (mantém o que a peça já está)
  - "adicionar peças" ao drop lista só peças manuais **disponíveis** (vendida não entra em drop novo)
  - salvar drop volta pra lista de drops

### Manutenção
- chore: alinha `package.json` e `backend/app.py` na versão (tinham ficado em 1.0.3 no bump parcial do 1.0.4)

## [1.0.4] — 2026-07-26

### Corrigido
- fix: **parar** um bot pelo app agora é **Ctrl+C** (SIGINT) — mostra o saldo e sai limpo, sem virar erro

### Manutenção
- chore: script do 2º túnel SSH (`:1081`) pro dm-followers (proxy residencial dedicado)

## [1.0.3] — 2026-07-22

### Corrigido
- fix: scraper resiliente aos perrengues do Instagram — 4 camadas no início da raspagem pra o worker não morrer com a instabilidade/bugs do IG:
  - tolera o `web_profile_info` dando 400 (bug de categoria de negócio do IG) e segue pela raspagem por scroll
  - lê o total de posts do topo do perfil (og:description/header) quando a API falha — recupera a % da barra
  - navegação com retry (fallback pra `wait_until="commit"` quando o IG aborta o carregamento com `ERR_ABORTED`)
  - espera o grid do feed renderizar antes de scrollar, evitando parar nos ~12 primeiros posts numa página crua

### Notas
- Mudança só no worker (deploy por `scp` no servidor); o app/OTA não muda, `runtimeVersion` segue em `1.0.0`

## [1.0.2] — 2026-07-10

### Adicionado
- feat: Live Activity usa o bundle do build — o app manda o próprio bundle (`.dev` / `.preview`) junto com o push token e o server usa como tópico do APNs, então os dois builds convivem sem brigar pelo `APNS_BUNDLE_ID`

### Notas
- `APNS_BUNDLE_ID` do `.env` vira apenas **fallback** (app antigo que não manda bundle); só bundles com prefixo `app.quasenada.brecho` são aceitos
- Sem mudança nativa: `runtimeVersion` segue em `1.0.0` e a correção foi entregue por **OTA** + deploy do backend

## [1.0.1] — 2026-07-10

### Adicionado
- feat: OTA via expo-updates — mudanças de JS chegam ao app pela internet, sem build nem loja (só o nativo ainda exige build)

### Corrigido
- fix: splash preenche a tela com o fundo laranja da marca (logo no tamanho certo)
- fix: widget do scraper desmonta ao parar a run (não fica mais preso na última %)
- fix: Hub mostra o total de drops (manuais + publicados), não só os manuais

### Notas
- `runtimeVersion` fixado em `1.0.0` (desacoplado da versão de vitrine) pra manter o OTA compatível com os builds já instalados
- Live Activity: `APNS_BUNDLE_ID` do servidor apontando pro bundle `.preview`

## [1.0.0] — 2026-07-10

Primeira versão cheia do Quase Nada Brechó — o lançamento.

### Adicionado
- feat: sincronização unificada com o app como fonte única da verdade — o worker virou raspador puro e o backend passou a reconciliar (casa por `#p` → `code` → nome); a planilha virou espelho gerado do app
- feat: log rico por peça na run (NOVA/RELACIONADA/ATUALIZADA/VENDIDA com diffs e TRAVADA pras travadas)
- feat: código `#p` sequencial por peça, com backfill do acervo e leitura de volta da legenda
- feat: template da peça com o código `#p` nas hashtags e VENDIDA em destaque
- feat: prévia real do dry-run (roda idêntico ao normal, só dá rollback em vez de gravar)
- feat: raspagem completa (`--full`) que re-lê o feed e recaptura as fotos quando os links do Insta expiram
- feat: trava de raspagem dupla (409 no backend + botões desabilitados no app)
- feat: reconexão automática dos logs ao vivo ao voltar do segundo plano
- feat: Live Activity nativa e widget flutuante interativo de progresso
- feat: categorias do dashboard viram atalho pra tela de peças já filtrada

### Modificado
- update: histórico polido — 3 métricas (atualizadas, relacionadas, vendidas), chips e filtros animados
- update: tela de peças com filtro animado e pílulas com press; dog do pull-to-refresh reposicionado

### Removido
- chore: gerador automático de drops (endpoint, backend, tela, rota e client)

### Documentação
- docs: README atualizado pra refletir a sincronização unificada e sem o gerador
