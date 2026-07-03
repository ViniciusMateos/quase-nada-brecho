import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { api, Drop, Peca, PecaCampos } from '@/lib/api';
import { baseUrl } from '@/lib/apiClient';
import { fotoParaUpload } from '@/lib/foto';
import { colors } from '@/theme';
import { Botao } from '@/ui/components';
import { BottomSheet } from '@/ui/BottomSheet';

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

// Sheet de edição/criação de peça — compartilhado por todas as telas.
// `visible` abre; `peca` = null cria uma nova. Ao salvar/excluir chama onSaved().
export function EditorPeca({
  visible, peca, onClose, onSaved,
}: { visible: boolean; peca: Peca | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Form | null>(null);
  const [drops, setDrops] = useState<Drop[]>([]);
  const [base, setBase] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { baseUrl().then(setBase); }, []);
  useEffect(() => {
    if (visible) {
      setForm(peca ? paraForm(peca) : { ...FORM_VAZIO });
      api.listDrops().then((r) => setDrops(r.drops)).catch(() => {});
    }
  }, [visible, peca]);

  async function escolherFoto(daCamera: boolean) {
    if (!form) return;
    const perm = daCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Ops', 'Preciso da permissão pra acessar as fotos.'); return; }
    const res = daCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: ['images'] });
    if (!res.canceled && res.assets[0]) setForm({ ...form, fotoLocal: res.assets[0].uri });
  }

  function pedirFoto() {
    Alert.alert('Foto da peça', undefined, [
      { text: 'Tirar foto', onPress: () => escolherFoto(true) },
      { text: 'Escolher da galeria', onPress: () => escolherFoto(false) },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  async function salvar() {
    if (!form) return;
    const campos: PecaCampos = {
      nome: form.nome.trim(), item: form.item.trim(), tamanho: form.tamanho.trim(),
      condicao: form.condicao.trim(), compra: num(form.compra), venda: num(form.venda),
      vendida: form.vendida, drop_id: form.drop_id,
    };
    setSalvando(true);
    try {
      const p = form.id ? await api.editPeca(form.id, campos) : await api.addPeca(campos);
      if (form.fotoLocal && !/^https?:/.test(form.fotoLocal)) {
        await api.uploadImagem(p.id, await fotoParaUpload(form.fotoLocal));
      }
      onClose(); onSaved();
    } catch {
      Alert.alert('Ops', 'Não consegui salvar a peça.');
    } finally {
      setSalvando(false);
    }
  }

  function excluir() {
    if (!form?.id) return;
    Alert.alert('Excluir peça', 'Some com a peça de vez. Confirma?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir', style: 'destructive',
        onPress: async () => { try { await api.delPeca(form.id!); onClose(); onSaved(); } catch {} },
      },
    ]);
  }

  const imgUrl = form?.imagem_url;
  const previa = form?.fotoLocal ?? (imgUrl ? (/^https?:/.test(imgUrl) ? imgUrl : `${base}${imgUrl}`) : null);

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.topo}>
        <Text style={styles.titulo}>{form?.id ? 'Editar peça' : 'Nova peça'}</Text>
        <TouchableOpacity onPress={onClose} hitSlop={10}>
          <Ionicons name="close" size={24} color={colors.textoFraco} />
        </TouchableOpacity>
      </View>
      {form && (
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: 12, paddingBottom: 8 }}>
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

          <Campo label="Nome" valor={form.nome} onChange={(v) => setForm({ ...form, nome: v })} />
          <Campo label="Categoria (item)" valor={form.item} onChange={(v) => setForm({ ...form, item: v })} />
          <View style={styles.dupla}>
            <Campo label="Compra (R$)" valor={form.compra} numerico style={{ flex: 1 }}
              onChange={(v) => setForm({ ...form, compra: v })} />
            <Campo label="Venda (R$)" valor={form.venda} numerico style={{ flex: 1 }}
              onChange={(v) => setForm({ ...form, venda: v })} />
          </View>
          <View style={styles.dupla}>
            <Campo label="Tamanho" valor={form.tamanho} style={{ flex: 1 }}
              onChange={(v) => setForm({ ...form, tamanho: v })} />
            <Campo label="Condição" valor={form.condicao} style={{ flex: 1 }}
              onChange={(v) => setForm({ ...form, condicao: v })} />
          </View>

          {form.origem === 'scraper' ? (
            <View style={styles.notaScraper}>
              <Ionicons name="logo-instagram" size={15} color={colors.textoFraco} />
              <Text style={styles.notaScraperTxt}>Peça do Insta — o drop já é o do post, não dá pra jogar num drop futuro.</Text>
            </View>
          ) : (
            <>
              <Text style={styles.campoLabel}>Drop</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                <TouchableOpacity onPress={() => setForm({ ...form, drop_id: null })}
                  style={[styles.dropChip, form.drop_id == null && styles.dropChipOn]}>
                  <Text style={[styles.dropChipTxt, form.drop_id == null && styles.dropChipTxtOn]}>Nenhum</Text>
                </TouchableOpacity>
                {drops.map((d) => (
                  <TouchableOpacity key={d.id} onPress={() => setForm({ ...form, drop_id: d.id })}
                    style={[styles.dropChip, form.drop_id === d.id && styles.dropChipOn]}>
                    <Text style={[styles.dropChipTxt, form.drop_id === d.id && styles.dropChipTxtOn]}>{d.nome}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}

          <View style={styles.linhaBool}>
            <Text style={styles.boolLabel}>Vendida</Text>
            <Switch value={form.vendida} onValueChange={(v) => setForm({ ...form, vendida: v })}
              trackColor={{ true: colors.ok, false: colors.border }} thumbColor="#fff" />
          </View>
          <Botao title="Salvar" onPress={salvar} loading={salvando} />
          {form.id && (
            <Botao title="Excluir peça" cor={colors.card2} txtCor={colors.erro} onPress={excluir} />
          )}
        </ScrollView>
      )}
    </BottomSheet>
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
  topo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  titulo: { color: colors.texto, fontSize: 18, fontWeight: '800' },
  fotoBox: { alignSelf: 'center', width: 168, height: 210, borderRadius: 16, backgroundColor: colors.card2, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  fotoPreview: { width: '100%', height: '100%' },
  fotoVazia: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  fotoVaziaTxt: { color: colors.textoFraco, fontSize: 12 },
  fotoEditar: { position: 'absolute', bottom: 8, right: 8, backgroundColor: colors.marca, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dupla: { flexDirection: 'row', gap: 12 },
  campoLabel: { color: colors.textoFraco, fontSize: 12, fontWeight: '600', marginBottom: 6 },
  input: { backgroundColor: colors.card2, color: colors.texto, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border },
  dropChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  dropChipOn: { backgroundColor: colors.marca, borderColor: colors.marca },
  dropChipTxt: { color: colors.texto, fontSize: 13 },
  dropChipTxtOn: { color: '#FFFFFF', fontWeight: '700' },
  notaScraper: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card2, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border },
  notaScraperTxt: { color: colors.textoFraco, fontSize: 12, flex: 1, lineHeight: 16 },
  linhaBool: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.card2, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border },
  boolLabel: { color: colors.texto, fontSize: 15, fontWeight: '600' },
});
