// Identidade Quase Nada Brechó — laranja original da marca (#FF8234).
// É a cor de origem do brechó dentro do Insta e o motivo da marca Quase Nada existir.
//
// Tema dinâmico: DARK e LIGHT compartilham as cores de MARCA (laranja, rosa, roxo,
// ok/erro/alerta) e só trocam as de superfície (bg/card/texto/borda). As telas
// consomem via `useTheme()` (theme-context) — nada de importar cor estática.
const laranja = '#FF8234';
const laranjaFogo = '#FF6A00';
const laranjaClaro = '#FFA94D';
const laranjaEscuro = '#C1440E';
const amarelo = '#FFB703';

// cores de marca — iguais nos dois temas
const marcaBase = {
  laranja,
  laranjaFogo,
  laranjaClaro,
  laranjaEscuro,
  amarelo,
  marca: laranja,                       // accent sólido da marca
  rosa: '#FB6F92',                       // pop quente (complementa o laranja)
  roxo: '#7B2CBF',                       // accent de contraste
  gradiente: [laranjaFogo, laranja, laranjaClaro] as const,
  ok: '#34C759',
  erro: '#FF3B30',
  alerta: '#FFCC00',
};

export const DARK = {
  ...marcaBase,
  bg: '#0F0F0F',
  card: '#1A1A1A',
  card2: '#242424',
  border: '#2C2C2C',
  texto: '#F2F2F2',
  textoFraco: '#9A9A9A',
};

export const LIGHT = {
  ...marcaBase,
  ok: '#28A745',                         // verde um tico mais escuro pra contraste no branco
  bg: '#F6F6F7',
  card: '#FFFFFF',
  card2: '#EEEEF1',
  border: '#E3E3E7',
  texto: '#161616',
  textoFraco: '#767676',
};

export type Cores = typeof DARK;

// Compat: código fora de componente (ou ainda não migrado) importa `colors`.
// Aponta pro tema escuro (o padrão). Dentro de componente, use SEMPRE `useTheme()`.
export const colors = DARK;

export function statusDrop(c: Cores): Record<string, { label: string; cor: string }> {
  return {
    rascunho: { label: 'rascunho', cor: c.textoFraco },
    agendado: { label: 'agendado', cor: c.laranja },
    publicado: { label: 'publicado', cor: c.ok },
  };
}

// cores dos status de uma run do scraper
export function statusCor(c: Cores): Record<string, string> {
  return {
    iniciando: c.alerta,
    rodando: c.laranja,
    finalizado: c.ok,
    parado: c.textoFraco,
    erro: c.erro,
    sem_sessao: c.alerta,   // não é falha: sessão do IG expirou, é só reconectar
  };
}
