import React, { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { api, ContaProntidao, Prontidao, RunInfo } from '@/lib/api';
import { useTheme } from '@/theme-context';
import { useI18n } from '@/i18n';
import { type Cores, statusCor } from '@/theme';
import { Aparece, Botao, Card, Pill, Pulsar } from '@/ui/components';
import { iniciarLAparaRun } from '@/lib/la';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const STATUS_RUN = ['iniciando', 'rodando', 'finalizado', 'parado', 'erro', 'sem_sessao'];

// epoch (s) → 'HH:MM' local; '' se inválido
function horaDe(epoch?: number): string {
  if (!epoch) return '';
  try {
    return new Date(epoch * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}
// segundos → '30s' / '2min' (desde o último ping do agente)
function haQuanto(s: number): string {
  if (s == null || s < 0) return '';
  return s < 90 ? `${Math.round(s)}s` : `${Math.round(s / 60)}min`;
}

export function SincronizarScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const statusTxt = (s: string) => (STATUS_RUN.includes(s) ? t(`run.status.${s}`) : s);
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const [runs, setRuns] = useState<RunInfo[]>([]);
  const [iniciando, setIniciando] = useState(false);
  const [prontidao, setProntidao] = useState<Prontidao | null>(null);

  const carregar = useCallback(() => {
    api.listRuns().then((r) => setRuns(r.slice().reverse())).catch(() => setRuns([]));
  }, []);
  const carregarProntidao = useCallback(() => {
    api.prontidaoEmulador().then(setProntidao).catch(() => setProntidao(null));
  }, []);

  // enquanto a tela está aberta: runs de perto (pra saber se já tem raspagem) e a prontidão
  // mais devagar (o heartbeat do agente é ~30s).
  useFocusEffect(useCallback(() => {
    carregar();
    carregarProntidao();
    const idRuns = setInterval(carregar, 2500);
    const idPront = setInterval(carregarProntidao, 15000);
    return () => { clearInterval(idRuns); clearInterval(idPront); };
  }, [carregar, carregarProntidao]));

  // já tem uma RASPAGEM rodando? (conectar Instagram não conta) → bloqueia iniciar outra
  const raspando = runs.some(
    (r) => ['rodando', 'iniciando'].includes(r.status) && !r.params?.import_cookies);

  async function rodar(params: Record<string, unknown>, nome: string) {
    setIniciando(true);
    try {
      // raspagem roda no EMULADOR (via backend dos Bots), não mais no Playwright do server.
      // O retorno é um RunInfo do brechó (mesma forma do startRun) que espelha a run do emulador,
      // então LA + navegação pra tela de Run seguem iguais.
      const run = await api.rasparEmulador(params);
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
          <Text style={styles.hint}>{t('sync.hint')}</Text>
        </Card>
      </Aparece>

      <Aparece delay={40}>
        <PainelProntidao p={prontidao} colors={colors} styles={styles} t={t} />
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

// Painel "tá pronto pra rodar?": emulador online/offline + status das contas auxiliares (rodízio).
function PainelProntidao({ p, colors, styles, t }: {
  p: Prontidao | null; colors: Cores; styles: ReturnType<typeof makeStyles>; t: (k: string, v?: any) => string;
}) {
  const online = !!p?.agente_online;
  const corResumo = !p ? colors.textoFraco : !online ? colors.erro : p.pronto ? colors.ok : colors.alerta;
  const ping = p && online ? haQuanto(p.ultimo_ping_ha_s) : '';

  return (
    <Card style={{ gap: 12 }}>
      <View style={styles.readyTopo}>
        <View style={styles.readyTituloRow}>
          <View style={[styles.dot, { backgroundColor: online ? colors.ok : colors.erro }]} />
          <Text style={styles.titulo}>{t('sync.ready.title')}</Text>
        </View>
        <Pill texto={online ? t('sync.ready.online') : t('sync.ready.offline')}
          cor={online ? colors.ok : colors.erro} />
      </View>

      {p ? (
        <Text style={[styles.readyResumo, { color: corResumo }]}>{p.resumo}</Text>
      ) : (
        <Text style={styles.desc}>…</Text>
      )}

      {p?.emulador_ocupado && (
        <View style={styles.readyOcupado}>
          <Ionicons name="hourglass-outline" size={15} color={colors.alerta} />
          <Text style={styles.readyOcupadoTxt}>{t('sync.ready.busy')}</Text>
        </View>
      )}

      {ping ? <Text style={styles.readyPing}>{t('sync.ready.pingAgo', { s: ping })}</Text> : null}

      {p && p.contas.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={styles.secao}>{t('sync.ready.accounts')}</Text>
          {p.contas.map((c) => (
            <ContaRow key={c.conta} c={c} proxima={c.conta === p.proxima} colors={colors} styles={styles} t={t} />
          ))}
        </View>
      )}
      {p && online && p.contas.length === 0 && (
        <Text style={styles.readyVazio}>{t('sync.ready.noAccounts')}</Text>
      )}

      <Text style={styles.desc}>{t('sync.ready.desc')}</Text>
    </Card>
  );
}

function ContaRow({ c, proxima, colors, styles, t }: {
  c: ContaProntidao; proxima: boolean; colors: Cores; styles: ReturnType<typeof makeStyles>;
  t: (k: string, v?: any) => string;
}) {
  const vis = c.estado === 'apta'
    ? { icon: 'checkmark-circle' as const, cor: colors.ok, badge: t('sync.ready.apta') }
    : c.estado === 'descansando'
    ? { icon: 'moon' as const, cor: colors.alerta,
        badge: horaDe(c.ate) ? t('sync.ready.restingUntil', { h: horaDe(c.ate) }) : t('sync.ready.resting') }
    : { icon: 'ban' as const, cor: colors.erro, badge: t('sync.ready.blocked') };
  return (
    <View style={styles.contaItem}>
      <Ionicons name={vis.icon} size={16} color={vis.cor} />
      <View style={{ flex: 1 }}>
        <Text style={styles.contaNome}>@{c.conta}</Text>
        {c.motivo && c.estado !== 'apta' ? <Text style={styles.contaMotivo}>{c.motivo}</Text> : null}
      </View>
      {proxima ? (
        <View style={styles.proxChip}>
          <Ionicons name="play" size={10} color={colors.marca} />
          <Text style={styles.proxChipTxt}>{t('sync.ready.next')}</Text>
        </View>
      ) : null}
      <Pill texto={vis.badge} cor={vis.cor} />
    </View>
  );
}

const makeStyles = (colors: Cores) => StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg },
  titulo: { color: colors.texto, fontSize: 17, fontWeight: '800' },
  desc: { color: colors.textoFraco, fontSize: 13, lineHeight: 19 },
  hint: { color: colors.textoFraco, fontSize: 11, lineHeight: 16, marginTop: 2 },
  secao: { color: colors.textoFraco, fontSize: 12, fontWeight: '700', marginBottom: 2, textTransform: 'uppercase' },
  runItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  runTxt: { color: colors.laranja, fontSize: 14, fontWeight: '600' },
  histItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  histTxt: { color: colors.texto, fontSize: 13, flex: 1 },
  // painel de prontidão
  readyTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  readyTituloRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  readyResumo: { fontSize: 15, fontWeight: '700', lineHeight: 21 },
  readyOcupado: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card2, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.alerta },
  readyOcupadoTxt: { color: colors.alerta, fontSize: 12, fontWeight: '600', flex: 1, lineHeight: 16 },
  readyPing: { color: colors.textoFraco, fontSize: 11, marginTop: -4 },
  readyVazio: { color: colors.textoFraco, fontSize: 13, fontStyle: 'italic' },
  contaItem: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card2, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.border },
  contaNome: { color: colors.texto, fontSize: 14, fontWeight: '700' },
  contaMotivo: { color: colors.textoFraco, fontSize: 11, marginTop: 2, lineHeight: 15 },
  proxChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.card, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: colors.marca },
  proxChipTxt: { color: colors.marca, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3 },
});
