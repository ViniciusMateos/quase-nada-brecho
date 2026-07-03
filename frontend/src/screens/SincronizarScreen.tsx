import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { api, RunInfo } from '@/lib/api';
import { colors, statusCor } from '@/theme';
import { Aparece, Botao, Card, Pill, Pulsar } from '@/ui/components';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function SincronizarScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const [runs, setRuns] = useState<RunInfo[]>([]);
  const [iniciando, setIniciando] = useState(false);

  const carregar = useCallback(() => {
    api.listRuns().then((r) => setRuns(r.slice().reverse())).catch(() => setRuns([]));
  }, []);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  async function rodar(params: Record<string, unknown>, nome: string) {
    setIniciando(true);
    try {
      const run = await api.startRun(params);
      nav.navigate('Run', { runId: run.id, nome });
    } catch {
      Alert.alert('Ops', 'Não consegui iniciar. Confira o servidor/token em Configurações e se o Instagram está conectado.');
    } finally {
      setIniciando(false);
    }
  }

  const ativos = runs.filter((r) => ['rodando', 'iniciando'].includes(r.status));

  return (
    <ScrollView style={styles.tela} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 24 }}>
      <Aparece>
        <Card style={{ gap: 12 }}>
          <Text style={styles.titulo}>Raspar o Instagram</Text>
          <Text style={styles.desc}>
            Lê os posts do @brechoquasenadaa, atualiza vendas/disponíveis e sincroniza os números
            do dashboard. As peças raspadas entram como histórico (não bagunçam o planejamento de drops).
          </Text>
          <Botao title="🔄 Atualizar agora" onPress={() => rodar({}, 'Raspagem do brechó')} loading={iniciando} />
          <Botao title="👀 Prévia (não grava)" cor={colors.card2} txtCor={colors.texto}
            onPress={() => rodar({ dry_run: true }, 'Prévia da raspagem')} />
        </Card>
      </Aparece>

      <Aparece delay={40}>
        <Card style={{ gap: 12 }}>
          <Text style={styles.titulo}>Instagram</Text>
          <Text style={styles.desc}>
            Loga uma vez na conta do brechó pra liberar a raspagem. A sessão fica salva no servidor.
          </Text>
          <Botao title="🔗 Conectar Instagram" cor={colors.marca} txtCor="#FFFFFF"
            onPress={() => nav.navigate('InstagramLogin')} />
        </Card>
      </Aparece>

      {ativos.length > 0 && (
        <Aparece delay={80}>
          <Card>
            <Text style={styles.secao}>Rodando agora</Text>
            {ativos.map((r) => (
              <View key={r.id} style={styles.runItem}>
                <Text style={styles.runTxt} onPress={() => nav.navigate('Run', { runId: r.id, nome: 'Raspagem' })}>
                  ver logs →
                </Text>
                <Pulsar>
                  <Pill texto={r.status} cor={statusCor[r.status] ?? colors.textoFraco} />
                </Pulsar>
              </View>
            ))}
          </Card>
        </Aparece>
      )}

      {runs.length > 0 && (
        <Aparece delay={120}>
          <Card style={{ gap: 8 }}>
            <Text style={styles.secao}>Últimas execuções</Text>
            {runs.slice(0, 8).map((r) => (
              <View key={r.id} style={styles.histItem}>
                <Ionicons name="time-outline" size={15} color={colors.textoFraco} />
                <Text style={styles.histTxt} onPress={() => nav.navigate('Run', { runId: r.id, nome: 'Execução' })}>
                  {r.id}
                </Text>
                <Pill texto={r.status} cor={statusCor[r.status] ?? colors.textoFraco} />
              </View>
            ))}
          </Card>
        </Aparece>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg },
  titulo: { color: colors.texto, fontSize: 17, fontWeight: '800' },
  desc: { color: colors.textoFraco, fontSize: 13, lineHeight: 19 },
  secao: { color: colors.textoFraco, fontSize: 12, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase' },
  runItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  runTxt: { color: colors.laranja, fontSize: 14, fontWeight: '600' },
  histItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  histTxt: { color: colors.texto, fontSize: 13, flex: 1 },
});
