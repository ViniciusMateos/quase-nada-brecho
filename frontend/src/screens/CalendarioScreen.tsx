import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, LayoutAnimation, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, UIManager, View } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { api, Peca } from '@/lib/api';
import { baseUrl } from '@/lib/apiClient';
import { type Cores } from '@/theme';
import { useTheme } from '@/theme-context';
import { useI18n } from '@/i18n';
import { Aparece } from '@/ui/components';
import { EditorPeca } from '@/ui/EditorPeca';
import { TelaCarregando } from '@/ui/LoadingDog';
import { useDogRefresh } from '@/ui/DogRefresh';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

function brl(n: number) {
  const [int, dec] = Math.abs(n).toFixed(2).split('.');
  return `R$ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
}
// faturamento da peça: consignada conta só a parte que fica pra mim
function receita(p: Peca): number {
  if (!p.consignado) return p.venda;
  if (p.consig_tipo === 'valor') return Math.min(p.consig_valor || 0, p.venda);
  return p.venda * ((p.consig_pct || 0) / 100);
}
const mm = (n: number) => String(n + 1).padStart(2, '0');

// LayoutAnimation no Android precisa desse opt-in
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
// transição suave de entrada/saída da lista de peças do dia (senão some/aparece seco)
const animarLista = () =>
  LayoutAnimation.configureNext(
    LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));

// ─── seta de navegação do mês, com press animado ───
function SetaBtn({ dir, onPress, styles, colors }: {
  dir: -1 | 1; onPress: () => void; styles: ReturnType<typeof makeStyles>; colors: Cores;
}) {
  const s = useRef(new Animated.Value(1)).current;
  const bounce = (to: number) =>
    Animated.spring(s, { toValue: to, useNativeDriver: true, tension: 200, friction: 9 }).start();
  return (
    <Pressable hitSlop={10} onPress={onPress}
      onPressIn={() => bounce(0.82)} onPressOut={() => bounce(1)}>
      <Animated.View style={[styles.setaBtn, { transform: [{ scale: s }] }]}>
        <Ionicons name={dir < 0 ? 'chevron-back' : 'chevron-forward'} size={22} color={colors.texto} />
      </Animated.View>
    </Pressable>
  );
}

// ─── uma célula de dia: entra com pop (só dias com venda) + press animado ───
function DiaCelula({ dia, qtd, sel, isHoje, onPress, styles }: {
  dia: number; qtd: number; sel: boolean; isHoje: boolean; onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  const entrada = useRef(new Animated.Value(qtd > 0 ? 0.4 : 1)).current;
  const press = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (qtd > 0) {
      entrada.setValue(0.4);
      Animated.spring(entrada, {
        toValue: 1, useNativeDriver: true, tension: 140, friction: 7,
        delay: Math.min(dia, 16) * 18,
      }).start();
    }
  }, [dia, qtd, entrada]);
  const bounce = (to: number) =>
    Animated.spring(press, { toValue: to, useNativeDriver: true, tension: 300, friction: 10 }).start();
  return (
    <Pressable style={styles.celula} disabled={!qtd} onPress={onPress}
      onPressIn={() => qtd && bounce(0.85)} onPressOut={() => qtd && bounce(1)}>
      <Animated.View
        style={[styles.diaBolha, qtd > 0 && styles.diaComVenda, sel && styles.diaSel,
          isHoje && !sel && styles.diaHoje, { transform: [{ scale: Animated.multiply(entrada, press) }] }]}>
        <Text style={[styles.diaTxt, (qtd > 0 || sel) && styles.diaTxtOn]}>{dia}</Text>
      </Animated.View>
      {qtd > 0 ? <Text style={styles.diaQtd}>{qtd}</Text> : <View style={{ height: 13 }} />}
    </Pressable>
  );
}

export function CalendarioScreen() {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const [pecas, setPecas] = useState<Peca[] | null>(null);
  const [base, setBase] = useState('');
  const hoje = new Date();
  const [ref, setRef] = useState({ ano: hoje.getFullYear(), mes: hoje.getMonth() });   // mes 0-11
  const [diaSel, setDiaSel] = useState<string | null>(null);
  const [editar, setEditar] = useState<{ peca: Peca | null } | null>(null);
  // troca o dia selecionado com transição (entra/sai suave, não seco)
  const setDia = useCallback((v: string | null) => { animarLista(); setDiaSel(v); }, []);

  // transição slide+fade ao trocar de mês (igual ao calendário do editar peça)
  const slideX = useRef(new Animated.Value(0)).current;
  const gridOp = useRef(new Animated.Value(1)).current;

  const carregar = useCallback(() => {
    baseUrl().then(setBase);
    return api.listPecas().then((r) => setPecas(r.pecas)).catch(() => setPecas([]));
  }, []);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));
  const { scrollProps, dog, spacerEl } = useDogRefresh(carregar);

  const img = (u: string | null) => (u ? { uri: /^https?:/.test(u) ? u : `${base}${u}` } : undefined);
  const prefixo = `${ref.ano}-${mm(ref.mes)}`;

  // vendas do mês agrupadas por dia (YYYY-MM-DD) + faturamento, gasto e lucro do mês
  const { porDia, totalMes, gastoMes, lucroMes, qtdMes } = useMemo(() => {
    const vendas = (pecas ?? []).filter((p) => p.vendida && p.vendida_em && p.vendida_em.slice(0, 7) === prefixo);
    const map: Record<string, Peca[]> = {};
    let total = 0, gasto = 0;
    for (const p of vendas) {
      const dia = p.vendida_em!.slice(0, 10);
      (map[dia] ||= []).push(p);
      total += receita(p);          // faturamento = o que fica pra mim
      gasto += p.compra || 0;       // gasto = o que paguei nas peças que venderam
    }
    return { porDia: map, totalMes: total, gastoMes: gasto, lucroMes: total - gasto, qtdMes: vendas.length };
  }, [pecas, prefixo]);
  const margemMes = totalMes > 0 ? Math.round((lucroMes / totalMes) * 100) : 0;   // lucro ÷ venda
  const roiMes = gastoMes > 0 ? Math.round((lucroMes / gastoMes) * 100) : 0;       // lucro ÷ gasto

  function irMes(delta: number) {
    const dir = delta > 0 ? 1 : -1;
    Animated.parallel([
      Animated.timing(slideX, { toValue: -dir * 40, duration: 120, useNativeDriver: true }),
      Animated.timing(gridOp, { toValue: 0, duration: 120, useNativeDriver: true }),
    ]).start(() => {
      setDiaSel(null);
      setRef((r) => {
        let mes = r.mes + delta, ano = r.ano;
        if (mes < 0) { mes = 11; ano--; } else if (mes > 11) { mes = 0; ano++; }
        return { ano, mes };
      });
      slideX.setValue(dir * 40);
      Animated.parallel([
        Animated.spring(slideX, { toValue: 0, useNativeDriver: true, tension: 90, friction: 11 }),
        Animated.timing(gridOp, { toValue: 1, duration: 190, useNativeDriver: true }),
      ]).start();
    });
  }

  if (!pecas) return <TelaCarregando />;

  const nomeMes = new Date(ref.ano, ref.mes, 1)
    .toLocaleDateString(lang === 'en' ? 'en-US' : 'pt-BR', { month: 'long', year: 'numeric' });
  const semana = lang === 'en' ? ['S', 'M', 'T', 'W', 'T', 'F', 'S'] : ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  const primeiro = new Date(ref.ano, ref.mes, 1).getDay();     // 0=domingo
  const diasNoMes = new Date(ref.ano, ref.mes + 1, 0).getDate();
  const celulas: (number | null)[] = [...Array(primeiro).fill(null), ...Array.from({ length: diasNoMes }, (_, i) => i + 1)];
  while (celulas.length % 7 !== 0) celulas.push(null);          // completa a última semana
  const semanas: (number | null)[][] = [];
  for (let i = 0; i < celulas.length; i += 7) semanas.push(celulas.slice(i, i + 7));
  const hojeStr = `${hoje.getFullYear()}-${mm(hoje.getMonth())}-${String(hoje.getDate()).padStart(2, '0')}`;

  const vendasDia = diaSel ? (porDia[diaSel] ?? []) : [];

  return (
    <View style={styles.tela}>
      {dog}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 14 }} {...scrollProps}>
        {spacerEl}

        {/* tocar em qualquer espaço vazio (ou num dia sem venda) desmarca o dia selecionado */}
        <Pressable style={{ gap: 14 }} onPress={() => { if (diaSel) setDia(null); }}>
        {/* topo do mês: navegação + faturamento */}
        <Aparece>
          <View style={styles.card}>
            <View style={styles.mesRow}>
              <SetaBtn dir={-1} onPress={() => irMes(-1)} styles={styles} colors={colors} />
              <Text style={styles.mesTxt}>{nomeMes}</Text>
              <SetaBtn dir={1} onPress={() => irMes(1)} styles={styles} colors={colors} />
            </View>
            <Animated.View style={{ opacity: gridOp }}>
              <Text style={styles.fatLabel}>{t('calendario.revenue')}</Text>
              <Text style={styles.fatValor}>{brl(totalMes)}</Text>
              <Text style={styles.fatSub}>{t('calendario.salesCount', { n: qtdMes })}</Text>
              <View style={styles.statsRow}>
                <View style={styles.statCol}>
                  <Text style={styles.statLabel}>{t('calendario.profit')}</Text>
                  <Text style={[styles.statValor, { color: lucroMes >= 0 ? colors.ok : colors.erro }]}>
                    {lucroMes < 0 ? '-' : ''}{brl(lucroMes)}
                  </Text>
                </View>
                <View style={styles.statCol}>
                  <Text style={styles.statLabel}>{t('calendario.margin')}</Text>
                  <Text style={[styles.statValor, { color: colors.texto }]}>{margemMes}%</Text>
                </View>
                <View style={styles.statCol}>
                  <Text style={styles.statLabel}>{t('calendario.roi')}</Text>
                  <Text style={[styles.statValor, { color: colors.laranja }]}>{roiMes}%</Text>
                </View>
                <View style={styles.statCol}>
                  <Text style={styles.statLabel}>{t('calendario.spend')}</Text>
                  <Text style={[styles.statValor, { color: colors.textoFraco }]}>{brl(gastoMes)}</Text>
                </View>
              </View>
            </Animated.View>
          </View>
        </Aparece>

        {/* grade do mês */}
        <Aparece delay={60}>
          <View style={styles.card}>
            <View style={styles.semanaRow}>
              {semana.map((d, i) => <Text key={i} style={styles.semanaTxt}>{d}</Text>)}
            </View>
            <Animated.View style={{ opacity: gridOp, transform: [{ translateX: slideX }] }}>
              {semanas.map((wk, wi) => (
                <View key={wi} style={styles.semanaGrid}>
                  {wk.map((dia, di) => {
                    if (dia == null) return <View key={`x${di}`} style={styles.celula} />;
                    const dstr = `${prefixo}-${String(dia).padStart(2, '0')}`;
                    const qtd = (porDia[dstr] ?? []).length;
                    const sel = diaSel === dstr;
                    return (
                      <DiaCelula key={dstr} dia={dia} qtd={qtd} sel={sel} isHoje={dstr === hojeStr}
                        onPress={() => setDia(sel ? null : (qtd ? dstr : null))} styles={styles} />
                    );
                  })}
                </View>
              ))}
            </Animated.View>
          </View>
        </Aparece>

        {/* vendas do dia selecionado, ou dica */}
        {diaSel ? (
          <Aparece delay={100}>
            <Text style={styles.secao}>
              {new Date(diaSel + 'T12:00:00').toLocaleDateString(lang === 'en' ? 'en-US' : 'pt-BR', { day: '2-digit', month: 'long' })}
              {'  ·  '}{t('calendario.salesCount', { n: vendasDia.length })}
            </Text>
            <FlatList
              scrollEnabled={false}
              data={vendasDia}
              keyExtractor={(p) => String(p.id)}
              contentContainerStyle={{ gap: 8 }}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.linha} activeOpacity={0.8}
                  onPress={() => setEditar({ peca: item })}>
                  {item.imagem_url ? (
                    <Image source={img(item.imagem_url)} style={styles.thumb} contentFit="cover" transition={120} />
                  ) : (
                    <View style={[styles.thumb, styles.thumbVazia]}>
                      <Ionicons name="shirt-outline" size={18} color={colors.textoFraco} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.nome} numberOfLines={1}>{item.nome || item.item || `#${item.id}`}</Text>
                    <Text style={styles.custoSub} numberOfLines={1}>
                      {t('calendario.itemCost', { v: brl(item.compra || 0) })}
                    </Text>
                    {item.venda_estimada ? <Text style={styles.estimada}>{t('calendario.estimated')}</Text> : null}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.venda}>{brl(receita(item))}</Text>
                    <Text style={styles.lucroSub}>
                      {t('calendario.itemProfit', { v: brl(receita(item) - (item.compra || 0)) })}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textoFraco} />
                </TouchableOpacity>
              )}
            />
          </Aparece>
        ) : (
          <Text style={styles.dica}>{qtdMes ? t('calendario.pickDay') : t('calendario.noSalesMonth')}</Text>
        )}
        </Pressable>
      </ScrollView>

      <EditorPeca visible={!!editar} peca={editar?.peca ?? null}
        onClose={() => setEditar(null)} onSaved={carregar} />
    </View>
  );
}

