import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, FlatList, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { api, Drop, Peca, PecaCampos } from '@/lib/api';
import { baseUrl } from '@/lib/apiClient';
import { fotoParaUpload } from '@/lib/foto';
import { colors } from '@/theme';
import { Aparece, Botao, Pressavel } from '@/ui/components';
import { BottomSheet } from '@/ui/BottomSheet';
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
const num = (t: string) => {
  const n = parseFloat((t || '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
};

type Form = {
  id: number | null; nome: string; item: string; tamanho: string; condicao: string;
  compra: string; venda: string; vendida: boolean; drop_id: number | null;
  imagem_url: string | null; fotoLocal: string | null; origem: string;
};
const FORM_VAZIO: Form = {
  id: null, nome: '', item: '', tamanho: '', condicao: '', compra: '', venda: '',
  vendida: false, drop_id: null, imagem_url: null, fotoLocal: null, origem: 'manual',
};

function paraForm(p: Peca): Form {
  return {
    id: p.id, nome: p.nome ?? '', item: p.item ?? '', tamanho: p.tamanho ?? '',
    condicao: p.condicao ?? '', compra: String(p.compra ?? ''), venda: String(p.venda ?? ''),
    vendida: p.vendida, drop_id: p.drop_id, imagem_url: p.imagem_url, fotoLocal: null,
    origem: p.origem ?? 'manual',
  };
}

export function PecasScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const [pecas, setPecas] = useState<Peca[] | null>(null);
  const [drops, setDrops] = useState<Drop[]>([]);
  const [base, setBase] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState<Form | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; peca: Peca } | null>(null);
  const [apagandoPeca, setApagandoPeca] = useState<number | null>(null);

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
    return Promise.all([
      api.listPecas().then((r) => setPecas(r.pecas)).catch(() => setPecas([])),
      api.listDrops().then((r) => setDrops(r.drops)).catch(() => setDrops([])),
    ]);
  }, []);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));
  const { scrollProps, dog, spacerEl } = useDogRefresh(carregar, 112);

  // URL absoluta (Insta) passa direto; caminho relativo (/uploads) recebe o host
  const img = (u: string | null) => (u ? { uri: /^https?:/.test(u) ? u : `${base}${u}` } : undefined);

  const filtradas = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return (pecas ?? []).filter((p) => {
      if (filtro === 'vendidas' && !p.vendida) return false;
      if (filtro === 'disponiveis' && p.vendida) return false;
      if (filtro === 'sem-drop' && p.drop_id != null) return false;
      if (b && !`${p.nome ?? ''} ${p.item ?? ''}`.toLowerCase().includes(b)) return false;
      return true;
    });
  }, [pecas, filtro, busca]);

  async function escolherFoto(daCamera: boolean) {
    if (!editando) return;
    const perm = daCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Ops', 'Preciso da permissão pra acessar as fotos.'); return; }
    const res = daCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: ['images'] });
    if (!res.canceled && res.assets[0]) {
      setEditando({ ...editando, fotoLocal: res.assets[0].uri });
    }
  }

  function pedirFoto() {
    Alert.alert('Foto da peça', undefined, [
      { text: 'Tirar foto', onPress: () => escolherFoto(true) },
      { text: 'Escolher da galeria', onPress: () => escolherFoto(false) },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  async function salvar() {
    if (!editando) return;
    const campos: PecaCampos = {
      nome: editando.nome.trim(), item: editando.item.trim(), tamanho: editando.tamanho.trim(),
      condicao: editando.condicao.trim(), compra: num(editando.compra), venda: num(editando.venda),
      vendida: editando.vendida, drop_id: editando.drop_id,
    };
    setSalvando(true);
    try {
      const peca = editando.id
        ? await api.editPeca(editando.id, campos)
        : await api.addPeca(campos);
      // foto nova (uri local) → redimensiona e sobe
      if (editando.fotoLocal && !/^https?:/.test(editando.fotoLocal)) {
        await api.uploadImagem(peca.id, await fotoParaUpload(editando.fotoLocal));
      }
      setEditando(null);
      carregar();
    } catch {
      Alert.alert('Ops', 'Não consegui salvar a peça.');
    } finally {
      setSalvando(false);
    }
  }

  function excluir() {
    if (!editando?.id) return;
    Alert.alert('Excluir peça', 'Some com a peça de vez. Confirma?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir', style: 'destructive',
        onPress: async () => {
          try { await api.delPeca(editando.id!); setEditando(null); carregar(); } catch {}
        },
      },
    ]);
  }

  if (!pecas) return <TelaCarregando />;

  const imgUrl = editando?.imagem_url;
  const previa = editando?.fotoLocal ?? (imgUrl ? (/^https?:/.test(imgUrl) ? imgUrl : `${base}${imgUrl}`) : null);

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
        <TouchableOpacity style={styles.addBtn} onPress={() => setEditando({ ...FORM_VAZIO })}>
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
      </View>

      <FlatList
        data={filtradas}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 6, paddingBottom: insets.bottom + 24, gap: 8 }}
        showsVerticalScrollIndicator={false}
        {...scrollProps}
        ListHeaderComponent={spacerEl}
        ListEmptyComponent={<Text style={styles.vazio}>Nada por aqui.</Text>}
        renderItem={({ item, index }) => (
          <Aparece delay={Math.min(index, 8) * 30}>
            <Pressavel style={styles.linha} onPress={() => setEditando(paraForm(item))}
              onLongPress={(x, y) => setMenu({ x, y, peca: item })}>
              {item.imagem_url ? (
                <Image source={img(item.imagem_url)} style={styles.thumb} contentFit="cover" transition={150} />
              ) : (
                <View style={[styles.thumb, styles.thumbVazia]}>
                  <Ionicons name="shirt-outline" size={20} color={colors.textoFraco} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.nome} numberOfLines={1}>{item.nome || item.item || `Peça ${item.id}`}</Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {[item.item, item.tamanho && `tam ${item.tamanho}`, item.drop_nome].filter(Boolean).join(' · ') || '—'}
                </Text>
              </View>
              <View style={styles.valores}>
                <Text style={styles.venda}>{brl(item.venda)}</Text>
                <Text style={styles.compra}>compra {brl(item.compra)}</Text>
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
                <View style={styles.linhaApagando}><LoadingDog size={22} color={colors.erro} /></View>
              )}
            </Pressavel>
          </Aparece>
        )}
      />

      {/* editor (sheet com grabber + arrastar pra fechar) */}
      <BottomSheet visible={!!editando} onClose={() => setEditando(null)}>
            <View style={styles.modalTopo}>
              <Text style={styles.modalTitulo}>{editando?.id ? 'Editar peça' : 'Nova peça'}</Text>
              <TouchableOpacity onPress={() => setEditando(null)} hitSlop={10}>
                <Ionicons name="close" size={24} color={colors.textoFraco} />
              </TouchableOpacity>
            </View>
            {editando && (
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 8 }}>
                <TouchableOpacity style={styles.fotoBox} onPress={pedirFoto} activeOpacity={0.85}>
                  {previa ? (
                    <Image source={previa} style={styles.fotoPreview} contentFit="cover" transition={150} />
                  ) : (
                    <View style={styles.fotoVazia}>
                      <Ionicons name="camera" size={26} color={colors.textoFraco} />
                      <Text style={styles.fotoVaziaTxt}>Adicionar foto</Text>
                    </View>
                  )}
                  <View style={styles.fotoEditar}>
                    <Ionicons name="pencil" size={14} color="#FFFFFF" />
                  </View>
                </TouchableOpacity>

                <Campo label="Nome" valor={editando.nome} onChange={(v) => setEditando({ ...editando, nome: v })} />
                <Campo label="Categoria (item)" valor={editando.item} onChange={(v) => setEditando({ ...editando, item: v })} />
                <View style={styles.dupla}>
                  <Campo label="Compra (R$)" valor={editando.compra} numerico style={{ flex: 1 }}
                    onChange={(v) => setEditando({ ...editando, compra: v })} />
                  <Campo label="Venda (R$)" valor={editando.venda} numerico style={{ flex: 1 }}
                    onChange={(v) => setEditando({ ...editando, venda: v })} />
                </View>
                <View style={styles.dupla}>
                  <Campo label="Tamanho" valor={editando.tamanho} style={{ flex: 1 }}
                    onChange={(v) => setEditando({ ...editando, tamanho: v })} />
                  <Campo label="Condição" valor={editando.condicao} style={{ flex: 1 }}
                    onChange={(v) => setEditando({ ...editando, condicao: v })} />
                </View>

                {editando.origem === 'scraper' ? (
                  <View style={styles.notaScraper}>
                    <Ionicons name="logo-instagram" size={15} color={colors.textoFraco} />
                    <Text style={styles.notaScraperTxt}>Peça do Insta — o drop já é o do post, não dá pra jogar num drop futuro.</Text>
                  </View>
                ) : (
                  <>
                    <Text style={styles.campoLabel}>Drop</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      <TouchableOpacity onPress={() => setEditando({ ...editando, drop_id: null })}
                        style={[styles.dropChip, editando.drop_id == null && styles.dropChipOn]}>
                        <Text style={[styles.dropChipTxt, editando.drop_id == null && styles.dropChipTxtOn]}>Nenhum</Text>
                      </TouchableOpacity>
                      {drops.map((d) => (
                        <TouchableOpacity key={d.id} onPress={() => setEditando({ ...editando, drop_id: d.id })}
                          style={[styles.dropChip, editando.drop_id === d.id && styles.dropChipOn]}>
                          <Text style={[styles.dropChipTxt, editando.drop_id === d.id && styles.dropChipTxtOn]}>{d.nome}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </>
                )}

                <View style={styles.linhaBool}>
                  <Text style={styles.boolLabel}>Vendida</Text>
                  <Switch value={editando.vendida} onValueChange={(v) => setEditando({ ...editando, vendida: v })}
                    trackColor={{ true: colors.ok, false: colors.border }} thumbColor="#fff" />
                </View>
                <Botao title="Salvar" onPress={salvar} loading={salvando} />
                {editando.id && (
                  <Botao title="Excluir peça" cor={colors.card2} txtCor={colors.erro} onPress={excluir} />
                )}
              </ScrollView>
            )}
      </BottomSheet>

      <MenuContexto
        visible={!!menu} x={menu?.x ?? 0} y={menu?.y ?? 0} onClose={() => setMenu(null)}
        itens={menu ? [
          { label: 'Editar', icon: 'create-outline', onPress: () => { const p = menu.peca; setMenu(null); setEditando(paraForm(p)); } },
          { label: 'Excluir', icon: 'trash-outline', cor: colors.erro, onPress: () => excluirPeca(menu.peca) },
        ] : []}
      />

    </View>
  );
}

