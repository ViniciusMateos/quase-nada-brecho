// Pack de traduções: ajuda. Explicações curtas dos termos financeiros (o "i" das métricas
// no Dashboard e no Calendário). Cada termo tem .titulo e .texto. PT + EN.
export const pt: Record<string, string> = {
  'ajuda.fechar': 'Fechar',

  'ajuda.faturamento.titulo': 'Faturamento',
  'ajuda.faturamento.texto':
    'Todo o dinheiro que ENTROU com as vendas — a soma do que você vendeu, antes de descontar o que pagou nas peças. Não confunda com lucro: faturar muito não quer dizer lucrar muito.',

  'ajuda.lucro.titulo': 'Lucro',
  'ajuda.lucro.texto':
    'O que realmente sobra pra você: o faturamento menos o que você pagou pelas peças que venderam. Lucro = faturamento − custo das peças vendidas.',

  'ajuda.margem.titulo': 'Margem',
  'ajuda.margem.texto':
    'Quanto do faturamento vira lucro, em %. Margem = lucro ÷ faturamento × 100. Ex.: margem de 60% quer dizer que a cada R$ 100 vendidos, R$ 60 são lucro.',

  'ajuda.roi.titulo': 'ROI (retorno sobre o investimento)',
  'ajuda.roi.texto':
    'Quanto você lucra em cima do que GASTOU nas peças. ROI = lucro ÷ custo × 100. Ex.: ROI de 200% quer dizer que cada R$ 1 investido virou R$ 2 de lucro. Diferente da margem (que é sobre a venda), o ROI é sobre o custo.',

  'ajuda.taxaVenda.titulo': 'Taxa de venda',
  'ajuda.taxaVenda.texto':
    'A fração do seu estoque que já foi vendida. Taxa = peças vendidas ÷ total de peças × 100. Quanto maior, mais o brechó está girando (e menos dinheiro parado).',

  'ajuda.ticketMedio.titulo': 'Ticket médio',
  'ajuda.ticketMedio.texto':
    'O valor médio de cada venda: faturamento ÷ peças vendidas. Mostra quanto sai, em média, por peça vendida.',

  'ajuda.custoMedio.titulo': 'Custo médio',
  'ajuda.custoMedio.texto':
    'Quanto você pagou, em média, por peça vendida: custo das peças vendidas ÷ peças vendidas.',

  'ajuda.cmv.titulo': 'CMV (custo da mercadoria vendida)',
  'ajuda.cmv.texto':
    'A soma do que você pagou pelas peças que JÁ venderam (não conta o estoque parado). É o custo que sai do faturamento pra sobrar o lucro.',

  'ajuda.projecao.titulo': 'Projeção',
  'ajuda.projecao.texto':
    'Uma estimativa do total SE tudo vender: o que já faturou + o valor do estoque ainda parado, pelos preços de venda. É um teto possível, não o que já aconteceu.',

  'ajuda.lucroPotencial.titulo': 'Lucro potencial',
  'ajuda.lucroPotencial.texto':
    'O lucro que ainda está preso no estoque: se você vender tudo que está disponível pelos preços atuais, é isso que sobraria. Ainda não é lucro de verdade — só quando vender.',

  'ajuda.valorParado.titulo': 'Valor parado',
  'ajuda.valorParado.texto':
    'Quanto de venda está parado no estoque: a soma dos preços das peças ainda disponíveis. Só vira faturamento quando você vender.',

  'ajuda.investido.titulo': 'Investido',
  'ajuda.investido.texto':
    'O total que você já pagou nas peças (as vendidas + as em estoque). É o dinheiro que você colocou no brechó.',

  'ajuda.gasto.titulo': 'Gasto',
  'ajuda.gasto.texto':
    'O total que você pagou pelas peças que venderam no período — o custo por trás do faturamento. Faturamento − gasto = lucro.',
};

export const en: Record<string, string> = {
  'ajuda.fechar': 'Close',

  'ajuda.faturamento.titulo': 'Revenue',
  'ajuda.faturamento.texto':
    'All the money that CAME IN from sales — the total of what you sold, before subtracting what you paid for the items. Not the same as profit: high revenue doesn’t mean high profit.',

  'ajuda.lucro.titulo': 'Profit',
  'ajuda.lucro.texto':
    'What actually stays with you: revenue minus what you paid for the items that sold. Profit = revenue − cost of items sold.',

  'ajuda.margem.titulo': 'Margin',
  'ajuda.margem.texto':
    'How much of the revenue turns into profit, as a %. Margin = profit ÷ revenue × 100. E.g. a 60% margin means that for every $100 sold, $60 is profit.',

  'ajuda.roi.titulo': 'ROI (return on investment)',
  'ajuda.roi.texto':
    'How much you profit on top of what you SPENT on the items. ROI = profit ÷ cost × 100. E.g. a 200% ROI means every $1 invested became $2 of profit. Unlike margin (based on the sale), ROI is based on the cost.',

  'ajuda.taxaVenda.titulo': 'Sell-through rate',
  'ajuda.taxaVenda.texto':
    'The share of your stock that has already sold. Rate = items sold ÷ total items × 100. The higher it is, the faster the thrift is turning over (less money sitting still).',

  'ajuda.ticketMedio.titulo': 'Average ticket',
  'ajuda.ticketMedio.texto':
    'The average value per sale: revenue ÷ items sold. Shows how much comes in, on average, per item sold.',

  'ajuda.custoMedio.titulo': 'Average cost',
  'ajuda.custoMedio.texto':
    'How much you paid, on average, per item sold: cost of items sold ÷ items sold.',

  'ajuda.cmv.titulo': 'COGS (cost of goods sold)',
  'ajuda.cmv.texto':
    'The total you paid for the items that HAVE already sold (it doesn’t count stock still sitting). It’s the cost subtracted from revenue to leave the profit.',

  'ajuda.projecao.titulo': 'Projection',
  'ajuda.projecao.texto':
    'An estimate of the total IF everything sells: what you’ve already made + the value of stock still sitting, at sale prices. It’s a possible ceiling, not what already happened.',

  'ajuda.lucroPotencial.titulo': 'Potential profit',
  'ajuda.lucroPotencial.texto':
    'The profit still locked in your stock: if you sold everything available at current prices, that’s what would be left. Not real profit yet — only once it sells.',

  'ajuda.valorParado.titulo': 'Idle value',
  'ajuda.valorParado.texto':
    'How much in sales is sitting in stock: the sum of the prices of items still available. It only becomes revenue once you sell.',

  'ajuda.investido.titulo': 'Invested',
  'ajuda.investido.texto':
    'The total you’ve already paid for items (both sold and in stock). It’s the money you put into the thrift.',

  'ajuda.gasto.titulo': 'Spend',
  'ajuda.gasto.texto':
    'The total you paid for the items that sold in the period — the cost behind the revenue. Revenue − spend = profit.',
};
