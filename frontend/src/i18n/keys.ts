// Dicionários PT/EN. Cobertura incremental: começa por Settings + Hub + nav.
// Chave ausente cai no PT (fallback). Conteúdo do usuário (nome de peça etc.) NÃO
// é traduzido — segue como foi escrito.
export type Dict = Record<string, string>;

export const PT: Dict = {
  // nav / headers
  'nav.settings': 'Configurações',
  'nav.pecas': 'Peças',
  'nav.drops': 'Drops',
  'nav.dashboard': 'Dashboard',
  'nav.sync': 'Sincronizar brechó',
  'nav.history': 'Histórico',
  'nav.instagram': 'Conectar Instagram',

  // settings
  'settings.title': 'Configurações',
  'settings.appearance': 'Aparência',
  'settings.theme': 'Tema',
  'settings.theme.sub': 'Escuro ou claro',
  'settings.dark': 'Escuro',
  'settings.light': 'Claro',
  'settings.language': 'Idioma',
  'settings.language.sub': 'Idioma do aplicativo',
  'settings.otaUpdated': 'atualizado',
  'settings.otaEmbedded': 'build',

  // hub
  'hub.tagline': 'Quase Nada',
  'hub.brand': 'Brechó',
  'hub.loading': 'carregando…',
  'hub.pecas': 'Peças',
  'hub.pecas.sub': '{n} cadastradas',
  'hub.drops': 'Drops',
  'hub.drops.sub': '{n} drops · agenda dos lançamentos',
  'hub.dashboard': 'Dashboard',
  'hub.dashboard.sub': 'faturamento, lucro, ROI e estoque',
  'hub.sync': 'Sincronizar brechó',
  'hub.sync.sub': 'raspa o Instagram e atualiza as vendas',
  'hub.history': 'Histórico',
  'hub.history.sub': 'raspagens anteriores: saldo, data e resultado',
  'hub.offline': 'Não conectei no servidor. Confira URL e token em Configurações.',
};

export const EN: Dict = {
  // nav / headers
  'nav.settings': 'Settings',
  'nav.pecas': 'Items',
  'nav.drops': 'Drops',
  'nav.dashboard': 'Dashboard',
  'nav.sync': 'Sync thrift',
  'nav.history': 'History',
  'nav.instagram': 'Connect Instagram',

  // settings
  'settings.title': 'Settings',
  'settings.appearance': 'Appearance',
  'settings.theme': 'Theme',
  'settings.theme.sub': 'Dark or light',
  'settings.dark': 'Dark',
  'settings.light': 'Light',
  'settings.language': 'Language',
  'settings.language.sub': 'App language',
  'settings.otaUpdated': 'updated',
  'settings.otaEmbedded': 'build',

  // hub
  'hub.tagline': 'Quase Nada',
  'hub.brand': 'Thrift',
  'hub.loading': 'loading…',
  'hub.pecas': 'Items',
  'hub.pecas.sub': '{n} cataloged',
  'hub.drops': 'Drops',
  'hub.drops.sub': '{n} drops · release schedule',
  'hub.dashboard': 'Dashboard',
  'hub.dashboard.sub': 'revenue, profit, ROI and stock',
  'hub.sync': 'Sync thrift',
  'hub.sync.sub': 'scrapes Instagram and updates sales',
  'hub.history': 'History',
  'hub.history.sub': 'past scrapes: balance, date and result',
  'hub.offline': "Couldn't reach the server. Check URL and token in Settings.",
};