function Campo({ label, valor, onChange, numerico, style }:
  { label: string; valor: string; onChange: (v: string) => void; numerico?: boolean; style?: object }) {
  return (
    <View style={style}>
      <Text style={styles.campoLabel}>{label}</Text>
      <TextInput value={valor} onChangeText={onChange} keyboardType={numerico ? 'numeric' : 'default'}
        placeholderTextColor={colors.textoFraco} style={styles.input} />
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
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: colors.border },
  linhaApagando: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,15,15,0.72)', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 44, height: 55, borderRadius: 8, backgroundColor: colors.card2 },
  thumbVazia: { alignItems: 'center', justifyContent: 'center' },
  nome: { color: colors.texto, fontSize: 15, fontWeight: '600' },
  sub: { color: colors.textoFraco, fontSize: 12, marginTop: 2 },
  valores: { alignItems: 'flex-end' },
  venda: { color: colors.texto, fontSize: 14, fontWeight: '700' },
  compra: { color: colors.textoFraco, fontSize: 11, marginTop: 2 },
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
  notaScraper: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card2, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border },
  notaScraperTxt: { color: colors.textoFraco, fontSize: 12, flex: 1, lineHeight: 16 },
  linhaBool: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.card, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border },
  boolLabel: { color: colors.texto, fontSize: 15, fontWeight: '600' },
});
