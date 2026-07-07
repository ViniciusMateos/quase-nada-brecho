import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useRoute, RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api, Peca } from '@/lib/api';
import { baseUrl } from '@/lib/apiClient';
import { colors } from '@/theme';
import { Aparece, Card, Pressavel } from '@/ui/components';
import { EditorPeca } from '@/ui/EditorPeca';
import { TelaCarregando } from '@/ui/LoadingDog';
import { fmtData } from '@/screens/DropsScreen';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type R = RouteProp<RootStackParamList, 'HistoricoDrop'>;

function brl(n: number) {
  const [int, dec] = Math.abs(n).toFixed(2).split('.');
  return `${n < 0 ? '-' : ''}R$ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
}
// consignado: quanto recebo (% da venda ou valor fixo) + a % equivalente
function recebeConsig(p: Peca): number {
  if (p.consig_tipo === 'valor') return Math.min(p.consig_valor || 0, p.venda);
  return p.venda * ((p.consig_pct || 0) / 100);
}
function pctStr(recebe: number, venda: number): string {
  if (venda <= 0) return '0%';
  const p = (recebe / venda) * 100;
  return `${Number.isInteger(p) ? p : p.toFixed(1)}%`;
}

export function HistoricoDropScreen() {
  const insets = useSafeAreaInsets();
  const { params } = useRoute<R>();
  const [pecas, setPecas] = useState<Peca[] | null>(null);
  const [base, setBase] = useState('');
  const [editarPeca, setEditarPeca] = useState<Peca | null>(null);

  useEffect(() => { baseUrl().then(setBase); }, []);
  const carregar = useCallback(() => {
    api.getHistorico(params.data ?? '').then((r) => setPecas(r.pecas)).catch(() => setPecas([]));
  }, [params.data]);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  if (!pecas) return <TelaCarregando />;

  const vend = pecas.filter((p) => p.vendida);
  const faturamento = vend.reduce((s, p) => s + p.venda, 0);
  const projecao = pecas.reduce((s, p) => s + p.venda, 0);   // faturamento se tudo vender
  const cmv = vend.reduce((s, p) => s + p.compra, 0);
  const gasto = pecas.reduce((s, p) => s + p.compra, 0);
  const disponiveis = pecas.length - vend.length;
  const img = (u: string | null) => (u ? { uri: /^https?:/.test(u) ? u : `${base}${u}` } : undefined);

  return (
    <View style={styles.tela}>
      <FlatList
        data={pecas}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: insets.bottom + 24 }}
        ListHeaderComponent={
          <Card style={{ gap: 4, marginBottom: 6 }}>
            <Text style={styles.data}>postado {fmtData(params.data)}</Text>
            <Linha label="Peças" valor={`${vend.length}/${pecas.length} vendidas`} />
            <Linha label="Faturamento" valor={brl(faturamento)} cor={colors.ok} />
            {disponiveis > 0 && (
              <Linha label="Projeção (se vender tudo)" valor={brl(projecao)} cor={colors.marca} />
            )}
            <Linha label="Gasto do drop" valor={brl(gasto)} cor={colors.textoFraco} />
            <Linha label="Lucro líquido" valor={brl(faturamento - cmv)} cor={colors.marca} forte />
          </Card>
        }
        renderItem={({ item, index }) => (
          <Aparece delay={Math.min(index, 10) * 40}>
            <Pressavel style={StyleSheet.flatten([styles.linhaPeca, item.consignado && styles.linhaConsig])} onPress={() => setEditarPeca(item)}>
              {item.imagem_url ? (
                <Image source={img(item.imagem_url)} style={styles.thumb} contentFit="cover" transition={150} />
              ) : (
                <View style={[styles.thumb, styles.thumbVazia]}>
                  <Ionicons name="shirt-outline" size={18} color={colors.textoFraco} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <View style={styles.nomeRow}>
                  <Text style={styles.nome} numberOfLines={1}>{item.nome || item.item || `Peça ${item.id}`}</Text>
                  {item.consignado && (
                    <View style={styles.consigTag}>
                      <Ionicons name="people" size={9} color="#FFFFFF" />
                      <Text style={styles.consigTagTxt}>consig</Text>
                    </View>
                  )}
                </View>
                {item.consignado && (
                  <Text style={styles.recebe}>
                    recebe {brl(recebeConsig(item))} {item.consig_tipo === 'valor' ? `(fixo · ${pctStr(recebeConsig(item), item.venda)})` : `(${item.consig_pct || 0}%)`}
                  </Text>
                )}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.venda}>{brl(item.venda)}</Text>
                <Text style={[styles.tag, { color: item.vendida ? colors.ok : colors.textoFraco }]}>
                  {item.vendida ? 'vendida' : 'disponível'}
                </Text>
              </View>
            </Pressavel>
          </Aparece>
        )}
      />
      <EditorPeca visible={!!editarPeca} peca={editarPeca} onClose={() => setEditarPeca(null)} onSaved={carregar} />
    </View>
  );
}

function Linha({ label, valor, cor, forte }: { label: string; valor: string; cor?: string; forte?: boolean }) {
  return (
    <View style={styles.linha}>
      <Text style={styles.linhaLabel}>{label}</Text>
      <Text style={[styles.linhaValor, cor && { color: cor }, forte && { fontWeight: '800' }]}>{valor}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg },
  data: { color: colors.textoFraco, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  linha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  linhaLabel: { color: colors.textoFraco, fontSize: 13 },
  linhaValor: { color: colors.texto, fontSize: 14, fontWeight: '700' },
  linhaPeca: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: colors.border },
  linhaConsig: { borderColor: colors.marca },
  thumb: { width: 44, height: 55, borderRadius: 8, backgroundColor: colors.card2 },
  thumbVazia: { alignItems: 'center', justifyContent: 'center' },
  nomeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nome: { color: colors.texto, fontSize: 15, fontWeight: '600', flexShrink: 1 },
  consigTag: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.marca, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 },
  consigTagTxt: { color: '#FFFFFF', fontSize: 9, fontWeight: '700' },
  recebe: { color: colors.marca, fontSize: 12, fontWeight: '600', marginTop: 2 },
  sub: { color: colors.textoFraco, fontSize: 12, marginTop: 2 },
  venda: { color: colors.texto, fontSize: 14, fontWeight: '700' },
  tag: { fontSize: 11, marginTop: 2, fontWeight: '600' },
});
