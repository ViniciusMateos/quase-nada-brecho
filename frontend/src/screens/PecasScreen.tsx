import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Animated, FlatList, Linking, Modal, Pressable, ScrollView, Share, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
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

// clipboard nativo (expo-clipboard). Cai pro Share se o nativo ainda não estiver no build.
let Clipboard: any = null;
try { Clipboard = require('expo-clipboard'); } catch { Clipboard = null; }
async function copiarTexto(t: string) {
  try { if (Clipboard?.setStringAsync) { await Clipboard.setStringAsync(t); return; } } catch {}
  try { await Share.share({ message: t }); } catch {}
}

// medidas especiais (só boné/tênis): cada uma tem um tipo + valor (cm).
type Medida = { tipo: string; valor: string };
const TIPOS_MEDIDA = ['Circunferência', 'Palmilha'] as const;
// como cada tipo aparece dentro do "(...)" na legenda
const ABREV: Record<string, string> = { Circunferência: 'circunferência', Palmilha: 'palmilha' };
function parseMedidas(s: string | null): Medida[] {
  if (!s) return [];
  try {
    const a = JSON.parse(s);
    return Array.isArray(a) ? a.filter((m) => m && m.tipo).map((m) => ({ tipo: String(m.tipo), valor: String(m.valor ?? '') })) : [];
  } catch { return []; }
}
function serializeMedidas(ms: Medida[]): string {
  const limpo = ms.filter((m) => String(m.valor).trim());
  return limpo.length ? JSON.stringify(limpo) : '';
}

type Form = {
  id: number | null; nome: string; item: string; tamanho: string; largura: string; comprimento: string;
  medidas: Medida[]; observacao: string; condicao: string; compra: string; venda: string; vendida: boolean;
  consignado: boolean; consigPct: string; soManual: boolean;
  drop_id: number | null; imagem_url: string | null; fotoLocal: string | null; origem: string; code: string | null;
};
const FORM_VAZIO: Form = {
  id: null, nome: '', item: '', tamanho: '', largura: '', comprimento: '', medidas: [], observacao: '',
  condicao: '', compra: '', venda: '', vendida: false, consignado: false, consigPct: '', soManual: false,
  drop_id: null, imagem_url: null, fotoLocal: null, origem: 'manual', code: null,
};

function paraForm(p: Peca): Form {
  return {
    id: p.id, nome: p.nome ?? '', item: p.item ?? '', tamanho: p.tamanho ?? '',
    largura: p.largura ?? '', comprimento: p.comprimento ?? '',
    medidas: parseMedidas(p.medida), observacao: p.observacao ?? '',
    condicao: p.condicao ?? '', compra: p.compra ? String(p.compra) : '', venda: p.venda ? String(p.venda) : '',
    vendida: p.vendida, consignado: p.consignado, consigPct: p.consig_pct != null ? String(p.consig_pct) : '',
    soManual: p.so_manual, drop_id: p.drop_id, imagem_url: p.imagem_url, fotoLocal: null,
    origem: p.origem ?? 'manual', code: p.code,
  };
}

// quanto eu recebo de uma peça consignada (só a %)
function recebeConsig(venda: number, pct: number | null): number {
  return venda * ((pct || 0) / 100);
}

// Gera o template da legenda pra copiar/colar no post (mesmo formato do brechó).
function gerarTemplate(f: Form): string {
  const L: string[] = [];
  L.push(`| ${f.nome.trim() || f.item.trim()}`.trimEnd());
  // conteúdo do "(...)": largura/comprimento (padrão) + especiais. Ex "l 58cm c 64cm".
  const partes: string[] = [];
  if (f.largura.trim()) partes.push(`l ${f.largura.trim()}cm`);
  if (f.comprimento.trim()) partes.push(`c ${f.comprimento.trim()}cm`);
  f.medidas.filter((m) => String(m.valor).trim())
    .forEach((m) => partes.push(`${ABREV[m.tipo] ?? m.tipo.toLowerCase()} ${String(m.valor).trim()}cm`));
  const medStr = partes.join(' ');
  const tam = f.tamanho.trim();
  if (tam && medStr) L.push(`tam.: ${tam} (${medStr})`);
  else if (tam) L.push(`tam.: ${tam}`);
  else if (medStr) L.push(`(${medStr})`);
  if (f.condicao.trim()) L.push(`condição: ${f.condicao.trim()}`);
  L.push('');
  const v = num(f.venda);
  if (!f.vendida && v > 0) L.push(`R$:${Number.isInteger(v) ? v : String(v).replace('.', ',')}`);
  const obs = f.observacao.trim();
  if (obs) { L.push(''); L.push(obs); }
  L.push('');
  L.push('comente "fila"');
  L.push('.');
  L.push('.');
  L.push('#brechoonline #brecho');
  // colapsa linhas em branco duplicadas (ex: peça vendida sem preço)
  return L.join('\n').replace(/\n{3,}/g, '\n\n');
}

