import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, AppState, NativeScrollEvent, NativeSyntheticEvent, Pressable,
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { api, logsWsUrl } from '@/lib/api';
import { useTheme } from '@/theme-context';
import { useI18n } from '@/i18n';
import { type Cores, statusCor } from '@/theme';
import { BarraProgresso, Botao, Pill, Pulsar } from '@/ui/components';
import { LoadingDog } from '@/ui/LoadingDog';
import type { Progresso } from '@/lib/api';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Rt = RouteProp<RootStackParamList, 'Run'>;

// Log inteligente: detecta arte de terminal e renderiza como UI adaptável ao celular.
type Parsed =
  | { tipo: 'divisor' }
  | { tipo: 'titulo'; texto: string }
  | { tipo: 'kv'; label: string; valor: string }
  | { tipo: 'evento'; status: string; resto: string; cor: string; forte: boolean }
  | { tipo: 'texto'; hora: string; texto: string; cor: string; forte: boolean };

// status de cada peça no log (fase A/B + reconciliação) → rótulo MAIÚSCULO + cor, igual ao scraper
// antigo. Casado pelo COMEÇO da linha (o módulo emite o status primeiro). 'azul'/'branco' = cores
// fixas boas no fundo escuro do log; o resto vem do tema.
const EV_DEFS: { re: RegExp; label: string; key: string; forte: boolean }[] = [
  { re: /^VENDIDA\b/i, label: 'VENDIDA', key: 'ok', forte: true },
  { re: /^DISPON[IÍ]VEL\b/i, label: 'DISPONÍVEL', key: 'azul', forte: false },
  { re: /^NOV[AO]\b/i, label: 'NOVO', key: 'laranja', forte: true },
  { re: /^ATUALIZADA\b/i, label: 'ATUALIZADA', key: 'marca', forte: true },
  { re: /^RELACIONADA\b/i, label: 'RELACIONADA', key: 'azul', forte: false },
  { re: /^DIVULGA\S*/i, label: 'DIVULGAÇÃO', key: 'fraco', forte: false },
  { re: /^N[ÃA]O ABRIU\b/i, label: 'NÃO ABRIU', key: 'alerta', forte: false },
  { re: /^INDISPON[IÍ]VEL\b/i, label: 'INDISPONÍVEL', key: 'alerta', forte: false },
  { re: /^SEM LINK\b/i, label: 'SEM LINK', key: 'alerta', forte: false },
  { re: /^TRAVADA\b/i, label: 'TRAVADA', key: 'fraco', forte: false },
  { re: /^DESCENDO\b/i, label: 'DESCENDO', key: 'fraco', forte: false },
  { re: /^CONFERIR\b/i, label: 'CONFERIR', key: 'alerta', forte: true },   // peça travada: post diz vendido
  { re: /^resumo:/i, label: 'RESUMO', key: 'branco', forte: true },
];
function evCor(key: string, colors: Cores): string {
  switch (key) {
    case 'ok': return colors.ok;
    case 'laranja': return colors.laranja;
    case 'marca': return colors.marca;
    case 'alerta': return colors.alerta;
    case 'erro': return colors.erro;
    case 'azul': return '#5AA9FF';
    case 'branco': return '#FFFFFF';
    default: return colors.textoFraco;
  }
}

function corEvento(nivel: string, resto: string, colors: Cores): { cor: string; forte: boolean } {
  // eventos por peça do app: colore pelo rótulo do começo da linha
  if (resto.startsWith('VENDIDA')) return { cor: colors.ok, forte: true };
  if (resto.startsWith('NOVA')) return { cor: colors.laranja, forte: true };
  if (resto.startsWith('RELACIONADA')) return { cor: '#5AA9FF', forte: false };
  if (resto.startsWith('ATUALIZADA')) return { cor: colors.marca, forte: false };
  if (resto.startsWith('TRAVADA')) return { cor: colors.textoFraco, forte: false };
  if (resto.startsWith('resumo:')) return { cor: colors.texto, forte: true };
  const low = resto.toLowerCase();
  let cor = '#D8D8D8';
  let forte = false;
  if (nivel === 'ERROR' || low.includes('erro') || low.includes('falha')) {
    cor = colors.erro; forte = true;
  } else if (low.includes('atualizada') || low.includes('importada') || low.includes('vendida')) {
    cor = colors.ok;
  } else if (low.includes('peça') || low.includes('raspando') || low.includes('página')) {
    cor = colors.laranja;
  } else if (low.includes('pulou') || low.includes('divulgação') || low.includes('ignora')) {
    cor = colors.textoFraco;
  } else if (nivel === 'WARNING' || nivel === 'WARN') {
    cor = colors.alerta;
  }
  return { cor, forte };
}

