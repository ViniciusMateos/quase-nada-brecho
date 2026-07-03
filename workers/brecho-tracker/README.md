# brecho-tracker

Raspador do brechó **@brechoquasenadaa**: lê os posts (1 post = 1 peça), extrai os
dados da peça da legenda, detecta **VENDIDA** (legenda editada) e mantém uma planilha
dinâmica ao longo dos drops — com dashboard de faturamento, lucro, % de retorno e
quebra por ano.

## Como funciona

- Cada post de peça segue o padrão:
  ```
  | ❌VENDIDO❌            (ou ❌VENDIDA❌ — opcional, só quando vendida)
  moletom branco          (nome da peça)
  tam.: p (l 58 cm c 64 cm)
  condição: 9/10
  R$:15                   (preço — some quando vende)
  comente "fila"
  ```
- **Vendida** = a palavra `vendido`/`vendida` em qualquer lugar da legenda — com ou
  sem ❌, ignorando maiúscula/minúscula e espaços.
- Posts de divulgação (sem `condição`/`R$`/`VENDIDO`/`tam`) são ignorados.
- O parser entende as 3 medidas: `(l X cm c Y cm)` → largura/comprimento ·
  `(X cm circunferência)` → boné/bucket · `(X cm)` → medida do tênis.
- **Chave = `code` do post** (1 peça = 1 post). A reconciliação casa por `code`.
- **Retenção de preço:** o R$ é capturado enquanto a peça está disponível; quando ela
  vende (R$ some da legenda), o último preço visto é mantido.
- **Boundary:** drops mais antigos que o drop mais antigo ainda-disponível já estão
  100% vendidos → não são revisitados. No 1º run raspa tudo; depois só o necessário.
- **Backfill da antiga:** as peças já vendidas (sem preço na legenda) puxam custo/preço
  da planilha antiga `quasenadabrecho.xlsx`, casando drop-a-drop (item sem acento/
  sinônimo + tamanho + comprimento + preço).

## Uso

```powershell
# 1ª vez: importar cookies (qualquer conta logada lê o brechó)
python main.py --import-cookies "C:\...\cookies.json"

# prévia: raspa e mostra o que MUDARIA, sem gravar
python main.py --dry-run

# 1º run / atualização (pós-drop ou pra registrar vendas): raspa e grava a planilha
python main.py

# forçar raspagem do feed inteiro (ignora o boundary)
python main.py --full

# sem raspar: só preenche custo/preço faltantes pela planilha antiga e regrava
python main.py --rematch
```

Fluxo do dia a dia: **vendeu peça / postou drop → `python main.py`**, e a planilha
se atualiza sozinha (marca as vendidas, mantém o preço, preserva o custo manual).

## Arquivos

| Arquivo | Função |
|---|---|
| `config.py` | Alvo, sessão, paths, planilha |
| `iglib.py` | Sessão logada (Playwright) + busca de posts/imagens |
| `parser.py` | Legenda → dados estruturados da peça |
| `planilha.py` | Reconciliação, backfill, KPIs, escrita do xlsx (2 abas) |
| `main.py` | Orquestrador (raspagem → boundary → reconciliação → salvar) |
| `inspect_posts.py` | Inspetor (baixa legendas cruas p/ calibrar o parser) |

> As planilhas (`*.xlsx`) e a pasta `output/` (cache de fotos, logs) ficam no
> `.gitignore` — são dados, regeneráveis.

## Planilha gerada

### Aba `Dados Gerais` (dashboard, via fórmulas vivas)
- **Resumo geral:** faturamento, projeção, gastos totais, custo das vendidas, lucro
  líquido, **retorno do investimento (%)** e **margem de lucro (%)**.
- **Estoque:** total de peças, vendidas, disponíveis, **taxa de venda (%)**.
- **Por ano:** peças, vendidas, faturamento, custo, lucro e margem de cada ano.

Tudo via fórmula apontando pra aba `peças` → editou uma célula, os totais recalculam.

### Aba `peças` (tabela detalhada)
Colunas: `code, drop, imagem, item, nome, compra, venda, tamanho, largura,
comprimento, circunferencia, condicao, vendida, url, atualizado_em`
(+ `imagem_url` oculta).

- **Raspado** (atualizado a cada run): nome, tamanho, medidas, condição, venda, vendida, imagem.
- **Manual** (preservado, nunca sobrescrito com vazio): compra.
- **Foto no hover:** passa o mouse na coluna `imagem` e a foto da peça aparece.
- **Datas** DD/MM/AAAA · **`url`** = link "ver post" · brancos viram **N/A**.
- Visual: faixa **laranja** da marca, **zebra**, bordas, colunas auto-ajustadas, Arial 12.
