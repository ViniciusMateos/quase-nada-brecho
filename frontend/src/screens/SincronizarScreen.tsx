import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { api, IgStatus, RunInfo } from '@/lib/api';
import { lerCredenciais } from '@/lib/credenciais';
import { useTheme } from '@/theme-context';
import { useI18n } from '@/i18n';
import { type Cores, statusCor } from '@/theme';
import { Aparece, Botao, Card, Pill, Pulsar } from '@/ui/components';
import { iniciarLAparaRun } from '@/lib/la';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const STATUS_RUN = ['iniciando', 'rodando', 'finalizado', 'parado', 'erro', 'sem_sessao'];
const CACHE_CHECK_MS = 180_000;   // não re-verifica a sessão ao vivo se já checou faz < 3 min

export function SincronizarScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const statusTxt = (s: string) => (STATUS_RUN.includes(s) ? t(`run.status.${s}`) : s);
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const [runs, setRuns] = useState<RunInfo[]>([]);
  const [iniciando, setIniciando] = useState(false);

  // ── estado da sessão do Instagram (cartão "dá pra rodar?") ──
  const [igSt, setIgSt] = useState<IgStatus | null>(null);
  const [contaLocal, setContaLocal] = useState<string | null>(null);   // fallback: conta salva no aparelho
  const [check, setCheck] = useState<'idle' | 'ok' | 'sem_sessao' | 'erro'>('idle');
  const [verificando, setVerificando] = useState(false);
  const checkedAt = useRef(0);   // quando foi a última verificação ao vivo (cache)

  const carregar = useCallback(() => {
    api.listRuns().then((r) => setRuns(r.slice().reverse())).catch(() => setRuns([]));
  }, []);

  const carregarIg = useCallback(() => {
    api.igStatus().then(setIgSt).catch(() => setIgSt(null));
    lerCredenciais().then((cs) => setContaLocal(cs[0]?.usuario ?? null)).catch(() => {});
  }, []);

  // enquanto a tela está aberta, atualiza o estado dos runs (pra saber se já tem raspagem rodando)
  useFocusEffect(useCallback(() => {
    carregar();
    carregarIg();
    const id = setInterval(carregar, 2500);
    return () => clearInterval(id);
  }, [carregar, carregarIg]));

  // já tem uma RASPAGEM rodando? (conectar Instagram não conta) → bloqueia iniciar outra
  const raspando = runs.some(
    (r) => ['rodando', 'iniciando'].includes(r.status) && !r.params?.import_cookies);

  const verificarAoVivo = useCallback(async () => {
    setVerificando(true);
    try {
      const r = await api.igVerificar();
      setCheck(r.resultado);
      setIgSt((s) => ({ conectado: r.conectado, usuario: r.usuario ?? s?.usuario ?? null, conectado_em: s?.conectado_em ?? null }));
    } catch {
      // 409 (tem raspagem rodando) ou rede — mantém o último resultado conhecido, só não trava
    } finally {
      checkedAt.current = Date.now();   // marca o cache mesmo em falha, pra não martelar o server
      setVerificando(false);
    }
  }, []);

  // auto-verifica UMA vez ao abrir (se conectado, cache velho e sem raspagem rolando)
  useEffect(() => {
    if (igSt?.conectado && !verificando && !raspando && Date.now() - checkedAt.current > CACHE_CHECK_MS) {
      verificarAoVivo();
    }
  }, [igSt?.conectado, verificando, raspando, verificarAoVivo]);

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

  // conta a mostrar + pílula de status da sessão
  const conta = igSt?.usuario ?? contaLocal;
  const pill = verificando
    ? { txt: t('sync.ig.verifying'), cor: colors.textoFraco, pulsa: true }
    : check === 'ok' ? { txt: t('sync.ig.ok'), cor: colors.ok, pulsa: false }
    : check === 'sem_sessao' ? { txt: t('sync.ig.dead'), cor: colors.alerta, pulsa: false }
    : check === 'erro' ? { txt: t('sync.ig.errCheck'), cor: colors.erro, pulsa: false }
    : igSt?.conectado ? { txt: t('sync.ig.notChecked'), cor: colors.textoFraco, pulsa: false }
    : { txt: t('sync.ig.dead'), cor: colors.alerta, pulsa: false };
  const jaTem = !!(igSt?.conectado || conta);

  return (
    <ScrollView style={styles.tela} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 24 }}>
      <Aparece>
        <Card style={{ gap: 12 }}>
          <Text style={styles.titulo}>{t('sync.card.title')}</Text>
          <Text style={styles.desc}>{t('sync.card.desc')}</Text>
          <Botao title={raspando ? t('sync.inProgress') : t('sync.update')}
            onPress={() => rodar({}, t('sync.run.scrape'))} loading={iniciando} disabled={raspando || iniciando || verificando} />
          <Botao title={t('sync.preview')} cor={colors.card2} txtCor={colors.texto}
            onPress={() => rodar({ dry_run: true }, t('sync.run.preview'))} disabled={raspando || iniciando || verificando} />
          <Botao title={t('sync.full')} cor={colors.card2} txtCor={colors.texto}
            onPress={() => rodar({ full: true }, t('sync.full'))} disabled={raspando || iniciando || verificando} />
          <Text style={styles.hint}>{t('sync.hint')}</Text>
        </Card>
      </Aparece>

      <Aparece delay={40}>
        <Card style={{ gap: 12 }}>
          <Text style={styles.titulo}>{t('sync.ig.title')}</Text>

          <View style={styles.igRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.igConta}>{conta ? `@${conta}` : t('sync.ig.noAccount')}</Text>
              {igSt?.conectado_em ? (
                <Text style={styles.igSub}>{t('sync.ig.since', { d: igSt.conectado_em })}</Text>
              ) : null}
            </View>
            {pill.pulsa
              ? <Pulsar><Pill texto={pill.txt} cor={pill.cor} /></Pulsar>
              : <Pill texto={pill.txt} cor={pill.cor} />}
          </View>

          {igSt?.conectado && (
            <Botao title={t('sync.ig.verify')} cor={colors.card2} txtCor={colors.texto}
              onPress={verificarAoVivo} loading={verificando} disabled={verificando || raspando} />
          )}
          <Botao title={jaTem ? t('sync.ig.reconnect') : t('sync.ig.connect')} cor={colors.marca} txtCor="#FFFFFF"
            onPress={() => nav.navigate('ContaInstagram')} />
          <Text style={styles.desc}>{t('sync.ig.desc')}</Text>
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
  igRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  igConta: { color: colors.texto, fontSize: 15, fontWeight: '700' },
  igSub: { color: colors.textoFraco, fontSize: 11, marginTop: 2 },
  runItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  runTxt: { color: colors.laranja, fontSize: 14, fontWeight: '600' },
  histItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  histTxt: { color: colors.texto, fontSize: 13, flex: 1 },
});