function parseLinha(raw: string, colors: Cores): Parsed {
  if (raw.startsWith('[backend]')) {
    return { tipo: 'texto', hora: '', texto: raw.replace(/^\[backend\]\s*/, '• '), cor: colors.textoFraco, forte: false };
  }
  const m = raw.match(/^\d{4}-\d{2}-\d{2}\s+(\d{2}:\d{2}:\d{2})\s+(\w+)\s+([\s\S]*)$/);
  const hora = m ? m[1] : '';
  const nivel = m ? m[2] : '';
  const resto = (m ? m[3] : raw).trimEnd();

  if (/[─—]{3,}/.test(resto) || /-{5,}/.test(resto)) {
    const limpo = resto.replace(/[─—]+/g, ' ').replace(/-{3,}/g, ' ').replace(/\s{2,}/g, ' ').trim();
    return limpo ? { tipo: 'titulo', texto: limpo } : { tipo: 'divisor' };
  }
  const wrap = resto.match(/^[─—]\s*(.+?)\s*[─—]$/);
  if (wrap) return { tipo: 'titulo', texto: wrap[1].trim() };

  const kv = resto.match(/^(.+?)\s*[.·]{2,}\s*(.+)$/);
  if (kv) return { tipo: 'kv', label: kv[1].trim(), valor: kv[2].trim() };

  // evento por peça: status MAIÚSCULO no começo (VENDIDA/DISPONÍVEL/NOVO/…) + cor; o resto segue
  for (const d of EV_DEFS) {
    const mm = resto.match(d.re);
    if (mm) {
      const r = resto.slice(mm[0].length).replace(/^\s*[|:·—–-]+\s*/, '').replace(/\s+/g, ' ').trim();
      return { tipo: 'evento', status: d.label, resto: r, cor: evCor(d.key, colors), forte: d.forte };
    }
  }

  const { cor, forte } = corEvento(nivel, resto, colors);
  return { tipo: 'texto', hora, texto: resto, cor, forte };
}

function LogLinha({ raw, onCopiar }: { raw: string; onCopiar: (t: string) => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const p = parseLinha(raw, colors);
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [anim]);
  const wrapStyle = {
    opacity: anim,
    transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }],
  };

  let el;
  if (p.tipo === 'divisor') {
    el = <Animated.View style={[wrapStyle, styles.divisorWrap]}><View style={styles.divisor} /></Animated.View>;
  } else if (p.tipo === 'titulo') {
    el = <Animated.View style={wrapStyle}><Text style={styles.titulo}>{p.texto}</Text></Animated.View>;
  } else if (p.tipo === 'kv') {
    el = (
      <Animated.View style={[wrapStyle, styles.kvRow]}>
        <Text style={styles.kvLabel}>{p.label}</Text>
        <Text style={styles.kvValor}>{p.valor}</Text>
      </Animated.View>
    );
  } else if (p.tipo === 'evento') {
    el = (
      <Animated.View style={wrapStyle}>
        <Text style={styles.linha}>
          <Text style={{ color: p.cor, fontWeight: '800' }}>{p.status}</Text>
          {p.resto ? <Text style={{ color: p.forte ? p.cor : '#CFCFCF' }}>{'  ' + p.resto}</Text> : null}
        </Text>
      </Animated.View>
    );
  } else {
    el = (
      <Animated.View style={wrapStyle}>
        <Text style={[styles.linha, { color: p.cor }, p.forte && styles.forte]}>
          {p.hora ? <Text style={styles.hora}>{p.hora}  </Text> : null}
          {p.texto}
        </Text>
      </Animated.View>
    );
  }
  return <Pressable onLongPress={() => onCopiar(raw)} delayLongPress={280}>{el}</Pressable>;
}

