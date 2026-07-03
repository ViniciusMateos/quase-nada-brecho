import React, { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '@/lib/api';
import { colors } from '@/theme';
import { Aparece, Botao, Card } from '@/ui/components';
import { CampoData } from '@/ui/CampoData';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Modo = 'qtd_drops' | 'por_drop';

function hojeISO() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const inteiro = (t: string) => {
  const n = parseInt((t || '').replace(/\D/g, ''), 10);
  return isNaN(n) ? 0 : n;
};

export function GerarDropsScreen() {
  const nav = useNavigation<Nav>();
  const [semDrop, setSemDrop] = useState(0);
  const [modo, setModo] = useState<Modo>('qtd_drops');
  const [valor, setValor] = useState('6');
  const [inicio, setInicio] = useState(hojeISO());
  const [intervalo, setIntervalo] = useState('7');
  const [prefixo, setPrefixo] = useState('Drop');
  const [gerando, setGerando] = useState(false);

  const insets = useSafeAreaInsets();
  const carregar = useCallback(() => {
    api.listPecas().then((r) => setSemDrop(
      r.pecas.filter((p) => p.drop_id == null && p.origem === 'manual').length)).catch(() => {});
  }, []);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  const previa = useMemo(() => {
    const v = inteiro(valor);
    if (!semDrop || !v) return null;
    const k = modo === 'qtd_drops' ? Math.min(v, semDrop) : Math.ceil(semDrop / v);
    const base = Math.floor(semDrop / k);
    const resto = semDrop % k;
    const tamanhos = Array.from({ length: k }, (_, i) => base + (i < resto ? 1 : 0));
    return { k, min: Math.min(...tamanhos), max: Math.max(...tamanhos) };
  }, [valor, modo, semDrop]);

  async function gerar() {
    const v = inteiro(valor);
    if (!v) { Alert.alert('Ops', 'Informe um número maior que zero.'); return; }
    setGerando(true);
    try {
      const req = {
        [modo]: v,
        data_inicio: inicio.trim() || hojeISO(),
        intervalo_dias: inteiro(intervalo) || 7,
        prefixo_nome: prefixo.trim() || 'Drop',
        peca_ids: null,
        status: 'agendado',
      };
      const r = await api.gerarDrops(req);
      if (!r.ok) { Alert.alert('Ops', r.erro || 'Não consegui gerar.'); return; }
      Alert.alert('Pronto! 🎉', `Gerei ${r.drops.length} drop${r.drops.length === 1 ? '' : 's'} e distribuí as peças.`, [
        { text: 'Ver drops', onPress: () => nav.navigate('Drops') },
      ]);
    } catch {
      Alert.alert('Ops', 'Não consegui gerar os drops.');
    } finally {
      setGerando(false);
    }
  }

  return (
    <ScrollView style={styles.tela} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 24 }}
      keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <Aparece>
        <Card style={{ gap: 6 }}>
          <Text style={styles.destaqueNum}>{semDrop}</Text>
          <Text style={styles.destaqueTxt}>peça{semDrop === 1 ? '' : 's'} sem drop pra distribuir</Text>
        </Card>
      </Aparece>

      <Aparece delay={40}>
        <Card style={{ gap: 14 }}>
          <View>
            <Text style={styles.label}>Como dividir</Text>
            <View style={styles.toggle}>
              <TouchableOpacity onPress={() => setModo('qtd_drops')}
                style={[styles.toggleBtn, modo === 'qtd_drops' && styles.toggleOn]}>
                <Text style={[styles.toggleTxt, modo === 'qtd_drops' && styles.toggleTxtOn]}>Nº de drops</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setModo('por_drop')}
                style={[styles.toggleBtn, modo === 'por_drop' && styles.toggleOn]}>
                <Text style={[styles.toggleTxt, modo === 'por_drop' && styles.toggleTxtOn]}>Peças por drop</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View>
            <Text style={styles.label}>{modo === 'qtd_drops' ? 'Quantos drops' : 'Quantas peças por drop'}</Text>
            <TextInput value={valor} onChangeText={setValor} keyboardType="numeric" style={styles.input} />
          </View>

          {previa && (
            <Text style={styles.previa}>
              → {previa.k} drop{previa.k === 1 ? '' : 's'} de {previa.min === previa.max ? previa.min : `${previa.min}–${previa.max}`} peças
            </Text>
          )}

          <CampoData label="Primeiro drop em" valor={inicio} onChange={setInicio} />

          <View>
            <Text style={styles.label}>Intervalo entre drops (dias)</Text>
            <TextInput value={intervalo} onChangeText={setIntervalo} keyboardType="numeric" style={styles.input} />
            <Text style={styles.dica}>7 = semanal · 14 = quinzenal</Text>
          </View>

          <View>
            <Text style={styles.label}>Nome dos drops</Text>
            <TextInput value={prefixo} onChangeText={setPrefixo} style={styles.input} />
            <Text style={styles.dica}>vira "{prefixo || 'Drop'} 1", "{prefixo || 'Drop'} 2"…</Text>
          </View>

          <Botao title="Gerar e distribuir" onPress={gerar} loading={gerando} disabled={!semDrop} />
        </Card>
      </Aparece>

      <Text style={styles.rodape}>
        As peças são embaralhadas e repartidas o mais uniforme possível. Depois dá pra ajustar
        peça por peça em cada drop.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg },
  destaqueNum: { color: colors.marca, fontSize: 40, fontWeight: '900' },
  destaqueTxt: { color: colors.textoFraco, fontSize: 14 },
  label: { color: colors.textoFraco, fontSize: 12, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase' },
  toggle: { flexDirection: 'row', backgroundColor: colors.card2, borderRadius: 10, padding: 4, gap: 4 },
  toggleBtn: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center' },
  toggleOn: { backgroundColor: colors.marca },
  toggleTxt: { color: colors.textoFraco, fontSize: 13, fontWeight: '600' },
  toggleTxtOn: { color: '#FFFFFF', fontWeight: '700' },
  input: { backgroundColor: colors.card2, color: colors.texto, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border, fontSize: 16 },
  previa: { color: colors.laranjaClaro, fontSize: 14, fontWeight: '700' },
  dica: { color: colors.textoFraco, fontSize: 12, marginTop: 6 },
  rodape: { color: colors.textoFraco, fontSize: 12, lineHeight: 18, paddingHorizontal: 4 },
});
