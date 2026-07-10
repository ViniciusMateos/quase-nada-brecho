# Changelog

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
