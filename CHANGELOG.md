# Changelog

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