const makeStyles = (colors: Cores) => StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border },
  mesRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  setaBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.card2, alignItems: 'center', justifyContent: 'center' },
  mesTxt: { color: colors.texto, fontSize: 18, fontWeight: '800', textTransform: 'capitalize' },
  fatLabel: { color: colors.textoFraco, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginTop: 14 },
  fatValor: { color: colors.ok, fontSize: 30, fontWeight: '900', marginTop: 2 },
  fatSub: { color: colors.textoFraco, fontSize: 13, marginTop: 2 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  statCol: { width: '50%', paddingVertical: 6 },
  statLabel: { color: colors.textoFraco, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  statValor: { fontSize: 19, fontWeight: '800', marginTop: 3 },
  semanaRow: { flexDirection: 'row', marginBottom: 4 },
  semanaTxt: { flex: 1, textAlign: 'center', color: colors.textoFraco, fontSize: 12, fontWeight: '700' },
  semanaGrid: { flexDirection: 'row' },
  celula: { flex: 1, alignItems: 'center', paddingVertical: 4, gap: 2 },
  diaBolha: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  diaComVenda: { backgroundColor: colors.card2, borderWidth: 1, borderColor: colors.marca },
  diaSel: { backgroundColor: colors.marca, borderColor: colors.marca },
  diaHoje: { borderWidth: 1, borderColor: colors.textoFraco },
  diaTxt: { color: colors.texto, fontSize: 15, fontWeight: '600' },
  diaTxtOn: { color: colors.texto, fontWeight: '800' },
  diaQtd: { color: colors.marca, fontSize: 10, fontWeight: '800' },
  secao: { color: colors.textoFraco, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', marginLeft: 4, marginBottom: 2 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: colors.border },
  thumb: { width: 42, height: 52, borderRadius: 8, backgroundColor: colors.card2 },
  thumbVazia: { alignItems: 'center', justifyContent: 'center' },
  nome: { color: colors.texto, fontSize: 15, fontWeight: '600' },
  custoSub: { color: colors.textoFraco, fontSize: 12, marginTop: 2 },
  estimada: { color: colors.alerta, fontSize: 11, marginTop: 2 },
  venda: { color: colors.ok, fontSize: 15, fontWeight: '800' },
  lucroSub: { color: colors.textoFraco, fontSize: 11, marginTop: 2 },
  dica: { color: colors.textoFraco, textAlign: 'center', marginTop: 8, lineHeight: 20 },
});
