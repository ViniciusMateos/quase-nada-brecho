import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { api, DropResumo, Peca } from '@/lib/api';
import { baseUrl } from '@/lib/apiClient';
import { colors } from '@/theme';
import { Pressavel } from '@/ui/components';
import { EditorPeca } from '@/ui/EditorPeca';
import { MenuContexto } from '@/ui/MenuContexto';
import { LoadingDog, TelaCarregando } from '@/ui/LoadingDog';
import { useDogRefresh } from '@/ui/DogRefresh';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type Filtro = 'todas' | 'disponiveis' | 'vendidas' | 'sem-drop';

function brl(n: number) {
  const [int, dec] = Math.abs(n).toFixed(2).split('.');
  return `R$ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
}
// quanto eu recebo de uma peça consignada (só a %)
function recebeConsig(venda: number, pct: number | null): number {
  return venda * ((pct || 0) / 100);
}

export function PecasScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const [pecas, setPecas] = useState<Peca[] | null>(null);
  const [drops, setDrops] = useState<DropResumo[]>([]);
  const [base, setBase] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [ordem, setOrdem] = useState<'recente' | 'antiga'>('recente');
  const [categoria, setCategoria] = useState<string | null>(null);
  const [dropAberto, setDropAberto] = useState(false);
  const [busca, setBusca] = useState('');
  // editor compartilhado (@/ui/EditorPeca): null = fechado; { peca:null } = nova; { peca } = editar
  const [editar, setEditar] = useState<{ peca: Peca | null } | null>(null);

  // Drop a que a peça pertence: manual (pelo drop_id) ou histórico do scraper (pela data do post).
  function dropDaPeca(drop_id: number | null, postado_em: string | null): DropResumo | undefined {
    if (drop_id != null) return drops.find((d) => d.tipo === 'manual' && d.id === drop_id);
    if (postado_em) return drops.find((d) => d.tipo === 'historico' && d.data === postado_em);
    return undefined;
  }
  // "Drop N" (numeração cronológica do resumo) — ou null se a peça não está em drop nenhum.
  function rotuloDrop(drop_id: number | null, postado_em: string | null): string | null {
    const d = dropDaPeca(drop_id, postado_em);
    return d ? `Drop ${d.numero}` : null;
  }
  // Entra no drop da peça (usado pelo menu de segurar). Fecha o menu antes.
  function irPraDrop(drop_id: number | null, postado_em: string | null) {
    const d = dropDaPeca(drop_id, postado_em);
    if (!d) return;
    setMenu(null);
    if (d.tipo === 'manual' && d.id != null) nav.navigate('DropDetail', { dropId: d.id, nome: `Drop ${d.numero}` });
    else nav.navigate('HistoricoDrop', { data: d.data, titulo: `Drop ${d.numero}` });
  }
  const [menu, setMenu] = useState<{ x: number; y: number; peca: Peca } | null>(null);
  const [apagandoPeca, setApagandoPeca] = useState<number | null>(null);
  const [recarregando, setRecarregando] = useState(false);

  useEffect(() => { baseUrl().then(setBase); }, []);

  function excluirPeca(peca: Peca) {
    setMenu(null);
    Alert.alert('Excluir peça', `Some com "${peca.nome || peca.item || `Peça ${peca.id}`}" de vez. Confirma?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir', style: 'destructive',
        onPress: async () => {
          setApagandoPeca(peca.id);
          try { await api.delPeca(peca.id); await carregar(); } catch {}
          finally { setApagandoPeca(null); }
        },
      },
    ]);
  }

  // Escolhe várias fotos e manda pro carrossel de nomear (estilo Insta).
  async function importarVarias() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Ops', 'Preciso da permissão pra acessar as fotos.'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.6, selectionLimit: 0,
    });
    if (res.canceled || !res.assets.length) return;
    nav.navigate('CarrosselPecas', { fotos: res.assets.map((a) => a.uri) });
  }

  const carregar = useCallback(() => {
    // só mostra o "Atualizando…" se o refetch demorar (evita piscar em navegação normal;
    // aparece quando você acabou de subir várias peças e a lista está sincronizando)
    let t: ReturnType<typeof setTimeout> | null = setTimeout(() => setRecarregando(true), 450);
    return Promise.all([
      api.listPecas().then((r) => setPecas(r.pecas)).catch(() => setPecas([])),
      api.listDropsTodos().then((r) => setDrops(r.drops)).catch(() => setDrops([])),
    ]).finally(() => { if (t) { clearTimeout(t); t = null; } setRecarregando(false); });
  }, []);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));
  const { scrollProps, dog, spacerEl } = useDogRefresh(carregar, 112);

  // URL absoluta (Insta) passa direto; caminho relativo (/uploads) recebe o host
  const img = (u: string | null) => (u ? { uri: /^https?:/.test(u) ? u : `${base}${u}` } : undefined);

  const categorias = useMemo(
    () => Array.from(new Set((pecas ?? []).map((p) => (p.item ?? '').trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b)),
    [pecas],
  );

  const filtradas = useMemo(() => {
    const b = busca.trim().toLowerCase();
    const arr = (pecas ?? []).filter((p) => {
      if (filtro === 'vendidas' && !p.vendida) return false;
      if (filtro === 'disponiveis' && p.vendida) return false;
      if (filtro === 'sem-drop' && p.drop_id != null) return false;
      if (categoria && (p.item ?? '').trim() !== categoria) return false;
      if (b && !`${p.nome ?? ''} ${p.item ?? ''}`.toLowerCase().includes(b)) return false;
      return true;
    });
    // ordena por recência (data do post; peça manual sem data = mais recente), desempata por id.
    // Ascendente (antiga→recente) e inverte quando o padrão é recente. Mesma regra p/ TODOS os filtros.
    arr.sort((a, x) => {
      const ka = a.postado_em ?? '9999-99-99';
      const kx = x.postado_em ?? '9999-99-99';
      if (ka !== kx) return ka < kx ? -1 : 1;
      return a.id - x.id;
    });
    if (ordem === 'recente') arr.reverse();
    return arr;
  }, [pecas, filtro, busca, ordem, categoria]);

  if (!pecas) return <TelaCarregando />;

  return (
    <View style={styles.tela}>
      {dog}
      <View style={styles.topo}>
        <View style={styles.buscaBox}>
          <Ionicons name="search" size={16} color={colors.textoFraco} />
          <TextInput value={busca} onChangeText={setBusca} placeholder="Buscar peça…"
            placeholderTextColor={colors.textoFraco} style={styles.buscaInput} />
        </View>
        <TouchableOpacity style={styles.bulkBtn} onPress={importarVarias}>
          <Ionicons name="images-outline" size={20} color={colors.marca} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.addBtn} onPress={() => setEditar({ peca: null })}>
          <Ionicons name="add" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
      <View style={styles.chips}>
        {(['todas', 'disponiveis', 'vendidas', 'sem-drop'] as Filtro[]).map((f) => (
          <TouchableOpacity key={f} onPress={() => setFiltro(f)}
            style={[styles.chip, filtro === f && styles.chipOn]}>
            <Text style={[styles.chipTxt, filtro === f && styles.chipTxtOn]}>
              {f === 'todas' ? `Todas (${pecas.length})` : f === 'disponiveis' ? 'Disponíveis'
                : f === 'vendidas' ? 'Vendidas' : 'Sem drop'}
            </Text>
          </TouchableOpacity>
        ))}
        {categorias.length > 0 && (
          <TouchableOpacity onPress={() => setDropAberto(true)} style={[styles.chip, styles.chipDrop, !!categoria && styles.chipOn]}>
            <Ionicons name="pricetag-outline" size={12} color={categoria ? '#FFFFFF' : colors.marca} />
            <Text style={[styles.chipTxt, !!categoria && styles.chipTxtOn]} numberOfLines={1}>{categoria || 'Categoria'}</Text>
            <Ionicons name="chevron-down" size={12} color={categoria ? '#FFFFFF' : colors.textoFraco} />
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => setOrdem((o) => (o === 'recente' ? 'antiga' : 'recente'))}
          style={[styles.chip, styles.chipOrdem]}>
          <Ionicons name="swap-vertical" size={13} color={colors.marca} />
          <Text style={styles.chipTxt}>{ordem === 'recente' ? 'Recentes' : 'Antigas'}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filtradas}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 6, paddingBottom: insets.bottom + 24, gap: 8 }}
        showsVerticalScrollIndicator={false}
        {...scrollProps}
        ListHeaderComponent={spacerEl}
        ListEmptyComponent={<Text style={styles.vazio}>Nada por aqui.</Text>}
        renderItem={({ item }) => (
            <Pressavel style={styles.linha} onPress={() => setEditar({ peca: item })}
              onLongPress={(x, y) => setMenu({ x, y, peca: item })}>
              {item.imagem_url ? (
                <Image source={img(item.imagem_url)} style={styles.thumb} contentFit="cover" transition={150} />
              ) : (
                <View style={[styles.thumb, styles.thumbVazia]}>
                  <Ionicons name="shirt-outline" size={20} color={colors.textoFraco} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <View style={styles.nomeRow}>
                  <Text style={styles.nome} numberOfLines={1}>{item.nome || item.item || `Peça ${item.id}`}</Text>
                  {item.so_manual && <Ionicons name="lock-closed" size={11} color={colors.textoFraco} />}
                  {item.consignado && (
                    <View style={styles.consigTag}>
                      <Ionicons name="people" size={9} color="#FFFFFF" />
                      <Text style={styles.consigTagTxt}>consig</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.sub} numberOfLines={1}>
                  {[item.item, item.tamanho && `tam ${item.tamanho}`, rotuloDrop(item.drop_id, item.postado_em)].filter(Boolean).join(' · ') || '—'}
                </Text>
              </View>
              <View style={styles.valores}>
                <Text style={styles.venda}>{brl(item.venda)}</Text>
                {item.consignado ? (
                  <Text style={styles.recebe}>recebe {brl(recebeConsig(item.venda, item.consig_pct))} ({item.consig_pct || 0}%)</Text>
                ) : (
                  <Text style={styles.compra}>compra {brl(item.compra)}</Text>
                )}
              </View>
              {/* verde=vendida · laranja=postada(Insta) disponível · laranja escuro=em drop futuro · cinza=avulsa */}
              <View style={[styles.dot, {
                backgroundColor: item.vendida
                  ? colors.ok
                  : item.origem === 'scraper'
                    ? colors.marca
                    : item.drop_id != null
                      ? colors.laranjaEscuro
                      : colors.textoFraco,
              }]} />
              {apagandoPeca === item.id && (
                <View style={styles.linhaApagando}><LoadingDog size={22} color={colors.marca} /></View>
              )}
            </Pressavel>
        )}
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
      />

      {/* editor de peça — componente compartilhado (mesmo da tela de Drops) */}
      <EditorPeca visible={!!editar} peca={editar?.peca ?? null}
        onClose={() => setEditar(null)} onSaved={carregar} />

      <MenuContexto
        visible={!!menu} x={menu?.x ?? 0} y={menu?.y ?? 0} onClose={() => setMenu(null)}
        itens={menu ? [
          ...(dropDaPeca(menu.peca.drop_id, menu.peca.postado_em)
            ? [{ label: 'Ver no drop', icon: 'albums-outline' as const, onPress: () => irPraDrop(menu.peca.drop_id, menu.peca.postado_em) }]
            : []),
          { label: 'Editar', icon: 'create-outline', onPress: () => { const p = menu.peca; setMenu(null); setEditar({ peca: p }); } },
          { label: 'Excluir', icon: 'trash-outline', cor: colors.erro, onPress: () => excluirPeca(menu.peca) },
        ] : []}
      />

      {recarregando && (
        <View style={styles.recarregandoOverlay} pointerEvents="none">
          <View style={styles.recarregandoCard}>
            <LoadingDog size={44} />
            <Text style={styles.recarregandoTxt}>Atualizando…</Text>
          </View>
        </View>
      )}

      <Modal visible={dropAberto} transparent animationType="fade" onRequestClose={() => setDropAberto(false)}>
        <Pressable style={styles.dropFundo} onPress={() => setDropAberto(false)}>
          <Pressable style={styles.dropLista} onPress={() => {}}>
            <Text style={styles.dropTitulo}>Filtrar por categoria</Text>
            <ScrollView>
              <TouchableOpacity style={styles.dropItem} onPress={() => { setCategoria(null); setDropAberto(false); }}>
                <Text style={[styles.dropItemTxt, !categoria && styles.dropItemTxtOn]}>Todas as categorias</Text>
                {!categoria && <Ionicons name="checkmark" size={18} color={colors.marca} />}
              </TouchableOpacity>
              {categorias.map((cat) => (
                <TouchableOpacity key={cat} style={styles.dropItem} onPress={() => { setCategoria(cat); setDropAberto(false); }}>
                  <Text style={[styles.dropItemTxt, categoria === cat && styles.dropItemTxtOn]} numberOfLines={1}>{cat}</Text>
                  {categoria === cat && <Ionicons name="checkmark" size={18} color={colors.marca} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg },
  topo: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingTop: 12 },
  buscaBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card2, borderRadius: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border },
  buscaInput: { flex: 1, color: colors.texto, paddingVertical: 10 },
  bulkBtn: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.marca, backgroundColor: colors.card },
  addBtn: { backgroundColor: colors.marca, width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8, flexWrap: 'wrap' },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { backgroundColor: colors.marca, borderColor: colors.marca },
  chipTxt: { color: colors.texto, fontSize: 12 },
  chipTxtOn: { color: '#FFFFFF', fontWeight: '700' },
  chipOrdem: { flexDirection: 'row', alignItems: 'center', gap: 4, borderColor: colors.marca, marginLeft: 'auto' },
  chipDrop: { flexDirection: 'row', alignItems: 'center', gap: 4, borderColor: colors.marca, maxWidth: 150 },
  dropFundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  dropLista: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, width: '100%', maxHeight: '70%', paddingVertical: 8 },
  dropTitulo: { color: colors.textoFraco, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', paddingHorizontal: 16, paddingVertical: 8 },
  dropItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 13 },
  dropItemTxt: { color: colors.texto, fontSize: 15, flex: 1 },
  dropItemTxtOn: { color: colors.marca, fontWeight: '700' },
  templateBox: { backgroundColor: colors.card2, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 8 },
  templateTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  copiarBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: colors.marca },
  copiarTxt: { color: colors.marca, fontSize: 12, fontWeight: '700' },
  templateTxt: { color: colors.texto, fontSize: 13, lineHeight: 20, fontFamily: 'monospace' },
  inputMultiline: { minHeight: 72, paddingTop: 12 },
  condRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  condSufixo: { color: colors.textoFraco, fontSize: 16, fontWeight: '700' },
  tipoChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  tipoChipOn: { backgroundColor: colors.marca, borderColor: colors.marca },
  tipoChipTxt: { color: colors.texto, fontSize: 12 },
  tipoChipTxtOn: { color: '#FFFFFF', fontWeight: '700' },
  medidaRow: { gap: 8, backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 10 },
  medidaValorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  medidaInput: { flex: 1, backgroundColor: colors.card2, color: colors.texto, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.border },
  cmTxt: { color: colors.textoFraco, fontSize: 13 },
  addMedida: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.marca, borderStyle: 'dashed' },
  addMedidaTxt: { color: colors.marca, fontSize: 13, fontWeight: '700' },
  recarregandoOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15,15,15,0.55)' },
  recarregandoCard: { backgroundColor: colors.card, borderRadius: 16, paddingHorizontal: 28, paddingVertical: 22, alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.border },
  recarregandoTxt: { color: colors.texto, fontSize: 14, fontWeight: '600' },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: colors.border },
  linhaApagando: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,15,15,0.72)', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 44, height: 55, borderRadius: 8, backgroundColor: colors.card2 },
  thumbVazia: { alignItems: 'center', justifyContent: 'center' },
  nomeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nome: { color: colors.texto, fontSize: 15, fontWeight: '600', flexShrink: 1 },
  consigTag: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.marca, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  consigTagTxt: { color: '#FFFFFF', fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  sub: { color: colors.textoFraco, fontSize: 12, marginTop: 2 },
  valores: { alignItems: 'flex-end', maxWidth: 130 },
  venda: { color: colors.texto, fontSize: 14, fontWeight: '700' },
  compra: { color: colors.textoFraco, fontSize: 11, marginTop: 2 },
  recebe: { color: colors.marca, fontSize: 11, marginTop: 2, fontWeight: '600', textAlign: 'right' },
  consigRow: { gap: 6 },
  consigInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  consigPreview: { color: colors.marca, fontSize: 13, fontWeight: '600' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  vazio: { color: colors.textoFraco, textAlign: 'center', marginTop: 24 },
  modalFundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modal: { backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, maxHeight: '92%', borderTopWidth: 1, borderColor: colors.border },
  modalTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  modalTitulo: { color: colors.texto, fontSize: 18, fontWeight: '800' },
  fotoBox: { alignSelf: 'center', width: 168, height: 210, borderRadius: 16, backgroundColor: colors.card2, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  fotoPreview: { width: '100%', height: '100%' },
  fotoVazia: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  fotoVaziaTxt: { color: colors.textoFraco, fontSize: 12 },
  fotoEditar: { position: 'absolute', bottom: 8, right: 8, backgroundColor: colors.marca, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  dupla: { flexDirection: 'row', gap: 12 },
  campoLabel: { color: colors.textoFraco, fontSize: 12, fontWeight: '600', marginBottom: 6 },
  input: { backgroundColor: colors.card2, color: colors.texto, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border },
  dropChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  dropChipOn: { backgroundColor: colors.marca, borderColor: colors.marca },
  dropChipTxt: { color: colors.texto, fontSize: 13 },
  dropChipTxtOn: { color: '#FFFFFF', fontWeight: '700' },
  verDrop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, backgroundColor: colors.card2, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.marca },
  verDropTxt: { color: colors.marca, fontSize: 14, fontWeight: '700', flex: 1 },
  notaScraper: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card2, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border },
  notaScraperTxt: { color: colors.textoFraco, fontSize: 12, flex: 1, lineHeight: 16 },
  linhaBool: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.card, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border },
  boolLabel: { color: colors.texto, fontSize: 15, fontWeight: '600' },
  boolSub: { color: colors.textoFraco, fontSize: 11, marginTop: 2, lineHeight: 15 },
});
