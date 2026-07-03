# Changelog

## [1.0.0] — 2026-06-29

### Adicionado
- feat: raspador do brechó **@brechoquasenadaa** (1 post = 1 peça) com parser de
  legenda — item, medidas (incl. circunferência de boné e medida de tênis), condição,
  preço e status vendida (qualquer "vendido/vendida" na legenda — com ou sem ❌,
  ignorando caixa e espaços).
- feat: planilha em 2 abas — **peças** (foto no hover, brancos como N/A, link "ver post",
  colunas auto-ajustadas, Arial 12) e **Dados Gerais** (dashboard com KPIs por fórmula:
  faturamento, projeção, gastos, custo das vendidas, lucro, retorno do investimento %,
  margem %, taxa de venda % e quebra por ano).
- feat: **boundary** para runs incrementais — não revisita drops 100% vendidos.
- feat: **retenção de preço** (captura o R$ enquanto disponível, mantém quando vende).
- feat: **backfill** de custo/preço pela planilha antiga casando drop-a-drop (item sem
  acento/sinônimo + tamanho + comprimento + preço) e modo `--rematch` (sem raspar).
- feat: `inspect_posts.py` para baixar legendas cruas e calibrar o parser.
