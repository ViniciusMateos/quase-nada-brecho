import React from 'react';
import { View } from 'react-native';
import { DarkTheme, NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '@/theme';
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

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg, card: colors.card, text: colors.texto,
    primary: colors.marca, border: colors.border,
  },
};

export function RootNavigator() {
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
        <Stack.Screen name="Pecas" component={PecasScreen} options={{ title: 'Peças' }} />
        <Stack.Screen name="CarrosselPecas" component={CarrosselPecasScreen} options={{ headerShown: false, presentation: 'modal', gestureEnabled: false }} />
        <Stack.Screen name="Drops" component={DropsScreen} options={{ title: 'Drops' }} />
        <Stack.Screen name="DropDetail" component={DropDetailScreen}
          options={({ route }) => ({ title: route.params.nome })} />
        <Stack.Screen name="HistoricoDrop" component={HistoricoDropScreen}
          options={({ route }) => ({ title: route.params.titulo })} />
        <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Dashboard' }} />
        <Stack.Screen name="Sincronizar" component={SincronizarScreen} options={{ title: 'Sincronizar brechó' }} />
        <Stack.Screen name="Run" component={RunScreen} options={({ route }) => ({ title: route.params.nome })} />
        <Stack.Screen name="Historico" component={HistoricoScreen} options={{ title: 'Histórico' }} />
        <Stack.Screen name="InstagramLogin" component={InstagramLoginScreen} options={{ title: 'Conectar Instagram' }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Configurações' }} />
      </Stack.Navigator>
      </View>
      <BarraScraperGlobal onAbrir={(runId) => {
        if (navigationRef.isReady()) navigationRef.navigate('Run', { runId, nome: 'Raspando o brechó' });
      }} />
    </NavigationContainer>
  );
}
