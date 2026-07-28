// Tradução das CATEGORIAS do brechó. A categoria é a 1ª palavra do nome da peça
// (ex.: "camiseta oversized" → "camiseta"). Só traduz quando o idioma é EN; se a
// palavra não estiver no mapa, mantém o original (categoria fica como o usuário escreveu).
const MAP: Record<string, string> = {
  camiseta: 't-shirt', camisa: 'shirt', 'camisa-polo': 'polo', polo: 'polo',
  calca: 'pants', 'calça': 'pants', calcas: 'pants', 'calças': 'pants', jeans: 'jeans',
  moletom: 'hoodie', blusa: 'blouse', casaco: 'coat', jaqueta: 'jacket',
  tenis: 'sneakers', 'tênis': 'sneakers', bota: 'boots', botas: 'boots',
  chinelo: 'flip-flops', sandalia: 'sandals', 'sandália': 'sandals',
  bone: 'cap', 'boné': 'cap', gorro: 'beanie', touca: 'beanie',
  bermuda: 'shorts', short: 'shorts', shorts: 'shorts',
  vestido: 'dress', saia: 'skirt', sueter: 'sweater', 'suéter': 'sweater',
  colete: 'vest', regata: 'tank top', cropped: 'cropped', top: 'top',
  bolsa: 'bag', mochila: 'backpack', pochete: 'fanny pack',
  oculos: 'glasses', 'óculos': 'glasses', cinto: 'belt', meia: 'socks', meias: 'socks',
  luva: 'gloves', luvas: 'gloves', cachecol: 'scarf',
  tracksuit: 'tracksuit', agasalho: 'tracksuit', 'corta-vento': 'windbreaker',
  conjunto: 'set', 'macacão': 'jumpsuit', macacao: 'jumpsuit', body: 'bodysuit',
  biquini: 'bikini', 'biquíni': 'bikini', maio: 'swimsuit', 'maiô': 'swimsuit',
  sunga: 'swim trunks', pijama: 'pajamas', cueca: 'underwear', sutia: 'bra', 'sutiã': 'bra',
};

/** Traduz a categoria (1ª palavra do nome) — só em EN e só se conhecida. */
export function traduzCategoria(cat: string | null | undefined, lang: string): string {
  const c = (cat || '').trim();
  if (lang !== 'en' || !c) return c;
  return MAP[c.toLowerCase()] ?? c;
}

/** A categoria é a 1ª palavra do nome. */
export function categoriaDaPeca(nome: string | null | undefined): string {
  return (nome || '').trim().split(/\s+/)[0] || '';
}
