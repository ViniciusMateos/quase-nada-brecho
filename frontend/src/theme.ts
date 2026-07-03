// Identidade Quase Nada Brechó — laranja original da marca (#FF8234).
// É a cor de origem do brechó dentro do Insta e o motivo da marca Quase Nada existir.
const laranja = '#FF8234';
const laranjaFogo = '#FF6A00';
const laranjaClaro = '#FFA94D';
const laranjaEscuro = '#C1440E';
const amarelo = '#FFB703';

export const colors = {
  laranja,
  laranjaFogo,
  laranjaClaro,
  laranjaEscuro,
  amarelo,
  marca: laranja,                       // accent sólido da marca
  rosa: '#FB6F92',                       // pop quente (complementa o laranja)
  roxo: '#7B2CBF',                       // accent de contraste
  gradiente: [laranjaFogo, laranja, laranjaClaro] as const,
  bg: '#0F0F0F',
  card: '#1A1A1A',
  card2: '#242424',
  border: '#2C2C2C',
  texto: '#F2F2F2',
  textoFraco: '#9A9A9A',
  ok: '#34C759',
  erro: '#FF3B30',
  alerta: '#FFCC00',
};

export const statusDrop: Record<string, { label: string; cor: string }> = {
  rascunho: { label: 'rascunho', cor: colors.textoFraco },
  agendado: { label: 'agendado', cor: colors.laranja },
  publicado: { label: 'publicado', cor: colors.ok },
};

// cores dos status de uma run do scraper
export const statusCor: Record<string, string> = {
  iniciando: colors.alerta,
  rodando: colors.laranja,
  finalizado: colors.ok,
  parado: colors.textoFraco,
  erro: colors.erro,
};
