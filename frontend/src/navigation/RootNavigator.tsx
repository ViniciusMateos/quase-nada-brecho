import React, { useMemo } from 'react';
import { View } from 'react-native';
import { DarkTheme, DefaultTheme, NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '@/theme-context';
import { useI18n } from '@/i18n';
import { BarraScraperGlobal } from '@/ui/BarraScraperGlobal';
import { interacaoBus } from '@/ui/interacaoBus';
import { HubScreen } from '@/screens/HubScreen';
import { PecasScreen } from '@/screens/PecasScreen';
import { CarrosselPecasScreen } from '@/screens/CarrosselPecasScreen';
import { DropsScreen } from '@/screens/DropsScreen';
import { DropDetailScreen } from '@/screens/DropDetailScreen';
import { HistoricoDropScreen } from '@/screens/HistoricoDropScreen';
import { DashboardScreen } from '@/screens/DashboardScreen';
import { SincronizarScreen } from '@/screens/SincronizarScreen';
import { RunScreen } from '@/screens/RunScreen';
import { HistoricoScreen } from '@/screens/HistoricoScreen';
import { InstagramLoginScreen } from '@/screens/InstagramLoginScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';

export type RootStackParamList = {
  Hub: undefined;
  Pecas: { categoria?: string } | undefined;
  CarrosselPecas: { fotos: string[] };
  Drops: undefined;
  DropDetail: { dropId: number; nome: string };
  HistoricoDrop: { data: string | null; titulo: string };
  Dashboard: undefined;
  Sincronizar: undefined;
  Run: { runId: string; nome: string };
  Historico: undefined;
  InstagramLogin: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function RootNavigator() {
  const { colors, isDark } = useTheme();
  const { t } = useI18n();

  const navTheme = useMemo(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: colors.bg, card: colors.card, text: colors.texto,
        primary: colors.marca, border: colors.border,
      },
    };
  }, [colors, isDark]);

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      {/* captura (sem roubar) qualquer toque/scroll nas telas → avisa a barra flutuante
          pra ela se recolher em bolha. Retornar false = não vira responder. */}
      <View
        style={{ flex: 1 }}
        onStartShouldSetResponderCapture={() => { interacaoBus.emitir(); return false; }}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.texto,
          contentStyle: { backgroundColor: colors.bg },
        }}>
        <Stack.Screen name="Hub" component={HubScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Pecas" component={PecasScreen} options={{ title: t('nav.pecas') }} />
        <Stack.Screen name="CarrosselPecas" component={CarrosselPecasScreen} options={{ headerShown: false, presentation: 'modal', gestureEnabled: false }} />
        <Stack.Screen name="Drops" component={DropsScreen} options={{ title: t('nav.drops') }} />
        <Stack.Screen name="DropDetail" component={DropDetailScreen}
          options={({ route }) => ({ title: route.params.nome })} />
        <Stack.Screen name="HistoricoDrop" component={HistoricoDropScreen}
          options={({ route }) => ({ title: route.params.titulo })} />
        <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ title: t('nav.dashboard') }} />
        <Stack.Screen name="Sincronizar" component={SincronizarScreen} options={{ title: t('nav.sync') }} />
        <Stack.Screen name="Run" component={RunScreen} options={({ route }) => ({ title: route.params.nome })} />
        <Stack.Screen name="Historico" component={HistoricoScreen} options={{ title: t('nav.history') }} />
        <Stack.Screen name="InstagramLogin" component={InstagramLoginScreen} options={{ title: t('nav.instagram') }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: t('nav.settings') }} />
      </Stack.Navigator>
      </View>
      <BarraScraperGlobal onAbrir={(runId) => {
        if (navigationRef.isReady()) navigationRef.navigate('Run', { runId, nome: 'Raspando o brechó' });
      }} />
    </NavigationContainer>
  );
}
