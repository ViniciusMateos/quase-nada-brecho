import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { api, DropResumo } from '@/lib/api';
import { type Cores, statusDrop } from '@/theme';
import { useTheme } from '@/theme-context';
import { useI18n, t as tr } from '@/i18n';
import { Aparece, Card, Pill, Pressavel } from '@/ui/components';
import { MenuContexto } from '@/ui/MenuContexto';
import { LoadingDog, TelaCarregando } from '@/ui/LoadingDog';
import { useDogRefresh } from '@/ui/DogRefresh';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

// data sempre DD/MM/AAAA
export function fmtData(iso: string | null) {
  const m = (iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : tr('drops.noDate');
}
function brl(n: number) {
  const [int, dec] = Math.abs(n).toFixed(2).split('.');
  return `${n < 0 ? '-' : ''}R$ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
}

export function DropsScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const [drops, setDrops] = useState<DropResumo[] | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; drop: DropResumo } | null>(null);
  const [criando, setCriando] = useState(false);
  const [apagando, setApagando] = useState<number | null>(null);

  const carregar = useCallback(() => {
    return api.listDropsTodos().then((r) => setDrops(r.drops)).catch(() => setDrops([]));
  }, []);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));
  const { scrollProps, dog, spacerEl } = useDogRefresh(carregar);

  async function novoManual() {
    if (criando) return;
    setCriando(true);
    try {
      const d = await api.addDrop({ nome: 'rascunho' });
      const r = await api.listDropsTodos();
      setDrops(r.drops);
      const novo = r.drops.find((x) => x.tipo === 'manual' && x.id === d.id);
      nav.navigate('DropDetail', { dropId: d.id, nome: novo ? `Drop ${novo.numero}` : t('drops.newDrop') });
    } catch {} finally { setCriando(false); }
  }

  function abrir(d: DropResumo) {
    if (d.tipo === 'manual' && d.id != null) nav.navigate('DropDetail', { dropId: d.id, nome: `Drop ${d.numero}` });
    else nav.navigate('HistoricoDrop', { data: d.data, titulo: `Drop ${d.numero}` });
  }

  function excluir(d: DropResumo) {
    setMenu(null);
    if (d.id == null) return;
    Alert.alert(t('drops.deleteTitle', { n: d.numero }), t('drops.deleteMsg'), [
      { text: t('drops.cancel'), style: 'cancel' },
      {
        text: t('drops.delete'), style: 'destructive',
        onPress: async () => {
          setApagando(d.id!);
          try { await api.delDrop(d.id!); await carregar(); } catch {}
          finally { setApagando(null); }
        },
      },
    ]);
  }

  if (!drops) return <TelaCarregando />;

  return (
    <View style={styles.tela}>
      {dog}
      <FlatList
        data={drops}
        keyExtractor={(d, i) => `${d.tipo}-${d.id ?? d.data ?? i}`}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 96 }}
        {...scrollProps}
        ListHeaderComponent={spacerEl}
        ListEmptyComponent={
          <Text style={styles.vazio}>{t('drops.empty')}</Text>
        }
        renderItem={({ item, index }) => (
          <Aparece delay={Math.min(index, 8) * 40}>
            <DropCard drop={item} apagando={apagando != null && apagando === item.id}
              onPress={() => abrir(item)}
              onLongPress={item.tipo === 'manual'
                ? (x, y) => setMenu({ x, y, drop: item })
                : undefined} />
          </Aparece>
        )}
      />

      <TouchableOpacity style={[styles.fab, { bottom: insets.bottom + 18 }]} onPress={novoManual}
        activeOpacity={0.9} disabled={criando}>
        {criando ? <LoadingDog size={26} color="#FFFFFF" /> : <Ionicons name="add" size={26} color="#FFFFFF" />}
      </TouchableOpacity>

      <MenuContexto
        visible={!!menu} x={menu?.x ?? 0} y={menu?.y ?? 0} onClose={() => setMenu(null)}
        itens={menu ? [
          { label: t('drops.edit'), icon: 'create-outline', onPress: () => { const m = menu; setMenu(null); nav.navigate('DropDetail', { dropId: m.drop.id!, nome: `Drop ${m.drop.numero}` }); } },
          { label: t('drops.delete'), icon: 'trash-outline', cor: colors.erro, onPress: () => excluir(menu.drop) },
        ] : []}
      />
    </View>
  );
}

function DropCard({ drop, onPress, onLongPress, apagando }:
  { drop: DropResumo; onPress: () => void; onLongPress?: (x: number, y: number) => void; apagando?: boolean }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const rascunho = drop.status === 'rascunho';
  const mapStatus = statusDrop(colors);
  const st = mapStatus[drop.status] ?? mapStatus.rascunho;

  return (
    <Pressavel onPress={onPress} onLongPress={onLongPress}>
      <Card style={rascunho ? styles.cardRascunho : undefined}>
        <View style={styles.topo}>
          <View style={{ flex: 1 }}>
            <Text style={styles.nome} numberOfLines={1}>Drop {drop.numero}</Text>
            <View style={styles.subRow}>
              <Ionicons name={drop.tipo === 'historico' ? 'logo-instagram' : 'calendar-outline'}
                size={13} color={colors.textoFraco} />
              <Text style={styles.sub}>
                {drop.tipo === 'historico' ? t('drops.postedOn', { d: fmtData(drop.data) }) : fmtData(drop.data)}
              </Text>
            </View>
          </View>
          {drop.sold_out && drop.status === 'publicado' ? (
            <View style={styles.esgotado}>
              <Ionicons name="checkmark-circle" size={22} color={colors.marca} />
              <Text style={styles.esgotadoTxt}>{t('drops.soldOut')}</Text>
            </View>
          ) : (
            <Pill texto={st.label} cor={st.cor} />
          )}
        </View>

        <View style={styles.saldo}>
          <Linha label={t('drops.pieces')} valor={t('drops.soldCount', { sold: drop.vendidas, total: drop.qtd_pecas })} />
          <Linha label={t('drops.revenue')} valor={brl(drop.faturamento)} cor={colors.ok} />
          {drop.disponiveis > 0 && (
            <Linha label={t('drops.projection')} valor={brl(drop.projecao)} cor={colors.marca} />
          )}
          <Linha label={t('drops.spent')} valor={brl(drop.gasto)} cor={colors.textoFraco} />
          <Linha label={t('drops.profit')} valor={brl(drop.lucro)} cor={colors.marca} forte />
        </View>
        {apagando && (
          <View style={styles.apagandoOverlay}>
            <LoadingDog size={30} color={colors.marca} />
          </View>
        )}
      </Card>
    </Pressavel>
  );
}

function Linha({ label, valor, cor, forte }: { label: string; valor: string; cor?: string; forte?: boolean }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.linha}>
      <Text style={styles.linhaLabel}>{label}</Text>
      <Text style={[styles.linhaValor, cor && { color: cor }, forte && { fontWeight: '800' }]}>{valor}</Text>
    </View>
  );
}

const makeStyles = (colors: Cores) => StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.marca, borderRadius: 14, padding: 16, marginBottom: 4 },
  ctaTxt: { flex: 1, color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  vazio: { color: colors.textoFraco, textAlign: 'center', marginTop: 24, lineHeight: 20 },
  cardRascunho: { borderColor: colors.alerta, borderWidth: 1.5, backgroundColor: '#1E1B12' },
  apagandoOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,15,15,0.72)', borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  topo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  nome: { color: colors.texto, fontSize: 18, fontWeight: '800' },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  sub: { color: colors.textoFraco, fontSize: 12 },
  esgotado: { alignItems: 'center' },
  esgotadoTxt: { color: colors.marca, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', marginTop: 1 },
  saldo: { marginTop: 12, gap: 4 },
  linha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  linhaLabel: { color: colors.textoFraco, fontSize: 13 },
  linhaValor: { color: colors.texto, fontSize: 14, fontWeight: '700' },
  fab: { position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.marca, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
});
