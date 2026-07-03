import React from 'react';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '@/theme';
import { HubScreen } from '@/screens/HubScreen';
import { PecasScreen } from '@/screens/PecasScreen';
import { CarrosselPecasScreen } from '@/screens/CarrosselPecasScreen';
import { DropsScreen } from '@/screens/DropsScreen';
import { DropDetailScreen } from '@/screens/DropDetailScreen';
import { HistoricoDropScreen } from '@/screens/HistoricoDropScreen';
import { GerarDropsScreen } from '@/screens/GerarDropsScreen';
import { DashboardScreen } from '@/screens/DashboardScreen';
import { SincronizarScreen } from '@/screens/SincronizarScreen';
import { RunScreen } from '@/screens/RunScreen';
import { InstagramLoginScreen } from '@/screens/InstagramLoginScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';

export type RootStackParamList = {
  Hub: undefined;
  Pecas: undefined;
  CarrosselPecas: { fotos: string[] };
  Drops: undefined;
  DropDetail: { dropId: number; nome: string };
  HistoricoDrop: { data: string | null; titulo: string };
  GerarDrops: undefined;
  Dashboard: undefined;
  Sincronizar: undefined;
  Run: { runId: string; nome: string };
  InstagramLogin: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

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
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.texto,
          contentStyle: { backgroundColor: colors.bg },
        }}>
        <Stack.Screen name="Hub" component={HubScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Pecas" component={PecasScreen} options={{ title: 'Peças' }} />
        <Stack.Screen name="CarrosselPecas" component={CarrosselPecasScreen} options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="Drops" component={DropsScreen} options={{ title: 'Drops' }} />
        <Stack.Screen name="DropDetail" component={DropDetailScreen}
          options={({ route }) => ({ title: route.params.nome })} />
        <Stack.Screen name="HistoricoDrop" component={HistoricoDropScreen}
          options={({ route }) => ({ title: route.params.titulo })} />
        <Stack.Screen name="GerarDrops" component={GerarDropsScreen} options={{ title: 'Gerar drops' }} />
        <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Dashboard' }} />
        <Stack.Screen name="Sincronizar" component={SincronizarScreen} options={{ title: 'Sincronizar brechó' }} />
        <Stack.Screen name="Run" component={RunScreen} options={({ route }) => ({ title: route.params.nome })} />
        <Stack.Screen name="InstagramLogin" component={InstagramLoginScreen} options={{ title: 'Conectar Instagram' }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Configurações' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
