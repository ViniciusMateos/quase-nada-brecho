const fs = require('fs');
const path = require('path');

// Carrega .env.local (não versionado) — útil pra apontar o EXPO_PUBLIC_API_URL no dev.
function loadLocalEnvFile() {
  const envPath = path.join(__dirname, '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const [k, ...v] = t.split('=');
    if (!process.env[k]) process.env[k] = v.join('=').trim();
  }
}
loadLocalEnvFile();

const requested = process.env.APP_VARIANT || 'preview';
const variant = requested === 'development' ? 'development' : 'preview';
const isDev = variant === 'development';

// Identidade Quase Nada Brechó: laranja original da marca. Ícones = os do
// Quase Nada Lembretes (o brechó é o motivo da marca existir).
const variants = {
  development: { name: 'QN Brechó Dev', scheme: 'qnbrecho-dev', bundleId: 'app.quasenada.brecho.dev', icon: './src/assets/icon-dev.png' },
  preview: { name: 'Quase Nada Brechó', scheme: 'qnbrecho', bundleId: 'app.quasenada.brecho.preview', icon: './src/assets/icon-prod.png' },
};
const current = variants[variant];

const extra = {
  apiBaseUrl: process.env.EXPO_PUBLIC_API_URL || '',
  appVariant: variant,
};
extra.eas = { projectId: process.env.EAS_PROJECT_ID || 'a0c13d7d-b73a-42ad-8d28-e1907c6500c9' };

module.exports = {
  expo: {
    name: current.name,
    slug: 'quase-nada-brecho',
    version: '1.0.0',
    orientation: 'portrait',
    scheme: current.scheme,
    userInterfaceStyle: 'dark',
    backgroundColor: '#0F0F0F',
    icon: current.icon,
    splash: { image: './src/assets/splash.png', resizeMode: 'contain', backgroundColor: '#0F0F0F' },
    ios: {
      bundleIdentifier: current.bundleId,
      supportsTablet: false,
      appleTeamId: '4F7QHTY86S',   // exigido pelo @bacons/apple-targets (assinatura do widget)
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        NSPhotoLibraryUsageDescription: 'Usado para anexar fotos das peças do brechó.',
        NSCameraUsageDescription: 'Usado para tirar fotos das peças do brechó.',
        NSSupportsLiveActivities: true,   // Live Activity da raspagem (barra viva)
        // dev fala com o backend local por http → libera cleartext só no dev
        ...(isDev ? { NSAppTransportSecurity: { NSAllowsArbitraryLoads: true, NSAllowsLocalNetworking: true } } : {}),
      },
    },
    android: {
      package: current.bundleId,
      usesCleartextTraffic: isDev,
      adaptiveIcon: { foregroundImage: current.icon, backgroundColor: '#FF8234' },
    },
    plugins: ['expo-secure-store', 'expo-notifications', 'expo-font', 'expo-asset', 'expo-image-picker', '@bacons/apple-targets'],
    extra,
  },
};