export function PecasScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const [pecas, setPecas] = useState<Peca[] | null>(null);
  const [drops, setDrops] = useState<Drop[]>([]);
  const [base, setBase] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [ordem, setOrdem] = useState<'recente' | 'antiga'>('recente');
  const [categoria, setCategoria] = useState<string | null>(null);
  const [dropAberto, setDropAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState<Form | null>(null);
  const [mostrarMedida, setMostrarMedida] = useState(false);

  function abrirEditor(f: Form) {
    setEditando(f);
    setMostrarMedida(f.medidas.length > 0);
  }
  const [salvando, setSalvando] = useState(false);
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
      api.listDrops().then((r) => setDrops(r.drops)).catch(() => setDrops([])),
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
      largura: editando.largura.trim(), comprimento: editando.comprimento.trim(),
      medida: serializeMedidas(editando.medidas), observacao: editando.observacao.trim(),
      condicao: editando.condicao.trim(),
      compra: num(editando.compra), venda: num(editando.venda),
      vendida: editando.vendida, drop_id: editando.drop_id,
      consignado: editando.consignado, consig_pct: editando.consignado ? num(editando.consigPct) : null,
      so_manual: editando.soManual,
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
        <TouchableOpacity style={styles.addBtn} onPress={() => abrirEditor({ ...FORM_VAZIO })}>
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
            <Pressavel style={styles.linha} onPress={() => abrirEditor(paraForm(item))}
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
                  {[item.item, item.tamanho && `tam ${item.tamanho}`, item.drop_nome].filter(Boolean).join(' · ') || '—'}
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

      {/* editor (sheet com grabber + arrastar pra fechar) */}
      <BottomSheet visible={!!editando} onClose={() => setEditando(null)}
        footer={editando ? (
          <>
            <Botao title="Salvar" onPress={salvar} loading={salvando} />
            {editando.id ? (
              <Botao title="Excluir peça" cor={colors.card2} txtCor={colors.erro} onPress={excluir} />
            ) : null}
          </>
        ) : undefined}>
            <View style={styles.modalTopo}>
              <Text style={styles.modalTitulo}>{editando?.id ? 'Editar peça' : 'Nova peça'}</Text>
              <TouchableOpacity onPress={() => setEditando(null)} hitSlop={10}>
                <Ionicons name="close" size={24} color={colors.textoFraco} />
              </TouchableOpacity>
            </View>
            {editando && (
              <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 8 }}>
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

                <Campo label="Nome" valor={editando.nome} onChange={(v) => {
                  // categoria = 1ª palavra do nome, mas só enquanto não for editada na mão
                  const nova = v.trim().split(/\s+/)[0] || '';
                  const antiga = editando.nome.trim().split(/\s+/)[0] || '';
                  const itemAuto = !editando.item.trim() || editando.item.trim() === antiga;
                  setEditando({ ...editando, nome: v, item: itemAuto ? nova : editando.item });
                }} />
                <Campo label="Categoria (item)" valor={editando.item} onChange={(v) => setEditando({ ...editando, item: v })} />
                <View style={styles.dupla}>
                  <Campo label="Compra (R$)" valor={editando.compra} numerico placeholder="0" style={{ flex: 1 }}
                    onChange={(v) => setEditando({ ...editando, compra: v })} />
                  <Campo label="Venda (R$)" valor={editando.venda} numerico placeholder="0" style={{ flex: 1 }}
                    onChange={(v) => setEditando({ ...editando, venda: v })} />
                </View>
                <View style={styles.dupla}>
                  <Campo label="Tamanho" valor={editando.tamanho} style={{ flex: 1 }}
                    onChange={(v) => setEditando({ ...editando, tamanho: v })} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.campoLabel}>Condição</Text>
                    <View style={styles.condRow}>
                      <TextInput value={editando.condicao.split('/')[0] || ''}
                        onChangeText={(v) => {
                          let d = v.replace(/\D/g, '').slice(0, 2);
                          if (parseInt(d || '0', 10) > 10) d = '10';
                          setEditando({ ...editando, condicao: d ? `${d}/10` : '' });
                        }}
                        keyboardType="numeric" maxLength={2} placeholder="9" placeholderTextColor={colors.textoFraco}
                        style={[styles.input, { flex: 1 }]} />
                      <Text style={styles.condSufixo}>/10</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.dupla}>
                  <Campo label="Largura (cm)" valor={editando.largura} numerico style={{ flex: 1 }}
                    onChange={(v) => setEditando({ ...editando, largura: v.replace(/[^\d.,]/g, '') })} />
                  <Campo label="Comprimento (cm)" valor={editando.comprimento} numerico style={{ flex: 1 }}
                    onChange={(v) => setEditando({ ...editando, comprimento: v.replace(/[^\d.,]/g, '') })} />
                </View>

                <View style={styles.linhaBool}>
                  <Text style={styles.boolLabel}>Medida especial (boné, tênis)</Text>
                  <Switch value={mostrarMedida || editando.medidas.length > 0}
                    onValueChange={(v) => {
                      setMostrarMedida(v);
                      if (v && editando.medidas.length === 0) setEditando({ ...editando, medidas: [{ tipo: 'Circunferência', valor: '' }] });
                      if (!v) setEditando({ ...editando, medidas: [] });
                    }}
                    trackColor={{ true: colors.marca, false: colors.border }} thumbColor="#fff" />
                </View>
                {(mostrarMedida || editando.medidas.length > 0) && (
                  <View style={{ gap: 10 }}>
                    {editando.medidas.map((m, i) => (
                      <View key={i} style={styles.medidaRow}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} keyboardShouldPersistTaps="handled">
                          {TIPOS_MEDIDA.map((t) => (
                            <TouchableOpacity key={t}
                              onPress={() => { const ms = [...editando.medidas]; ms[i] = { ...ms[i], tipo: t }; setEditando({ ...editando, medidas: ms }); }}
                              style={[styles.tipoChip, m.tipo === t && styles.tipoChipOn]}>
                              <Text style={[styles.tipoChipTxt, m.tipo === t && styles.tipoChipTxtOn]}>{t}</Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                        <View style={styles.medidaValorRow}>
                          <TextInput value={m.valor} keyboardType="numeric" placeholder="valor"
                            placeholderTextColor={colors.textoFraco} style={styles.medidaInput}
                            onChangeText={(v) => { const ms = [...editando.medidas]; ms[i] = { ...ms[i], valor: v.replace(/[^\d.,]/g, '') }; setEditando({ ...editando, medidas: ms }); }} />
                          <Text style={styles.cmTxt}>cm</Text>
                          <TouchableOpacity hitSlop={8}
                            onPress={() => setEditando({ ...editando, medidas: editando.medidas.filter((_, j) => j !== i) })}>
                            <Ionicons name="close-circle" size={22} color={colors.textoFraco} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                    <TouchableOpacity style={styles.addMedida}
                      onPress={() => setEditando({ ...editando, medidas: [...editando.medidas, { tipo: 'Circunferência', valor: '' }] })}>
                      <Ionicons name="add" size={16} color={colors.marca} />
                      <Text style={styles.addMedidaTxt}>Adicionar medida</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <Campo label="Observação (opcional)" valor={editando.observacao} multiline
                  placeholder="ex: furinho na manga" onChange={(v) => setEditando({ ...editando, observacao: v })} />

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

                <View style={styles.linhaBool}>
                  <Text style={styles.boolLabel}>Consignado (peça de terceiro)</Text>
                  <Switch value={editando.consignado} onValueChange={(v) => setEditando({ ...editando, consignado: v })}
                    trackColor={{ true: colors.marca, false: colors.border }} thumbColor="#fff" />
                </View>
                {editando.consignado && (
                  <View style={styles.consigRow}>
                    <Text style={styles.campoLabel}>% que fica pra mim</Text>
                    <View style={styles.consigInputWrap}>
                      <TextInput value={editando.consigPct} keyboardType="numeric" maxLength={3}
                        placeholder="40" placeholderTextColor={colors.textoFraco} style={[styles.input, { flex: 1 }]}
                        onChangeText={(v) => setEditando({ ...editando, consigPct: v.replace(/[^\d]/g, '').slice(0, 3) })} />
                      <Text style={styles.condSufixo}>%</Text>
                    </View>
                    <Text style={styles.consigPreview}>
                      você recebe {brl(recebeConsig(num(editando.venda), num(editando.consigPct)))} da venda de {brl(num(editando.venda))}
                    </Text>
                  </View>
                )}

                <View style={styles.linhaBool}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={styles.boolLabel}>Manual (o scraper não atualiza)</Text>
                    <Text style={styles.boolSub}>trava a peça pra a raspagem do Insta nunca mexer nela</Text>
                  </View>
                  <Switch value={editando.soManual} onValueChange={(v) => setEditando({ ...editando, soManual: v })}
                    trackColor={{ true: colors.marca, false: colors.border }} thumbColor="#fff" />
                </View>

                {/* template pra copiar/colar na hora de postar */}
                <View style={styles.templateBox}>
                  <View style={styles.templateTopo}>
                    <Text style={styles.campoLabel}>Template do post</Text>
                    <BotaoCopiar texto={gerarTemplate(editando)} />
                  </View>
                  <Text selectable style={styles.templateTxt}>{gerarTemplate(editando)}</Text>
                </View>

                {editando.code && (
                  <Botao title="Abrir no Instagram" cor={colors.card2} txtCor={colors.marca}
                    onPress={() => Linking.openURL(`https://www.instagram.com/p/${editando.code}/`)} />
                )}

              </ScrollView>
            )}
      </BottomSheet>

      <MenuContexto
        visible={!!menu} x={menu?.x ?? 0} y={menu?.y ?? 0} onClose={() => setMenu(null)}
        itens={menu ? [
          { label: 'Editar', icon: 'create-outline', onPress: () => { const p = menu.peca; setMenu(null); abrirEditor(paraForm(p)); } },
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

function Campo({ label, valor, onChange, numerico, multiline, placeholder, style }:
  { label: string; valor: string; onChange: (v: string) => void; numerico?: boolean; multiline?: boolean; placeholder?: string; style?: object }) {
  return (
    <View style={style}>
      <Text style={styles.campoLabel}>{label}</Text>
      <TextInput value={valor} onChangeText={onChange} keyboardType={numerico ? 'numeric' : 'default'}
        multiline={multiline} textAlignVertical={multiline ? 'top' : 'center'}
        placeholder={placeholder} placeholderTextColor={colors.textoFraco}
        style={[styles.input, multiline && styles.inputMultiline]} />
    </View>
  );
}

// Botão "Copiar" que vira "Copiado" (laranja escuro) por 2s, com animação.
function BotaoCopiar({ texto }: { texto: string }) {
  const [copiado, setCopiado] = React.useState(false);
  const anim = React.useRef(new Animated.Value(0)).current;
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function aoCopiar() {
    copiarTexto(texto);
    setCopiado(true);
    Animated.spring(anim, { toValue: 1, useNativeDriver: false, friction: 6, tension: 80 }).start();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: false }).start(() => setCopiado(false));
    }, 2000);
  }

  const bg = anim.interpolate({ inputRange: [0, 1], outputRange: ['rgba(0,0,0,0)', colors.laranjaEscuro] });
  const borda = anim.interpolate({ inputRange: [0, 1], outputRange: [colors.marca, colors.laranjaEscuro] });
  const corTxt = anim.interpolate({ inputRange: [0, 1], outputRange: [colors.marca, '#FFFFFF'] });

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={aoCopiar} hitSlop={8}>
      <Animated.View style={[styles.copiarBtn, { backgroundColor: bg, borderColor: borda, transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }] }]}>
        <Ionicons name={copiado ? 'checkmark' : 'copy-outline'} size={14} color={copiado ? '#FFFFFF' : colors.marca} />
        <Animated.Text style={[styles.copiarTxt, { color: corTxt }]}>{copiado ? 'Copiado' : 'Copiar'}</Animated.Text>
      </Animated.View>
    </TouchableOpacity>
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
  notaScraper: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card2, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border },
  notaScraperTxt: { color: colors.textoFraco, fontSize: 12, flex: 1, lineHeight: 16 },
  linhaBool: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.card, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border },
  boolLabel: { color: colors.texto, fontSize: 15, fontWeight: '600' },
  boolSub: { color: colors.textoFraco, fontSize: 11, marginTop: 2, lineHeight: 15 },
});
