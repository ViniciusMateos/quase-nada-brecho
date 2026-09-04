import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api, Dashboard, DropResumo } from '@/lib/api';
import { useI18n } from '@/i18n';
import { traduzCategoria } from '@/i18n/categorias';
import { type Cores } from '@/theme';
import { useTheme } from '@/theme-context';
import { Aparece, Card } from '@/ui/components';
import { InfoAjuda } from '@/ui/InfoAjuda';
import { CalendarioFaixa } from '@/ui/CalendarioFaixa';
import { TelaCarregando } from '@/ui/LoadingDog';
import { useDogRefresh } from '@/ui/DogRefresh';
import type { RootStackParamList } from '@/navigation/RootNavigator';

const p2 = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const brData = (s: string) => s.split('-').reverse().join('/');   // 2026-07-29 → 29/07/2026

type Nav = NativeStackNavigationProp<RootStackParamList>;

function brl(n: number) {
  const [int, dec] = Math.abs(n).toFixed(2).split('.');
  const milhar = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${n < 0 ? '-' : ''}R$ ${milhar},${dec}`;
}
const pct = (n: number) => `${n.toFixed(1).replace('.', ',')}%`;
// rótulo de drop: se for uma data ISO, mostra DD/MM/AAAA; senão o nome
function rotuloDrop(s: string) {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

export function DashboardScreen() {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [dropsInfo, setDropsInfo] = useState<DropResumo[]>([]);
  const nav = useNavigation<Nav>();
  // período (janela de vendas): preset ou faixa personalizada. desde/ate null = tudo.
  const [periodo, setPeriodo] = useState<{ preset: string; desde: string | null; ate: string | null }>(
    { preset: 'tudo', desde: null, ate: null });
  const [faixaAberta, setFaixaAberta] = useState(false);

  // quando dados novos chegam (troca de filtro/refresh), os componentes entram com um fade
  // rápido — sem ficar "apagado" esperando o backend (não apaga preventivamente).
  const conteudoOp = useRef(new Animated.Value(1)).current;
  const jaCarregou = useRef(false);
  useEffect(() => {
    if (!dash) return;
    if (!jaCarregou.current) { jaCarregou.current = true; return; }   // 1º load real: sem flash
    conteudoOp.setValue(0.35);
    Animated.timing(conteudoOp, { toValue: 1, duration: 260, useNativeDriver: true }).start();
  }, [dash, conteudoOp]);

  function escolherPreset(key: string) {
    const h = new Date();
    if (key === 'tudo') return setPeriodo({ preset: 'tudo', desde: null, ate: null });
    if (key === 'mes') return setPeriodo({ preset: 'mes', desde: iso(new Date(h.getFullYear(), h.getMonth(), 1)), ate: iso(h) });
    if (key === '30d') { const d = new Date(h); d.setDate(d.getDate() - 29); return setPeriodo({ preset: '30d', desde: iso(d), ate: iso(h) }); }
    if (key === 'ano') return setPeriodo({ preset: 'ano', desde: iso(new Date(h.getFullYear(), 0, 1)), ate: iso(h) });
    if (key === 'anopassado') return setPeriodo({ preset: 'anopassado', desde: iso(new Date(h.getFullYear() - 1, 0, 1)), ate: iso(new Date(h.getFullYear() - 1, 11, 31)) });
  }

  const insets = useSafeAreaInsets();
  const carregar = useCallback(() => {
    return Promise.all([
      api.getDashboard(periodo.desde, periodo.ate).then(setDash)
        .catch(() => setDash({ existe: false, kpis: null, por_drop: [], por_categoria: [] })),
      api.listDropsTodos().then((r) => setDropsInfo(r.drops)).catch(() => {}),
    ]);
  }, [periodo.desde, periodo.ate]);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));
  const { scrollProps, dog, spacerEl } = useDogRefresh(carregar);

  // abre o drop da linha (resolve pelo número: manual -> DropDetail, histórico -> HistoricoDrop)
  function irPraDrop(numero: number | null) {
    if (numero == null) return;
    const d = dropsInfo.find((x) => x.numero === numero);
    if (!d) return;
    if (d.tipo === 'manual' && d.id != null) nav.navigate('DropDetail', { dropId: d.id, nome: `Drop ${d.numero}` });
    else nav.navigate('HistoricoDrop', { data: d.data, titulo: `Drop ${d.numero}` });
  }

  if (!dash) return <TelaCarregando />;
  if (!dash.existe || !dash.kpis) {
    return (
      <View style={styles.vazioTela}>
        <Text style={styles.vazioTxt}>
          {t('dashboard.vazio')}
        </Text>
      </View>
    );
  }

  const k = dash.kpis;
  const LABELS: Record<string, string> = {
    tudo: t('dashboard.periodAll'), mes: t('dashboard.periodMonth'),
    '30d': t('dashboard.period30'), ano: t('dashboard.periodYear'),
    anopassado: t('dashboard.periodLastYear'),
  };

  return (
    <View style={styles.tela}>
      {dog}
      <ScrollView style={styles.tela} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 32 }} {...scrollProps}>
      {spacerEl}

      {/* filtro de período: pills em scroll horizontal (não quebram linha) + faixa personalizada */}
      <Aparece>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
          {(['tudo', '30d', 'ano', 'anopassado'] as const).map((key) => (
            <PillP key={key} on={periodo.preset === key} onPress={() => escolherPreset(key)}>{LABELS[key]}</PillP>
          ))}
          <PillP on={periodo.preset === 'custom'} icon="calendar-outline" onPress={() => setFaixaAberta(true)}>
            {periodo.preset === 'custom' && periodo.desde && periodo.ate
              ? (periodo.desde === periodo.ate ? brData(periodo.desde) : `${brData(periodo.desde).slice(0, 5)}–${brData(periodo.ate).slice(0, 5)}`)
              : t('dashboard.periodCustom')}
          </PillP>
        </ScrollView>
      </Aparece>

      <Animated.View style={[styles.conteudo, { opacity: conteudoOp }]}>
      <Aparece>
        <View style={styles.heroGrid}>
          <Hero titulo={t('dashboard.faturamento')} valor={brl(k.faturamento)} cor={colors.ok} ajuda="faturamento" />
          <Hero titulo={t('dashboard.lucro')} valor={brl(k.lucro)} cor={colors.amarelo} rodape={t('dashboard.margem', { p: pct(k.margem_pct) })} ajuda="lucro" ajudaRodape="margem" />
          <Hero titulo={t('dashboard.roi')} valor={pct(k.roi_pct)} cor={colors.laranja} rodape={t('dashboard.retornoCusto')} ajuda="roi" />
          <Hero titulo={t('dashboard.taxaVenda')} valor={pct(k.taxa_venda)} cor={colors.rosa} rodape={t('dashboard.pecasFrac', { v: k.vendidas, t: k.total })} ajuda="taxaVenda" />
        </View>
      </Aparece>

      <Aparece delay={60}>
        <Card style={{ gap: 2 }}>
          <Secao>{t('dashboard.vendas')}</Secao>
          <Metric label={t('dashboard.projecaoTotal')} valor={brl(k.faturamento + k.estoque_valor)} destaque ajuda="projecao" />
          <Metric label={t('dashboard.pecasVendidas')} valor={`${k.vendidas}`} />
          <Metric label={t('dashboard.ticketMedio')} valor={brl(k.ticket_medio)} ajuda="ticketMedio" />
          <Metric label={t('dashboard.custoMedio')} valor={brl(k.custo_medio)} ajuda="custoMedio" />
          <Metric label={t('dashboard.cmv')} valor={brl(k.cmv)} ajuda="cmv" />
          <Metric label={t('dashboard.investidoTotal')} valor={brl(k.investido_total)} ajuda="investido" />
        </Card>
      </Aparece>

      <Aparece delay={120}>
        <Card style={{ gap: 2 }}>
          <Secao>{t('dashboard.estoque')}</Secao>
          <Metric label={t('dashboard.pecasDisponiveis')} valor={`${k.disponiveis}`} />
          <Metric label={t('dashboard.valorParado')} valor={brl(k.estoque_valor)} ajuda="valorParado" />
          <Metric label={t('dashboard.custoEstoque')} valor={brl(k.estoque_custo)} />
          <Metric label={t('dashboard.lucroPotencial')} valor={brl(k.estoque_lucro_potencial)} destaque ajuda="lucroPotencial" />
        </Card>
      </Aparece>

      {dash.por_categoria.length > 0 && (
        <Aparece delay={160}>
          <Card style={{ gap: 6 }}>
            <Secao>{t('dashboard.porCategoria')}</Secao>
            <TabelaHead />
            {dash.por_categoria.slice(0, 12).map((c) => (
              <TabelaLinha key={c.item} nome={traduzCategoria(c.item, lang)} vendidas={c.vendidas} total={c.total}
                faturamento={c.faturamento} lucro={c.lucro}
                onPress={() => nav.navigate('Pecas', { categoria: c.item })} />
            ))}
          </Card>
        </Aparece>
      )}

      {dash.por_drop.length > 0 && (
        <Aparece delay={200}>
          <Card style={{ gap: 6 }}>
            <Secao>{t('dashboard.porDrop', { n: dash.por_drop.length })}</Secao>
            <TabelaHead col1={t('dashboard.colDrop')} />
            {dash.por_drop.slice(0, 12).map((d, i) => (
              <TabelaLinha key={`drop-${d.numero ?? d.drop}-${i}`}
                nome={d.numero != null ? `Drop ${d.numero}` : rotuloDrop(d.drop)}
                sub={d.numero != null ? rotuloDrop(d.drop) : undefined}
                vendidas={d.vendidas} total={d.total} faturamento={d.faturamento} lucro={d.lucro}
                onPress={d.numero != null ? () => irPraDrop(d.numero) : undefined} />
            ))}
          </Card>
        </Aparece>
      )}
      </Animated.View>
      </ScrollView>

      <CalendarioFaixa visible={faixaAberta} desde={periodo.desde} ate={periodo.ate}
        onClose={() => setFaixaAberta(false)}
        onAplicar={(d, a) => {
          // fecha o modal PRIMEIRO e só troca o período quando ele já sumiu — senão o fade do
          // backdrop do modal se soma ao crossfade do conteúdo e dá a impressão de piscada
          setFaixaAberta(false);
          setTimeout(() => setPeriodo({ preset: 'custom', desde: d, ate: a }), 240);
        }} />
    </View>
  );
}

// mesma animação de press das chips das Peças (ChipBtn): spring de escala no toque
function PillP({ on, onPress, icon, children }: {
  on: boolean; onPress: () => void; icon?: React.ComponentProps<typeof Ionicons>['name']; children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const scale = useRef(new Animated.Value(1)).current;
  const anima = (to: number) =>
    Animated.spring(scale, { toValue: to, useNativeDriver: true, friction: 6, tension: 140 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={() => anima(0.9)} onPressOut={() => anima(1)}>
      <Animated.View style={[styles.pill, on && styles.pillOn, { transform: [{ scale }] }]}>
        {icon ? <Ionicons name={icon} size={13} color={on ? '#FFFFFF' : colors.marca} style={{ marginRight: 4 }} /> : null}
        <Text style={[styles.pillTxt, on && styles.pillTxtOn]}>{children}</Text>
      </Animated.View>
    </Pressable>
  );
}

function Hero({ titulo, valor, cor, rodape, ajuda, ajudaRodape }:
  { titulo: string; valor: string; cor: string; rodape?: string; ajuda?: string; ajudaRodape?: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={[styles.hero, { borderLeftColor: cor }]}>
      <View style={styles.heroTituloRow}>
        <Text style={styles.heroTitulo} numberOfLines={1}>{titulo}</Text>
        {ajuda ? <InfoAjuda termo={ajuda} /> : null}
      </View>
      <Text style={styles.heroValor} numberOfLines={1} adjustsFontSizeToFit>{valor}</Text>
      {rodape ? (
        <View style={styles.heroRodapeRow}>
          <Text style={styles.heroRodape} numberOfLines={1}>{rodape}</Text>
          {ajudaRodape ? <InfoAjuda termo={ajudaRodape} size={13} /> : null}
        </View>
      ) : null}
    </View>
  );
}

const Secao = ({ children }: { children: React.ReactNode }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return <Text style={styles.secao}>{children}</Text>;
};

function Metric({ label, valor, destaque, ajuda }: { label: string; valor: string; destaque?: boolean; ajuda?: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.metric}>
      <View style={styles.metricLabelRow}>
        <Text style={styles.metricLabel}>{label}</Text>
        {ajuda ? <InfoAjuda termo={ajuda} size={14} /> : null}
      </View>
      <Text style={[styles.metricValor, destaque && { color: colors.ok }]}>{valor}</Text>
    </View>
  );
}

function TabelaHead({ col1 }: { col1?: string }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.tabLinha}>
      <Text style={[styles.tabNome, styles.tabHead]}>{col1 ?? t('dashboard.colItem')}</Text>
      <Text style={[styles.tabCol, styles.tabHead]}>{t('dashboard.colVend')}</Text>
      <Text style={[styles.tabCol, styles.tabHead, { flex: 1.3 }]}>{t('dashboard.colFatur')}</Text>
      <Text style={[styles.tabCol, styles.tabHead, { flex: 1.3 }]}>{t('dashboard.colLucro')}</Text>
    </View>
  );
}

function TabelaLinha({ nome, sub, vendidas, total, faturamento, lucro, onPress }:
  { nome: string; sub?: string; vendidas: number; total: number; faturamento: number; lucro: number; onPress?: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const conteudo = (
    <>
      <View style={styles.tabNome}>
        <Text style={styles.tabNomeTxt} numberOfLines={1}>{nome}</Text>
        {sub ? <Text style={styles.tabSub} numberOfLines={1}>{sub}</Text> : null}
      </View>
      <Text style={styles.tabCol}>{vendidas}/{total}</Text>
      <Text style={[styles.tabCol, { flex: 1.3 }]}>{brl(faturamento)}</Text>
      <Text style={[styles.tabCol, styles.tabLucro, { flex: 1.3 }]}>{brl(lucro)}</Text>
      {onPress ? <Ionicons name="chevron-forward" size={14} color={colors.textoFraco} style={{ marginLeft: 4 }} /> : null}
    </>
  );
  if (onPress) {
    return <TouchableOpacity style={styles.tabLinha} activeOpacity={0.6} onPress={onPress}>{conteudo}</TouchableOpacity>;
  }
  return <View style={styles.tabLinha}>{conteudo}</View>;
}

const makeStyles = (colors: Cores) => StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg },
  vazioTela: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 32 },
  vazioTxt: { color: colors.textoFraco, textAlign: 'center', lineHeight: 20 },
  conteudo: { gap: 14 },
  pills: { flexDirection: 'row', gap: 8, paddingVertical: 2, paddingRight: 4 },
  pill: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  pillOn: { backgroundColor: colors.marca, borderColor: colors.marca },
  pillTxt: { color: colors.texto, fontSize: 13, fontWeight: '600' },
  pillTxtOn: { color: '#FFFFFF', fontWeight: '800' },
  heroGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hero: { flexBasis: '48%', flexGrow: 1, backgroundColor: colors.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 4 },
  heroTituloRow: { flexDirection: 'row', alignItems: 'center' },
  heroTitulo: { color: colors.textoFraco, fontSize: 11, textTransform: 'uppercase', fontWeight: '700', flexShrink: 1 },
  heroValor: { color: colors.texto, fontSize: 22, fontWeight: '800', marginTop: 4 },
  heroRodapeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  heroRodape: { color: colors.textoFraco, fontSize: 11, flexShrink: 1 },
  secao: { color: colors.textoFraco, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6 },
  metric: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  metricLabelRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  metricLabel: { color: colors.textoFraco, fontSize: 13, flexShrink: 1 },
  metricValor: { color: colors.texto, fontSize: 15, fontWeight: '700' },
  tabLinha: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  tabHead: { color: colors.textoFraco, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  tabNome: { color: colors.texto, fontSize: 13, flex: 2 },
  tabNomeTxt: { color: colors.texto, fontSize: 13, fontWeight: '600' },
  tabSub: { color: colors.textoFraco, fontSize: 10, marginTop: 1 },
  tabCol: { color: colors.texto, fontSize: 13, flex: 1, textAlign: 'right' },
  tabLucro: { color: colors.ok, fontWeight: '600' },
});
