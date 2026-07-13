import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as
  { apiBaseUrl?: string; appVariant?: string; bundleId?: string };

// URL de produção (fixa) — o app já abre conectado sem precisar preencher nada.
// Pode ser sobrescrita em Configurações dentro do app.
const URL_PADRAO = 'https://quasenadaserver1.duckdns.org/brecho';

export const env = {
  apiBaseUrl: extra.apiBaseUrl || process.env.EXPO_PUBLIC_API_URL || URL_PADRAO,
  // token embutido via env (fica no .env.local / EAS, nunca no repo). Se vazio,
  // o usuário informa em Configurações.
  apiToken: process.env.EXPO_PUBLIC_API_TOKEN || '',
  appVariant: extra.appVariant ?? 'preview',
  // bundle deste build (dev x preview) — vai junto com o token da Live Activity
  // pro server empurrar o push no tópico certo do APNs.
  bundleId: extra.bundleId ?? '',
};
