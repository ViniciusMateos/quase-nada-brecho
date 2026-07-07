import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api, Dashboard, DropResumo } from '@/lib/api';
import { colors } from '@/theme';
import { Aparece, Card } from '@/ui/components';
import { TelaCarregando } from '@/ui/LoadingDog';
import { useDogRefresh } from '@/ui/DogRefresh';
import type { RootStackParamList } from '@/navigation/RootNavigator';

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
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [dropsInfo, setDropsInfo] = useState<DropResumo[]>([]);
  const nav = useNavigation<Nav>();

  const insets = useSafeAreaInsets();
  const carregar = useCallback(() => {
    return Promise.all([
      api.getDashboard().then(setDash)
        .catch(() => setDash({ existe: false, kpis: null, por_drop: [], por_categoria: [] })),
      api.listDropsTodos().then((r) => setDropsInfo(r.drops)).catch(() => {}),
    ]);
  }, []);
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
          Cadastra as primeiras peças em "Peças" que os números aparecem aqui.
        </Text>
      </View>
    );
  }

  const k = dash.kpis;

  return (
    <View style={styles.tela}>
      {dog}
      <ScrollView style={styles.tela} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 32 }} {...scrollProps}>
      {spacerEl}
      <Aparece>
        <View style={styles.heroGrid}>
          <Hero titulo="Faturamento" valor={brl(k.faturamento)} cor={colors.ok} />
          <Hero titulo="Lucro" valor={brl(k.lucro)} cor={colors.amarelo} rodape={`margem ${pct(k.margem_pct)}`} />
          <Hero titulo="ROI" valor={pct(k.roi_pct)} cor={colors.laranja} rodape="retorno s/ custo" />
          <Hero titulo="Taxa de venda" valor={pct(k.taxa_venda)} cor={colors.rosa} rodape={`${k.vendidas}/${k.total} peças`} />
        </View>
      </Aparece>

      <Aparece delay={60}>
        <Card style={{ gap: 2 }}>
          <Secao>Vendas</Secao>
          <Metric label="Projeção total (vendido + estoque)" valor={brl(k.faturamento + k.estoque_valor)} destaque />
          <Metric label="Peças vendidas" valor={`${k.vendidas}`} />
          <Metric label="Ticket médio (venda)" valor={brl(k.ticket_medio)} />
          <Metric label="Custo médio (por peça vendida)" valor={brl(k.custo_medio)} />
          <Metric label="CMV — custo das vendidas" valor={brl(k.cmv)} />
          <Metric label="Investido total (todas as peças)" valor={brl(k.investido_total)} />
        </Card>
      </Aparece>

      <Aparece delay={120}>
        <Card style={{ gap: 2 }}>
          <Secao>Estoque (a vender)</Secao>
          <Metric label="Peças disponíveis" valor={`${k.disponiveis}`} />
          <Metric label="Valor de venda parado" valor={brl(k.estoque_valor)} />
          <Metric label="Custo do estoque" valor={brl(k.estoque_custo)} />
          <Metric label="Lucro potencial (se vender tudo)" valor={brl(k.estoque_lucro_potencial)} destaque />
        </Card>
      </Aparece>

      {dash.por_categoria.length > 0 && (
        <Aparece delay={160}>
          <Card style={{ gap: 6 }}>
            <Secao>Por categoria</Secao>
            <TabelaHead />
            {dash.por_categoria.slice(0, 12).map((c) => (
              <TabelaLinha key={c.item} nome={c.item} vendidas={c.vendidas} total={c.total}
                faturamento={c.faturamento} lucro={c.lucro} />
            ))}
          </Card>
        </Aparece>
      )}

      {dash.por_drop.length > 0 && (
        <Aparece delay={200}>
          <Card style={{ gap: 6 }}>
            <Secao>Por drop ({dash.por_drop.length})</Secao>
            <TabelaHead col1="drop" />
            {dash.por_drop.slice(0, 12).map((d) => (
              <TabelaLinha key={d.drop}
                nome={d.numero != null ? `Drop ${d.numero}` : rotuloDrop(d.drop)}
                sub={d.numero != null ? rotuloDrop(d.drop) : undefined}
                vendidas={d.vendidas} total={d.total} faturamento={d.faturamento} lucro={d.lucro}
                onPress={d.numero != null ? () => irPraDrop(d.numero) : undefined} />
            ))}
          </Card>
        </Aparece>
      )}
      </ScrollView>
    </View>
  );
}

function Hero({ titulo, valor, cor, rodape }: { titulo: string; valor: string; cor: string; rodape?: string }) {
  return (
    <View style={[styles.hero, { borderLeftColor: cor }]}>
      <Text style={styles.heroTitulo}>{titulo}</Text>
      <Text style={styles.heroValor} numberOfLines={1} adjustsFontSizeToFit>{valor}</Text>
      {rodape ? <Text style={styles.heroRodape}>{rodape}</Text> : null}
    </View>
  );
}

const Secao = ({ children }: { children: React.ReactNode }) => <Text style={styles.secao}>{children}</Text>;

function Metric({ label, valor, destaque }: { label: string; valor: string; destaque?: boolean }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValor, destaque && { color: colors.ok }]}>{valor}</Text>
    </View>
  );
}

function TabelaHead({ col1 = 'item' }: { col1?: string }) {
  return (
    <View style={styles.tabLinha}>
      <Text style={[styles.tabNome, styles.tabHead]}>{col1}</Text>
      <Text style={[styles.tabCol, styles.tabHead]}>vend.</Text>
      <Text style={[styles.tabCol, styles.tabHead, { flex: 1.3 }]}>fatur.</Text>
      <Text style={[styles.tabCol, styles.tabHead, { flex: 1.3 }]}>lucro</Text>
    </View>
  );
}

function TabelaLinha({ nome, sub, vendidas, total, faturamento, lucro, onPress }:
  { nome: string; sub?: string; vendidas: number; total: number; faturamento: number; lucro: number; onPress?: () => void }) {
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

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg },
  vazioTela: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 32 },
  vazioTxt: { color: colors.textoFraco, textAlign: 'center', lineHeight: 20 },
  heroGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hero: { flexBasis: '48%', flexGrow: 1, backgroundColor: colors.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 4 },
  heroTitulo: { color: colors.textoFraco, fontSize: 11, textTransform: 'uppercase', fontWeight: '700' },
  heroValor: { color: colors.texto, fontSize: 22, fontWeight: '800', marginTop: 4 },
  heroRodape: { color: colors.textoFraco, fontSize: 11, marginTop: 2 },
  secao: { color: colors.textoFraco, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6 },
  metric: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  metricLabel: { color: colors.textoFraco, fontSize: 13, flex: 1 },
  metricValor: { color: colors.texto, fontSize: 15, fontWeight: '700' },
  tabLinha: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  tabHead: { color: colors.textoFraco, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  tabNome: { color: colors.texto, fontSize: 13, flex: 2 },
  tabNomeTxt: { color: colors.texto, fontSize: 13, fontWeight: '600' },
  tabSub: { color: colors.textoFraco, fontSize: 10, marginTop: 1 },
  tabCol: { color: colors.texto, fontSize: 13, flex: 1, textAlign: 'right' },
  tabLucro: { color: colors.ok, fontWeight: '600' },
});
