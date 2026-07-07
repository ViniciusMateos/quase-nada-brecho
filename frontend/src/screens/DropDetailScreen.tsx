import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api, DropDetalhe, Peca } from '@/lib/api';
import { baseUrl } from '@/lib/apiClient';
import { colors, statusDrop } from '@/theme';
import { Aparece, Botao, Pressavel } from '@/ui/components';
import { BottomSheet } from '@/ui/BottomSheet';
import { EditorPeca } from '@/ui/EditorPeca';
import { MenuContexto } from '@/ui/MenuContexto';
import { CampoData } from '@/ui/CampoData';
import { LoadingDog, TelaCarregando } from '@/ui/LoadingDog';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type R = RouteProp<RootStackParamList, 'DropDetail'>;

function brl(n: number) {
  const [int, dec] = Math.abs(n).toFixed(2).split('.');
  return `R$ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
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
const STATUS_ORDEM = ['rascunho', 'agendado', 'publicado'];

export function DropDetailScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation();
  const { params } = useRoute<R>();
  const [drop, setDrop] = useState<DropDetalhe | null>(null);
  const [todas, setTodas] = useState<Peca[]>([]);
  const [base, setBase] = useState('');
  const [nome, setNome] = useState('');
  const [data, setData] = useState('');
  const [status, setStatus] = useState('rascunho');
  const [salvando, setSalvando] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [adicionando, setAdicionando] = useState(false);
  const [removendo, setRemovendo] = useState<number | null>(null);
  const [editarPeca, setEditarPeca] = useState<Peca | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; peca: Peca } | null>(null);

  useEffect(() => { baseUrl().then(setBase); }, []);

  const carregar = useCallback(() => {
    return Promise.all([
      api.getDrop(params.dropId).then((d) => {
        setDrop(d); setNome(d.nome); setData(d.data ?? ''); setStatus(d.status);
      }).catch(() => setDrop(null)),
      api.listPecas().then((r) => setTodas(r.pecas)).catch(() => setTodas([])),
    ]);
  }, [params.dropId]);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  const img = (u: string | null) => (u ? { uri: /^https?:/.test(u) ? u : `${base}${u}` } : undefined);

  async function salvar() {
    setSalvando(true);
    try {
      const d = await api.editDrop(params.dropId, { nome: nome.trim() || 'Drop', data: data.trim() || null, status });
      setDrop(d);
      // o header é "Drop N" (param da rota) — não sobrescrever com o nome cru ("rascunho")
    } catch {
      Alert.alert('Ops', 'Não consegui salvar o drop.');
    } finally {
      setSalvando(false);
    }
  }

  function excluir() {
    Alert.alert('Excluir drop', 'As peças voltam pra "sem drop". Confirma?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir', style: 'destructive',
        onPress: async () => { try { await api.delDrop(params.dropId); nav.goBack(); } catch {} },
      },
    ]);
  }

  function removerPeca(peca: Peca) {
    Alert.alert('Tirar do drop', `Remover "${peca.nome || peca.item || `Peça ${peca.id}`}" deste drop? Ela volta pra "sem drop".`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Tirar', style: 'destructive',
        onPress: async () => {
          setRemovendo(peca.id);
          try { await api.editPeca(peca.id, { drop_id: null }); await carregar(); } catch {}
          finally { setRemovendo(null); }
        },
      },
    ]);
  }

  async function confirmarAdd() {
    setAdicionando(true);
    try {
      await Promise.all([...sel].map((id) => api.editPeca(id, { drop_id: params.dropId })));
      setSel(new Set()); setAddOpen(false); await carregar();
    } catch { Alert.alert('Ops', 'Não consegui adicionar as peças.'); }
    finally { setAdicionando(false); }
  }

  if (!drop) return <TelaCarregando />;

  // só peças do catálogo manual podem entrar num drop — as do scraper já têm o drop delas
  const foraDoDrop = todas.filter((p) => p.drop_id !== params.dropId && p.origem === 'manual');
  const totalVenda = drop.pecas.reduce((s, p) => s + p.venda, 0);

  return (
    <View style={styles.tela}>
      <FlatList
        data={drop.pecas}
        keyExtractor={(p) => String(p.id)}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: insets.bottom + 28 }}
        ListHeaderComponent={
          <Aparece>
            <View style={styles.card}>
              <CampoData label="Data" valor={data} onChange={setData} />
              <Text style={styles.label}>Status</Text>
              <View style={styles.statusRow}>
                {STATUS_ORDEM.map((s) => (
                  <TouchableOpacity key={s} onPress={() => setStatus(s)}
                    style={[styles.stChip, status === s && { backgroundColor: statusDrop[s].cor, borderColor: statusDrop[s].cor }]}>
                    <Text style={[styles.stTxt, status === s && { color: '#FFFFFF', fontWeight: '700' }]}>
                      {statusDrop[s].label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={{ height: 12 }} />
              <Botao title="Salvar drop" onPress={salvar} loading={salvando} />
              <TouchableOpacity style={styles.excluirInline} onPress={excluir}>
                <Ionicons name="trash-outline" size={15} color={colors.erro} />
                <Text style={styles.excluirTxt}>Excluir drop</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.resumo}>
              <Text style={styles.resumoTxt}>
                {drop.pecas.length} peça{drop.pecas.length === 1 ? '' : 's'} · {brl(totalVenda)} em vendas
              </Text>
              <TouchableOpacity onPress={() => setAddOpen(true)} style={styles.addPecas}>
                <Ionicons name="add" size={16} color="#FFFFFF" />
                <Text style={styles.addPecasTxt}>Peças</Text>
              </TouchableOpacity>
            </View>
          </Aparece>
        }
        ListEmptyComponent={<Text style={styles.vazio}>Nenhuma peça nesse drop ainda.</Text>}
        renderItem={({ item, index }) => (
          <Aparece delay={Math.min(index, 10) * 45}>
            <Pressavel style={StyleSheet.flatten([styles.linha, item.consignado && styles.linhaConsig])}
              onPress={() => setEditarPeca(item)}
              onLongPress={(x, y) => setMenu({ x, y, peca: item })}>
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
              {removendo === item.id ? (
                <LoadingDog size={22} color={colors.marca} />
              ) : (
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.venda}>{brl(item.venda)}</Text>
                  <Text style={[styles.tag, { color: item.vendida ? colors.ok : colors.textoFraco }]}>
                    {item.vendida ? 'vendida' : 'disponível'}
                  </Text>
                </View>
              )}
            </Pressavel>
          </Aparece>
        )}
      />

      {/* adicionar peças (sheet com grabber + arrastar pra fechar) */}
      <BottomSheet visible={addOpen} onClose={() => setAddOpen(false)}>
        <View style={styles.modalTopo}>
          <Text style={styles.modalTitulo}>Adicionar peças</Text>
          <TouchableOpacity onPress={() => setAddOpen(false)} hitSlop={10}>
            <Ionicons name="close" size={24} color={colors.textoFraco} />
          </TouchableOpacity>
        </View>
        <FlatList
          data={foraDoDrop}
          keyExtractor={(p) => String(p.id)}
          style={{ maxHeight: 420 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Text style={styles.vazio}>Nenhuma peça do catálogo disponível pra adicionar.</Text>}
          renderItem={({ item, index }) => {
            const on = sel.has(item.id);
            return (
              <Aparece delay={Math.min(index, 8) * 30}>
                <TouchableOpacity style={styles.pick} onPress={() => {
                  const n = new Set(sel); on ? n.delete(item.id) : n.add(item.id); setSel(n);
                }}>
                  {item.imagem_url ? (
                    <Image source={img(item.imagem_url)} style={styles.pickThumb} contentFit="cover" transition={150} />
                  ) : (
                    <View style={[styles.pickThumb, styles.thumbVazia]}>
                      <Ionicons name="shirt-outline" size={16} color={colors.textoFraco} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.nome} numberOfLines={1}>{item.nome || item.item || `Peça ${item.id}`}</Text>
                    <Text style={styles.sub}>{item.drop_nome ? `em ${item.drop_nome}` : 'sem drop'} · {brl(item.venda)}</Text>
                  </View>
                  <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={22}
                    color={on ? colors.marca : colors.textoFraco} />
                </TouchableOpacity>
              </Aparece>
            );
          }}
        />
        <View style={{ height: 12 }} />
        <Botao title={sel.size ? `Adicionar ${sel.size}` : 'Selecione peças'} onPress={confirmarAdd} disabled={!sel.size} loading={adicionando} />
      </BottomSheet>

      <EditorPeca visible={!!editarPeca} peca={editarPeca} onClose={() => setEditarPeca(null)} onSaved={carregar} />

      <MenuContexto
        visible={!!menu} x={menu?.x ?? 0} y={menu?.y ?? 0} onClose={() => setMenu(null)}
        itens={menu ? [
          { label: 'Editar', icon: 'create-outline', onPress: () => { const p = menu.peca; setMenu(null); setTimeout(() => setEditarPeca(p), 180); } },
          { label: 'Remover do drop', icon: 'remove-circle-outline', cor: colors.erro, onPress: () => { const p = menu.peca; setMenu(null); removerPeca(p); } },
        ] : []}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
  label: { color: colors.textoFraco, fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 10, textTransform: 'uppercase' },
  input: { backgroundColor: colors.card2, color: colors.texto, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border },
  statusRow: { flexDirection: 'row', gap: 8 },
  stChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  stTxt: { color: colors.texto, fontSize: 13 },
  resumo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  resumoTxt: { color: colors.textoFraco, fontSize: 13 },
  addPecas: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.marca, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  addPecasTxt: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: colors.border },
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
  vazio: { color: colors.textoFraco, textAlign: 'center', marginTop: 24, lineHeight: 20 },
  excluirInline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, marginTop: 4 },
  excluirTxt: { color: colors.erro, fontSize: 14, fontWeight: '600' },
  modalFundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modal: { backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, borderTopWidth: 1, borderColor: colors.border },
  modalTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  modalTitulo: { color: colors.texto, fontSize: 18, fontWeight: '800' },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  pickThumb: { width: 40, height: 50, borderRadius: 8, backgroundColor: colors.card2 },
});
