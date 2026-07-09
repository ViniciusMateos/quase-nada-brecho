import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { RootNavigator, navigationRef } from '@/navigation/RootNavigator';
import { registrarPush } from '@/lib/push';

export default function App() {
  useEffect(() => {
    // registra o device pra push (start/fim). No-op no Expo Go / simulador.
    registrarPush();
    // tocou na notificação → abre a tela da Run
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      const d = (resp.notification.request.content.data ?? {}) as { runId?: string };
      if (d.runId && navigationRef.isReady()) {
        navigationRef.navigate('Run', { runId: d.runId, nome: 'Raspando o brechó' });
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <RootNavigator />
    </SafeAreaProvider>
  );
}
