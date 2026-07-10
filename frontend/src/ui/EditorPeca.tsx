import React, { useEffect, useState } from 'react';
import { Alert, Animated, Linking, ScrollView, Share, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { api, DropResumo, Peca, PecaCampos } from '@/lib/api';
import { baseUrl } from '@/lib/apiClient';
import { fotoParaUpload } from '@/lib/foto';
import { colors } from '@/theme';
import { Botao } from '@/ui/components';
import { BottomSheet } from '@/ui/BottomSheet';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const num = (t: string) => {
  const n = parseFloat((t || '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
};

// quanto eu recebo de uma peça consignada — % da venda ou um valor fixo (nunca mais que a venda)
function recebeConsig(venda: number, tipo: 'pct' | 'valor', pct: number, valor: number): number {
  if (tipo === 'valor') return Math.min(valor, venda);
  return venda * (pct / 100);
}
// % equivalente do que recebo sobre a venda (pra mostrar a % quando é valor fixo)
function pctStr(recebe: number, venda: number): string {
  if (venda <= 0) return '0%';
  const p = (recebe / venda) * 100;
  return `${Number.isInteger(p) ? p : p.toFixed(1)}%`;
}

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
  consignado: boolean; consigTipo: 'pct' | 'valor'; consigPct: string; consigValor: string; soManual: boolean;
  template: string; codigo: number | null;
  drop_id: number | null; imagem_url: string | null; fotoLocal: string | null; origem: string; code: string | null;
  postado_em: string | null;
};
const FORM_VAZIO: Form = {
  id: null, nome: '', item: '', tamanho: '', largura: '', comprimento: '', medidas: [], observacao: '',
  condicao: '', compra: '', venda: '', vendida: false, consignado: false, consigTipo: 'pct', consigPct: '',
  consigValor: '', soManual: false, template: '', codigo: null,
  drop_id: null, imagem_url: null, fotoLocal: null, origem: 'manual', code: null, postado_em: null,
};
function paraForm(p: Peca): Form {
  return {
    id: p.id, nome: p.nome ?? '', item: p.item ?? '', tamanho: p.tamanho ?? '',
    largura: p.largura ?? '', comprimento: p.comprimento ?? '',
    medidas: parseMedidas(p.medida), observacao: p.observacao ?? '',
    condicao: p.condicao ?? '', compra: p.compra ? String(p.compra) : '', venda: p.venda ? String(p.venda) : '',
    vendida: p.vendida, consignado: p.consignado,
    consigTipo: p.consig_tipo === 'valor' ? 'valor' : 'pct',
    consigPct: p.consig_pct != null ? String(p.consig_pct) : '',
    consigValor: p.consig_valor != null ? String(p.consig_valor) : '',
    soManual: p.so_manual, template: p.template ?? '', codigo: p.num ?? null,
    drop_id: p.drop_id, imagem_url: p.imagem_url, fotoLocal: null,
    origem: p.origem ?? 'manual', code: p.code, postado_em: p.postado_em,
  };
}

// Gera o template da legenda pra copiar/colar no post (mesmo formato do brechó).
function gerarTemplate(f: Form): string {
  const L: string[] = [];
  // peça vendida (pelo scraper ou pelo toggle): '| ❌VENDIDA❌' no topo + linha em branco,
  // e sem o preço (omitido mais abaixo) — mesmo formato do post vendido no Insta.
  if (f.vendida) {
    L.push('| ❌VENDIDA❌');
    L.push('');
    L.push((f.nome.trim() || f.item.trim()).trim());
  } else {
    L.push(`| ${f.nome.trim() || f.item.trim()}`.trimEnd());
  }
  const partes: string[] = [];
  if (f.largura.trim()) partes.push(`l ${f.largura.trim()}cm`);
  if (f.comprimento.trim()) partes.push(`c ${f.comprimento.trim()}cm`);
  f.medidas.filter((m) => String(m.valor).trim())
    .forEach((m) => {
      const nome = (ABREV[m.tipo] ?? (m.tipo || '').toLowerCase()).trim();
      const val = String(m.valor).trim();
      partes.push(nome ? `${nome} ${val}cm` : `${val}cm`);
    });
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
  // código da peça (#p<num>) junto das hashtags — é a chave de match da raspagem
  const tags = ['#brechoonline', '#brecho'];
  if (f.codigo != null) tags.push(`#p${f.codigo}`);
  L.push(tags.join(' '));
  return L.join('\n').replace(/\n{3,}/g, '\n\n');
}

// Sheet de edição/criação de peça — compartilhado por todas as telas (Peças e Drops).
// `visible` abre; `peca` = null cria uma nova. Ao salvar/excluir chama onSaved().
export function EditorPeca({
  visible, peca, onClose, onSaved,
}: { visible: boolean; peca: Peca | null; onClose: () => void; onSaved: () => void }) {
  const nav = useNavigation<Nav>();
  const [form, setForm] = useState<Form | null>(null);
  const [drops, setDrops] = useState<DropResumo[]>([]);
  const [base, setBase] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [mostrarMedida, setMostrarMedida] = useState(false);

  useEffect(() => { baseUrl().then(setBase); }, []);
  useEffect(() => {
    if (visible) {
      const f = peca ? paraForm(peca) : { ...FORM_VAZIO };
      setForm(f);
      setMostrarMedida(f.medidas.length > 0);
      api.listDropsTodos().then((r) => setDrops(r.drops)).catch(() => {});
    }
  }, [visible, peca]);

  // Drop a que a peça pertence: manual (pelo drop_id) ou histórico do scraper (pela data do post).
  function dropDaPeca(drop_id: number | null, postado_em: string | null): DropResumo | undefined {
    if (drop_id != null) return drops.find((d) => d.tipo === 'manual' && d.id === drop_id);
    if (postado_em) return drops.find((d) => d.tipo === 'historico' && d.data === postado_em);
    return undefined;
  }
  // Entra no drop da peça. Fecha a sheet antes (senão ela fica cobrindo o drop).
  function irPraDrop(drop_id: number | null, postado_em: string | null) {
    const d = dropDaPeca(drop_id, postado_em);
    if (!d) return;
    onClose();
    if (d.tipo === 'manual' && d.id != null) nav.navigate('DropDetail', { dropId: d.id, nome: `Drop ${d.numero}` });
    else nav.navigate('HistoricoDrop', { data: d.data, titulo: `Drop ${d.numero}` });
  }

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
      largura: form.largura.trim(), comprimento: form.comprimento.trim(),
      medida: serializeMedidas(form.medidas), observacao: form.observacao.trim(),
      condicao: form.condicao.trim(), compra: num(form.compra), venda: num(form.venda),
      vendida: form.vendida, drop_id: form.drop_id,
      consignado: form.consignado, consig_tipo: form.consigTipo,
      consig_pct: form.consignado && form.consigTipo === 'pct' ? num(form.consigPct) : null,
      consig_valor: form.consignado && form.consigTipo === 'valor' ? num(form.consigValor) : null,
      so_manual: form.soManual, template: form.template.trim() || null,
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
    <BottomSheet visible={visible} onClose={onClose}
      footer={form ? (
        <>
          <Botao title="Salvar" onPress={salvar} loading={salvando} />
          {form.id ? (
            <Botao title="Excluir peça" cor={colors.card2} txtCor={colors.erro} onPress={excluir} />
          ) : null}
        </>
      ) : undefined}>
      <View style={styles.topo}>
        <Text style={styles.titulo}>{form?.id ? 'Editar peça' : 'Nova peça'}</Text>
        <TouchableOpacity onPress={onClose} hitSlop={10}>
          <Ionicons name="close" size={24} color={colors.textoFraco} />
        </TouchableOpacity>
      </View>
      {form && (
        <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
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

          <Campo label="Nome" valor={form.nome} onChange={(v) => {
            // categoria = 1ª palavra do nome, mas só enquanto não for editada na mão
            const nova = v.trim().split(/\s+/)[0] || '';
            const antiga = form.nome.trim().split(/\s+/)[0] || '';
            const itemAuto = !form.item.trim() || form.item.trim() === antiga;
            setForm({ ...form, nome: v, item: itemAuto ? nova : form.item });
          }} />
          <Campo label="Categoria (item)" valor={form.item} onChange={(v) => setForm({ ...form, item: v })} />
          <View style={styles.dupla}>
            <Campo label="Compra (R$)" valor={form.compra} numerico placeholder="0" style={{ flex: 1 }}
              onChange={(v) => setForm({ ...form, compra: v })} />
            <Campo label="Venda (R$)" valor={form.venda} numerico placeholder="0" style={{ flex: 1 }}
              onChange={(v) => setForm({ ...form, venda: v })} />
          </View>
          <View style={styles.dupla}>
            <Campo label="Tamanho" valor={form.tamanho} style={{ flex: 1 }}
              onChange={(v) => setForm({ ...form, tamanho: v })} />
            <View style={{ flex: 1 }}>
              <Text style={styles.campoLabel}>Condição</Text>
              <View style={styles.condRow}>
                <TextInput value={form.condicao.split('/')[0] || ''}
                  onChangeText={(v) => {
                    let d = v.replace(/\D/g, '').slice(0, 2);
                    if (parseInt(d || '0', 10) > 10) d = '10';
                    setForm({ ...form, condicao: d ? `${d}/10` : '' });
                  }}
                  keyboardType="numeric" maxLength={2} placeholder="9" placeholderTextColor={colors.textoFraco}
                  style={[styles.input, { flex: 1 }]} />
                <Text style={styles.condSufixo}>/10</Text>
              </View>
            </View>
          </View>
          <View style={styles.dupla}>
            <Campo label="Largura (cm)" valor={form.largura} numerico style={{ flex: 1 }}
              onChange={(v) => setForm({ ...form, largura: v.replace(/[^\d.,]/g, '') })} />
            <Campo label="Comprimento (cm)" valor={form.comprimento} numerico style={{ flex: 1 }}
              onChange={(v) => setForm({ ...form, comprimento: v.replace(/[^\d.,]/g, '') })} />
          </View>

          <View style={styles.linhaBool}>
            <Text style={styles.boolLabel}>Medida especial (boné, tênis)</Text>
            <Switch value={mostrarMedida || form.medidas.length > 0}
              onValueChange={(v) => {
                setMostrarMedida(v);
                if (v && form.medidas.length === 0) setForm({ ...form, medidas: [{ tipo: 'Circunferência', valor: '' }] });
                if (!v) setForm({ ...form, medidas: [] });
              }}
              trackColor={{ true: colors.marca, false: colors.border }} thumbColor="#fff" />
          </View>
          {(mostrarMedida || form.medidas.length > 0) && (
            <View style={{ gap: 10 }}>
              {form.medidas.map((m, i) => (
                <View key={i} style={styles.medidaRow}>
                  {/* sugestões rápidas — clica pra preencher o nome (ou digita o seu no campo) */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} keyboardShouldPersistTaps="handled">
                    {TIPOS_MEDIDA.map((t) => (
                      <TouchableOpacity key={t}
                        onPress={() => { const ms = [...form.medidas]; ms[i] = { ...ms[i], tipo: t }; setForm({ ...form, medidas: ms }); }}
                        style={[styles.tipoChip, m.tipo === t && styles.tipoChipOn]}>
                        <Text style={[styles.tipoChipTxt, m.tipo === t && styles.tipoChipTxtOn]}>{t}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <View style={styles.medidaValorRow}>
                    <TextInput value={m.tipo} placeholder="nome da medida" placeholderTextColor={colors.textoFraco}
                      style={[styles.medidaInput, { flex: 1 }]}
                      onChangeText={(v) => { const ms = [...form.medidas]; ms[i] = { ...ms[i], tipo: v }; setForm({ ...form, medidas: ms }); }} />
                    <TextInput value={m.valor} keyboardType="numeric" placeholder="cm"
                      placeholderTextColor={colors.textoFraco} style={[styles.medidaInput, { flex: 0, width: 60, textAlign: 'center' }]}
                      onChangeText={(v) => { const ms = [...form.medidas]; ms[i] = { ...ms[i], valor: v.replace(/[^\d.,]/g, '') }; setForm({ ...form, medidas: ms }); }} />
                    <Text style={styles.cmTxt}>cm</Text>
                    <TouchableOpacity hitSlop={8}
                      onPress={() => setForm({ ...form, medidas: form.medidas.filter((_, j) => j !== i) })}>
                      <Ionicons name="close-circle" size={22} color={colors.textoFraco} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              <TouchableOpacity style={styles.addMedida}
                onPress={() => setForm({ ...form, medidas: [...form.medidas, { tipo: '', valor: '' }] })}>
                <Ionicons name="add" size={16} color={colors.marca} />
                <Text style={styles.addMedidaTxt}>Adicionar medida</Text>
              </TouchableOpacity>
            </View>
          )}

          <Campo label="Observação (opcional)" valor={form.observacao} multiline
            placeholder="ex: furinho na manga" onChange={(v) => setForm({ ...form, observacao: v })} />

          {form.origem === 'scraper' ? (
            <>
              <View style={styles.notaScraper}>
                <Ionicons name="logo-instagram" size={15} color={colors.textoFraco} />
                <Text style={styles.notaScraperTxt}>Peça do Insta — o drop já é o do post, não dá pra jogar num drop futuro.</Text>
              </View>
              {(() => {
                const d = dropDaPeca(form.drop_id, form.postado_em);
                return d ? (
                  <TouchableOpacity style={styles.verDrop} activeOpacity={0.8}
                    onPress={() => irPraDrop(form.drop_id, form.postado_em)}>
                    <Ionicons name="albums-outline" size={16} color={colors.marca} />
                    <Text style={styles.verDropTxt}>Ver Drop {d.numero} (do post)</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.marca} />
                  </TouchableOpacity>
                ) : null;
              })()}
            </>
          ) : (
            <>
              <Text style={styles.campoLabel}>Drop</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                <TouchableOpacity onPress={() => setForm({ ...form, drop_id: null })}
                  style={[styles.dropChip, form.drop_id == null && styles.dropChipOn]}>
                  <Text style={[styles.dropChipTxt, form.drop_id == null && styles.dropChipTxtOn]}>Nenhum</Text>
                </TouchableOpacity>
                {drops.filter((d) => d.tipo === 'manual').map((d) => (
                  <TouchableOpacity key={d.id} onPress={() => setForm({ ...form, drop_id: d.id })}
                    style={[styles.dropChip, form.drop_id === d.id && styles.dropChipOn]}>
                    <Text style={[styles.dropChipTxt, form.drop_id === d.id && styles.dropChipTxtOn]}>Drop {d.numero}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {(() => {
                const d = dropDaPeca(form.drop_id, null);
                return d ? (
                  <TouchableOpacity style={styles.verDrop} activeOpacity={0.8}
                    onPress={() => irPraDrop(form.drop_id, null)}>
                    <Ionicons name="albums-outline" size={16} color={colors.marca} />
                    <Text style={styles.verDropTxt}>Ver Drop {d.numero} · {d.status}</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.marca} />
                  </TouchableOpacity>
                ) : null;
              })()}
            </>
          )}

          <View style={styles.linhaBool}>
            <Text style={styles.boolLabel}>Vendida</Text>
            <Switch value={form.vendida} onValueChange={(v) => setForm({ ...form, vendida: v })}
              trackColor={{ true: colors.ok, false: colors.border }} thumbColor="#fff" />
          </View>

          <View style={styles.linhaBool}>
            <Text style={styles.boolLabel}>Consignado (peça de terceiro)</Text>
            <Switch value={form.consignado} onValueChange={(v) => setForm({ ...form, consignado: v })}
              trackColor={{ true: colors.marca, false: colors.border }} thumbColor="#fff" />
          </View>
          {form.consignado && (
            <View style={styles.consigRow}>
              {/* toggle: % da venda OU valor fixo em R$ (um campo só) */}
              <View style={styles.consigModo}>
                {(['pct', 'valor'] as const).map((t) => (
                  <TouchableOpacity key={t} onPress={() => setForm({ ...form, consigTipo: t })}
                    style={[styles.modoChip, form.consigTipo === t && styles.modoChipOn]}>
                    <Text style={[styles.modoChipTxt, form.consigTipo === t && styles.modoChipTxtOn]}>
                      {t === 'pct' ? '% da venda' : 'Valor fixo (R$)'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {form.consigTipo === 'pct' ? (
                <>
                  <Text style={styles.campoLabel}>% que fica pra mim</Text>
                  <View style={styles.consigInputWrap}>
                    <TextInput value={form.consigPct} keyboardType="numeric" maxLength={3}
                      placeholder="40" placeholderTextColor={colors.textoFraco} style={[styles.input, { flex: 1 }]}
                      onChangeText={(v) => setForm({ ...form, consigPct: v.replace(/[^\d]/g, '').slice(0, 3) })} />
                    <Text style={styles.condSufixo}>%</Text>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.campoLabel}>R$ que fica pra mim (fixo por venda)</Text>
                  <View style={styles.consigInputWrap}>
                    <Text style={styles.condSufixo}>R$</Text>
                    <TextInput value={form.consigValor} keyboardType="numeric"
                      placeholder="5" placeholderTextColor={colors.textoFraco} style={[styles.input, { flex: 1 }]}
                      onChangeText={(v) => setForm({ ...form, consigValor: v.replace(/[^\d.,]/g, '') })} />
                  </View>
                </>
              )}
              {(() => {
                const venda = num(form.venda);
                const recebe = recebeConsig(venda, form.consigTipo, num(form.consigPct), num(form.consigValor));
                return (
                  <Text style={styles.consigPreview}>
                    você recebe {brl(recebe)}{form.consigTipo === 'valor' ? ` (${pctStr(recebe, venda)})` : ''} da venda de {brl(venda)}
                  </Text>
                );
              })()}
            </View>
          )}

          <View style={styles.linhaBool}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.boolLabel}>Manual (o scraper não atualiza)</Text>
              <Text style={styles.boolSub}>trava a peça pra a raspagem do Insta nunca mexer nela</Text>
            </View>
            <Switch value={form.soManual} onValueChange={(v) => setForm({ ...form, soManual: v })}
              trackColor={{ true: colors.marca, false: colors.border }} thumbColor="#fff" />
          </View>

          {/* template pra copiar/colar na hora de postar — editável nas peças manuais */}
          {(() => {
            const gerado = gerarTemplate(form);
            const manual = form.soManual;   // só edita quando o toggle "Manual" está ligado
            const custom = form.template.trim() !== '';
            return (
              <View style={styles.templateBox}>
                <View style={styles.templateTopo}>
                  <Text style={styles.campoLabel}>Template do post{manual ? ' (editável)' : ''}</Text>
                  <BotaoCopiar texto={manual && custom ? form.template : gerado} />
                </View>
                {manual ? (
                  <>
                    <TextInput
                      value={custom ? form.template : gerado}
                      onChangeText={(v) => setForm({ ...form, template: v })}
                      multiline textAlignVertical="top"
                      placeholder="legenda do post…" placeholderTextColor={colors.textoFraco}
                      style={styles.templateInput} />
                    {custom && (
                      <TouchableOpacity onPress={() => setForm({ ...form, template: '' })} hitSlop={6}>
                        <Text style={styles.templateReset}>voltar ao automático</Text>
                      </TouchableOpacity>
                    )}
                  </>
                ) : (
                  <Text selectable style={styles.templateTxt}>{gerado}</Text>
                )}
              </View>
            );
          })()}

          {form.code && (
            <Botao title="Abrir no Instagram" cor={colors.card2} txtCor={colors.marca}
              onPress={() => Linking.openURL(`https://www.instagram.com/p/${form.code}/`)} />
          )}
        </ScrollView>
      )}
    </BottomSheet>
  );
}

function brl(n: number) {
  const [int, dec] = Math.abs(n).toFixed(2).split('.');
  return `R$ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
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
  inputMultiline: { minHeight: 72, paddingTop: 12 },
  condRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  condSufixo: { color: colors.textoFraco, fontSize: 16, fontWeight: '700' },
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
  consigRow: { gap: 6 },
  consigModo: { flexDirection: 'row', gap: 8, marginBottom: 2 },
  modoChip: { flex: 1, alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingVertical: 8 },
  modoChipOn: { backgroundColor: colors.marca, borderColor: colors.marca },
  modoChipTxt: { color: colors.texto, fontSize: 13 },
  modoChipTxtOn: { color: '#FFFFFF', fontWeight: '700' },
  consigInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  consigPreview: { color: colors.textoFraco, fontSize: 12, lineHeight: 16 },
  templateBox: { backgroundColor: colors.card2, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 8 },
  templateTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  copiarBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: colors.marca },
  copiarTxt: { color: colors.marca, fontSize: 12, fontWeight: '700' },
  templateTxt: { color: colors.texto, fontSize: 13, lineHeight: 20, fontFamily: 'monospace' },
  templateInput: { color: colors.texto, fontSize: 13, lineHeight: 20, fontFamily: 'monospace', backgroundColor: colors.bg, borderRadius: 8, borderWidth: 1, borderColor: colors.border, padding: 10, minHeight: 160 },
  templateReset: { color: colors.marca, fontSize: 12, fontWeight: '700', marginTop: 8, textAlign: 'right' },
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
});
