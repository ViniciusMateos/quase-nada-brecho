import React, { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { api, RunInfo } from '@/lib/api';
import { useTheme } from '@/theme-context';
import { useI18n } from '@/i18n';
import { type Cores, statusCor } from '@/theme';
import { Aparece, Botao, Card, Pill, Pulsar } from '@/ui/components';
import { iniciarLAparaRun } from '@/lib/la';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const STATUS_RUN = ['iniciando', 'rodando', 'finalizado', 'parado', 'erro'];

export function SincronizarScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const statusTxt = (s: string) => (STATUS_RUN.includes(s) ? t(`run.status.${s}`) : s);
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const [runs, setRuns] = useState<RunInfo[]>([]);
  const [iniciando, setIniciando] = useState(false);

  const carregar = useCallback(() => {
    api.listRuns().then((r) => setRuns(r.slice().reverse())).catch(() => setRuns([]));
  }, []);
  // enquanto a tela está aberta, atualiza o estado dos runs (pra saber se já tem raspagem rodando)
  useFocusEffect(useCallback(() => {
    carregar();
    const id = setInterval(carregar, 2500);
    return () => clearInterval(id);
  }, [carregar]));

  // já tem uma RASPAGEM rodando? (conectar Instagram não conta) → bloqueia iniciar outra
  const raspando = runs.some(
    (r) => ['rodando', 'iniciando'].includes(r.status) && !r.params?.import_cookies);

  async function rodar(params: Record<string, unknown>, nome: string) {
    setIniciando(true);
    try {
      const run = await api.startRun(params);
      await iniciarLAparaRun(run.id, t('sync.la'));
      nav.navigate('Run', { runId: run.id, nome });
    } catch {
      carregar();  // pode ter sido "já tem raspagem rodando" (409) → atualiza o estado dos botões
      Alert.alert(t('sync.err.title'), t('sync.err.msg'));
    } finally {
      setIniciando(false);
    }
  }

  const ativos = runs.filter((r) => ['rodando', 'iniciando'].includes(r.status));

  return (
    <ScrollView style={styles.tela} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 24 }}>
      <Aparece>
        <Card style={{ gap: 12 }}>
          <Text style={styles.titulo}>{t('sync.card.title')}</Text>
          <Text style={styles.desc}>{t('sync.card.desc')}</Text>
          <Botao title={raspando ? t('sync.inProgress') : t('sync.update')}
            onPress={() => rodar({}, t('sync.run.scrape'))} loading={iniciando} disabled={raspando || iniciando} />
          <Botao title={t('sync.preview')} cor={colors.card2} txtCor={colors.texto}
            onPress={() => rodar({ dry_run: true }, t('sync.run.preview'))} disabled={raspando || iniciando} />
          <Botao title={t('sync.full')} cor={colors.card2} txtCor={colors.texto}
            onPress={() => rodar({ full: true }, t('sync.full'))} disabled={raspando || iniciando} />
          <Text style={styles.hint}>{t('sync.hint')}</Text>
        </Card>
      </Aparece>

      <Aparece delay={40}>
        <Card style={{ gap: 12 }}>
          <Text style={styles.titulo}>{t('sync.ig.title')}</Text>
          <Text style={styles.desc}>{t('sync.ig.desc')}</Text>
          <Botao title={t('sync.ig.connect')} cor={colors.marca} txtCor="#FFFFFF"
            onPress={() => nav.navigate('InstagramLogin')} />
        </Card>
      </Aparece>

      {ativos.length > 0 && (
        <Aparece delay={80}>
          <Card>
            <Text style={styles.secao}>{t('sync.running')}</Text>
            {ativos.map((r) => (
              <View key={r.id} style={styles.runItem}>
                <Text style={styles.runTxt} onPress={() => nav.navigate('Run', { runId: r.id, nome: t('sync.run.name') })}>
                  {t('sync.seeLogs')}
                </Text>
                <Pulsar>
                  <Pill texto={statusTxt(r.status)} cor={statusCor(colors)[r.status] ?? colors.textoFraco} />
                </Pulsar>
              </View>
            ))}
          </Card>
        </Aparece>
      )}

      {runs.length > 0 && (
        <Aparece delay={120}>
          <Card style={{ gap: 8 }}>
            <Text style={styles.secao}>{t('sync.lastRuns')}</Text>
            {runs.slice(0, 8).map((r) => (
              <View key={r.id} style={styles.histItem}>
                <Ionicons name="time-outline" size={15} color={colors.textoFraco} />
                <Text style={styles.histTxt} onPress={() => nav.navigate('Run', { runId: r.id, nome: t('sync.run.execution') })}>
                  {r.id}
                </Text>
                <Pill texto={statusTxt(r.status)} cor={statusCor(colors)[r.status] ?? colors.textoFraco} />
              </View>
            ))}
          </Card>
        </Aparece>
      )}
    </ScrollView>
  );
}

const makeStyles = (colors: Cores) => StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg },
  titulo: { color: colors.texto, fontSize: 17, fontWeight: '800' },
  desc: { color: colors.textoFraco, fontSize: 13, lineHeight: 19 },
  hint: { color: colors.textoFraco, fontSize: 11, lineHeight: 16, marginTop: 2 },
  secao: { color: colors.textoFraco, fontSize: 12, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase' },
  runItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  runTxt: { color: colors.laranja, fontSize: 14, fontWeight: '600' },
  histItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  histTxt: { color: colors.texto, fontSize: 13, flex: 1 },
});