function parseProgresso(txt: string): Progresso | null {
  const resto = txt.slice('[progress]'.length).trim();
  const m = resto.match(/^(\d+)\s+(\d+)\s*(.*)$/);
  if (!m) return null;
  return { done: parseInt(m[1], 10), total: parseInt(m[2], 10), label: m[3].trim() };
}

const STATUS_RUN = ['iniciando', 'rodando', 'finalizado', 'parado', 'erro', 'sem_sessao'];

export function RunScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { runId } = useRoute<Rt>().params;
  const [linhas, setLinhas] = useState<string[]>([]);
  const [status, setStatus] = useState('rodando');
  const [conectando, setConectando] = useState(true);
  const [parando, setParando] = useState(false);
  const [progresso, setProgresso] = useState<Progresso | null>(null);
  const [copiadoMsg, setCopiadoMsg] = useState<string | null>(null);
  const copiadoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const atBottomRef = useRef(true);
  const [mostrarVoltar, setMostrarVoltar] = useState(false);
  const botaoAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(botaoAnim, { toValue: mostrarVoltar ? 1 : 0, useNativeDriver: true, friction: 7, tension: 60 }).start();
  }, [mostrarVoltar, botaoAnim]);

  function aoScrollar(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    const perto = contentSize.height - (contentOffset.y + layoutMeasurement.height) < 60;
    atBottomRef.current = perto;
    setMostrarVoltar((atual) => (atual === !perto ? atual : !perto));
  }
  function irAoFinal() {
    scrollRef.current?.scrollToEnd({ animated: true });
    atBottomRef.current = true;
    setMostrarVoltar(false);
  }

  useEffect(() => {
    let alive = true;
    let reconectTimer: ReturnType<typeof setTimeout> | null = null;
    const FINAIS = ['finalizado', 'parado', 'erro', 'sem_sessao'];

    const conectar = async () => {
      if (!alive) return;
      if (reconectTimer) { clearTimeout(reconectTimer); reconectTimer = null; }
      try { wsRef.current?.close(); } catch { /* no-op */ }
      setConectando(true);
      try {
        const d = await api.getRun(runId);
        if (alive) setStatus(d.status);
      } catch {}
      if (!alive) return;
      const url = await logsWsUrl(runId);
      if (!alive) return;
      const ws = new WebSocket(url);
      wsRef.current = ws;
      // conectou: já sai do "carregando" (mesmo sem linha ainda, nos ~70s de abrir o
      // navegador). O server reenvia TODO o histórico ao abrir → zera pra não duplicar.
      ws.onopen = () => { if (alive) { setLinhas([]); setConectando(false); } };
      ws.onmessage = (e) => {
        if (!alive) return;
        setConectando(false);
        const txt = String(e.data);
        if (txt.startsWith('[progress]')) {
          const p = parseProgresso(txt);
          if (p) setProgresso(p);
          return;
        }
        setLinhas((prev) => [...prev, txt]);
      };
      ws.onerror = () => { if (alive) setConectando(false); };
      ws.onclose = async () => {
        if (!alive) return;
        setConectando(false);
        let fin = false;
        try {
          const d = await api.getRun(runId);
          if (alive) setStatus(d.status);
          fin = FINAIS.includes(d.status);
        } catch {}
        // o WS às vezes cai sozinho no meio da run (1006). Se a run AINDA está rodando,
        // reconecta pra não congelar os logs (o server reenvia o histórico ao reconectar).
        if (alive && !fin) {
          if (reconectTimer) clearTimeout(reconectTimer);
          reconectTimer = setTimeout(() => { if (alive) conectar(); }, 1500);
        }
      };
    };

    conectar();

    // ao voltar do segundo plano o iOS mata o WebSocket → reconecta pra retomar os logs ao vivo
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active' && alive) conectar();
    });

    return () => {
      alive = false;
      if (reconectTimer) clearTimeout(reconectTimer);
      wsRef.current?.close();
      sub.remove();
    };
  }, [runId]);

  async function parar() {
    setParando(true);
    try { await api.stopRun(runId); setStatus('parado'); } catch {} finally { setParando(false); }
  }

  async function copiar(texto: string, msg: string) {
    try { await Clipboard.setStringAsync(texto); } catch {}
    setCopiadoMsg(msg);
    if (copiadoTimer.current) clearTimeout(copiadoTimer.current);
    copiadoTimer.current = setTimeout(() => setCopiadoMsg(null), 1400);
  }

  const rodando = ['rodando', 'iniciando'].includes(status);
  const statusTxt = STATUS_RUN.includes(status) ? t(`run.status.${status}`) : status;

  return (
    <View style={styles.tela}>
      <View style={styles.topo}>
        <Pulsar ativo={rodando}>
          <Pill texto={statusTxt} cor={statusCor(colors)[status] ?? colors.textoFraco} />
        </Pulsar>
        <View style={styles.topoAcoes}>
          {linhas.length > 0 && (
            <TouchableOpacity style={styles.copiarBtn} hitSlop={8}
              onPress={() => copiar(linhas.join('\n'), t('run.copied.log'))}>
              <Ionicons name="copy-outline" size={16} color={colors.texto} />
              <Text style={styles.copiarTxt}>{t('run.copyLog')}</Text>
            </TouchableOpacity>
          )}
          {rodando && <Botao title={t('run.stop')} cor={colors.erro} txtCor="#fff" onPress={parar} loading={parando} />}
        </View>
      </View>
      {progresso && progresso.total > 0 && (
        <View style={styles.barraWrap}>
          <BarraProgresso done={progresso.done} total={progresso.total} label={progresso.label} />
        </View>
      )}
      {conectando && linhas.length === 0 ? (
        <View style={[styles.logBox, styles.loadingBox, { marginBottom: insets.bottom + 12 }]}>
          <LoadingDog size={56} />
          <Text style={styles.loadingTxt}>{t('run.loading')}</Text>
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={[styles.logBox, { marginBottom: insets.bottom + 12 }]}
          contentContainerStyle={{ padding: 12 }}
          onScroll={aoScrollar}
          scrollEventThrottle={32}
          onContentSizeChange={() => { if (atBottomRef.current) scrollRef.current?.scrollToEnd({ animated: true }); }}>
          {linhas.map((l, i) => (
            <LogLinha key={i} raw={l} onCopiar={(txt) => copiar(txt, t('run.copied.line'))} />
          ))}
        </ScrollView>
      )}
      {copiadoMsg && (
        <View style={[styles.copiadoPill, { bottom: insets.bottom + 70 }]} pointerEvents="none">
          <Ionicons name="checkmark" size={14} color="#FFFFFF" />
          <Text style={styles.copiadoTxt}>{copiadoMsg}</Text>
        </View>
      )}
      <Animated.View
        pointerEvents={mostrarVoltar ? 'auto' : 'none'}
        style={[styles.voltarWrap, {
          bottom: insets.bottom + 22,
          opacity: botaoAnim,
          transform: [
            { translateY: botaoAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) },
            { scale: botaoAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
          ],
        }]}>
        <TouchableOpacity style={styles.voltarBtn} onPress={irAoFinal} activeOpacity={0.85}>
          <Text style={styles.voltarTxt}>{t('run.toEnd')}</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const makeStyles = (colors: Cores) => StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg },
  topo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  topoAcoes: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  copiarBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  copiarTxt: { color: colors.texto, fontSize: 13, fontWeight: '600' },
  copiadoPill: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.ok, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  copiadoTxt: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  barraWrap: { paddingHorizontal: 16, paddingBottom: 12 },
  logBox: { flex: 1, backgroundColor: '#0A0A0A', marginHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  loadingBox: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingTxt: { color: colors.textoFraco, fontSize: 13 },
  linha: { fontFamily: 'monospace', fontSize: 12, lineHeight: 18 },
  hora: { color: '#5A5A5A', fontSize: 11 },
  forte: { fontWeight: '700' },
  divisorWrap: { paddingVertical: 7 },
  divisor: { height: 1, backgroundColor: colors.border },
  titulo: { color: colors.laranja, fontSize: 13, fontWeight: '700', marginTop: 14, marginBottom: 4, letterSpacing: 0.3 },
  kvRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, paddingVertical: 2 },
  // cores FIXAS claras: a caixa de log é sempre escura (#0A0A0A), no tema claro o texto do tema sumia
  kvLabel: { color: '#9A9A9A', fontSize: 13, flexShrink: 1 },
  kvValor: { color: '#EDEDED', fontSize: 13, fontWeight: '600' },
  voltarWrap: { position: 'absolute', right: 22 },
  voltarBtn: {
    backgroundColor: colors.laranja, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 6,
  },
  voltarTxt: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
});
