# Backlog — Quase Nada Brechó

Lista de coisas a fazer no app. Ordem não é prioridade fixa; a gente combina o que puxar.

## Feito em 2026-07-03
- Bug do loader infinito/vermelho nos drops (era `null === null` no estado `apagando`).
- Ordenação das peças: padrão recente→antiga, **igual pra todos os filtros** + toggle Recentes/Antigas.
- Campo **medida especial** (boné/circunferência, tênis/palmilha) com toggle que revela o campo — coluna `medida` no banco, backend no ar.
- Botão **Abrir no Instagram** dentro da peça (quando tem `code`).
- **Template do post** copiável dentro da peça (botão Copiar via share sheet + texto selecionável).
- Falta: threading da medida vinda do **scraper** (o parser.py já extrai circunferência/comprimento; falta passar pela planilha→import).

## Peças — ordenação e filtros
- [ ] **BUG:** filtrando por "vendido", a lista volta pra ordem antiga→nova. Padronizar
      **todos** os filtros pra **nova→antiga** (igual ao resto do app).
- [ ] **Toggle de ordem** visível na aba de Peças pra inverter (nova↔antiga) quando quiser.

## Peças — campos por tipo (medidas de itens não-convencionais)
- [ ] Roupas convencionais usam `tamanho` (P/M/G). Mas tem itens com **medida específica**:
      - Boné → **circunferência**
      - Sapato / tênis → **comprimento / palmilha**
- [ ] UX: um **checkbox / seletor de tipo** — se for boné/sapato (ou marcar "medida especial"),
      **aparece o campo** certo pra preencher (circunferência, palmilha, comprimento).
- [ ] **Estudar os posts** (o `workers/brecho-tracker/parser.py` + uma amostra de legendas reais)
      pra ver como o brechó escreve essas peças não-convencionais e casar o padrão.
- [ ] Banco: adicionar coluna nova (migração leve já existe em `backend/db.py` `_MIGRACOES`).
      Sugestão: coluna `medidas` (TEXT/JSON) ou par `tipo_medida` + `valor`.

## Peças — link do Insta + botão "Abrir no Instagram"
- [ ] O dado **já existe**: peças do scraper têm `code` → link = `https://www.instagram.com/p/{code}/`.
- [ ] Botão **"Abrir no Instagram"** dentro da peça (só quando tem `code`).
- [ ] Peça manual não tem `code` → sem botão, ou permitir **colar o link** na edição.

## Peças — template de post copiável
- [ ] Dentro de cada peça, um campo com o **template preenchido** com as infos daquela peça
      (nome, item, tamanho/medida, condição, preço) — **no mesmo modelo dos posts atuais** do brechó.
- [ ] Botão **"Copiar"** → cola direto no post na hora de postar (manual, por enquanto).
- [ ] O template é **gerado** a partir dos dados da peça (não armazenado). Precisa definir o
      modelo exato — estudar um post real do brechó pra clonar o formato.

## Futuro — postagem automática (API do Instagram)
- [ ] Ideia: postar **sozinho** quando o drop for agendado, via API do IG.
- [ ] Viável com a **Instagram Graph API (Content Publishing)** — MAS exige: conta
      **Business/Creator** ligada a uma **Página do Facebook**, app na Meta com permissão
      `instagram_content_publish` (passa por review), e imagem hospedada em **URL pública**.
      Tem cota (~25 posts/24h). Setup não é trivial.
- [ ] **Por ora: manual** (copiar o template acima e postar na mão).

## Backlog anterior (já pendente)
- [ ] Thumbnails das peças raspadas aparecendo no app (servir as imagens do server).
- [ ] Build **preview** standalone (rodar sem depender do Metro/PC ligado).
- [ ] **Live Activity** — notificação persistente com progresso da raspagem na ilha dinâmica.
- [ ] Email a cada alteração da planilha.
- [ ] Unificar o editor de peças (tela de Peças usar o `EditorPeca` compartilhado).
- [ ] Migrar a URL do app de **Tarefas** pro domínio novo (`quasenadaserver1.duckdns.org/tarefas`).
- [ ] Apontar os bots do **quase-nada-bots** (DM/autolikes) pro túnel SOCKS residencial.
