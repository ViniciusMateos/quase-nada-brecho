import React, { useMemo, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { type Cores } from '@/theme';
import { useTheme } from '@/theme-context';
import { useI18n } from '@/i18n';

// Campo de data: dá pra digitar (DD/MM/AAAA, com máscara) OU tocar no calendário.
// Guarda/entrega no formato ISO (AAAA-MM-DD) pro backend; mostra em DD/MM/AAAA.

const WEEK_PT = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const WEEK_EN = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MESES_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MESES_EN = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const p2 = (n: number) => String(n).padStart(2, '0');
const toISO = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

function isoToBR(iso?: string | null) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}
function brToISO(br: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br || '');
  if (!m) return null;
  const d = +m[1], mo = +m[2], y = +m[3];
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}
function mask(t: string) {
  const d = t.replace(/\D/g, '').slice(0, 8);
  let o = d.slice(0, 2);
  if (d.length > 2) o += '/' + d.slice(2, 4);
  if (d.length > 4) o += '/' + d.slice(4, 8);
  return o;
}
function parseISO(iso?: string | null): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}

export function CampoData({
  label, valor, onChange, placeholder,
}: { label?: string; valor: string; onChange: (iso: string) => void; placeholder?: string }) {
  const { colors } = useTheme();
  const { lang } = useI18n();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [texto, setTexto] = useState(isoToBR(valor));
  const [aberto, setAberto] = useState(false);

  // sincroniza quando o valor muda por fora (ex.: escolha no calendário de outro lugar)
  const ultimo = useRef(valor);
  if (valor !== ultimo.current) {
    ultimo.current = valor;
    const br = isoToBR(valor);
    if (br !== texto) setTexto(br);
  }

  function digitar(t: string) {
    const m = mask(t);
    setTexto(m);
    const iso = brToISO(m);
    if (iso) onChange(iso);
    else if (m === '') onChange('');
  }
  function escolher(d: Date) {
    const iso = toISO(d);
    setTexto(isoToBR(iso));
    onChange(iso);
    setAberto(false);
  }

  const selecionada = parseISO(brToISO(texto));

  return (
    <View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.inputRow}>
        <TextInput
          value={texto} onChangeText={digitar} keyboardType="numeric" maxLength={10}
          placeholder={placeholder || (lang === 'en' ? 'DD/MM/YYYY' : 'DD/MM/AAAA')} placeholderTextColor={colors.textoFraco}
          style={styles.input} />
        <TouchableOpacity style={styles.calBtn} onPress={() => setAberto(true)} activeOpacity={0.8}>
          <Ionicons name="calendar" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <Modal visible={aberto} transparent animationType="fade" onRequestClose={() => setAberto(false)}>
        <Pressable style={styles.fundo} onPress={() => setAberto(false)}>
          <Pressable style={styles.calCard} onPress={(e) => e.stopPropagation()}>
            <Calendario selecionada={selecionada} onSelect={escolher} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function grid(ano: number, mes: number) {
  const first = new Date(ano, mes, 1).getDay();
  const dias = new Date(ano, mes + 1, 0).getDate();
  const diasPrev = new Date(ano, mes, 0).getDate();
  const cells: { day: number; mes: number; ano: number; fora: boolean }[] = [];
  for (let i = first - 1; i >= 0; i--) {
    cells.push({ day: diasPrev - i, mes: mes === 0 ? 11 : mes - 1, ano: mes === 0 ? ano - 1 : ano, fora: true });
  }
  for (let d = 1; d <= dias; d++) cells.push({ day: d, mes, ano, fora: false });
  const rest = 42 - cells.length;
  for (let d = 1; d <= rest; d++) {
    cells.push({ day: d, mes: mes === 11 ? 0 : mes + 1, ano: mes === 11 ? ano + 1 : ano, fora: true });
  }
  return cells;
}

function Calendario({ selecionada, onSelect }: { selecionada: Date | null; onSelect: (d: Date) => void }) {
  const { colors } = useTheme();
  const { lang } = useI18n();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const WEEK = lang === 'en' ? WEEK_EN : WEEK_PT;
  const MESES = lang === 'en' ? MESES_EN : MESES_PT;
  const hoje = new Date();
  // mês+ano num estado só: o wrap (dez→jan) acontece DENTRO do updater, com o valor atual —
  // assim cliques rápidos nunca deixam o mês passar de 0-11 (era isso que sumia o nome do mês).
  const [ref, setRef] = useState({
    ano: selecionada ? selecionada.getFullYear() : hoje.getFullYear(),
    mes: selecionada ? selecionada.getMonth() : hoje.getMonth(),
  });
  const { ano, mes } = ref;
  const cells = useMemo(() => grid(ano, mes), [ano, mes]);

  // desliza pro lado ao trocar de mês (avançar entra da direita, voltar da esquerda).
  // Sem trava: igual ao calendário de vendas — clicou de novo, já vira o mês na hora.
  const slideX = useRef(new Animated.Value(0)).current;
  const gridOp = useRef(new Animated.Value(1)).current;
  function trocar(dir: number) {
    Animated.parallel([
      Animated.timing(slideX, { toValue: -dir * 40, duration: 120, useNativeDriver: true }),
      Animated.timing(gridOp, { toValue: 0, duration: 120, useNativeDriver: true }),
    ]).start(() => {
      setRef((r) => {
        let m = r.mes + dir, a = r.ano;
        if (m < 0) { m = 11; a--; } else if (m > 11) { m = 0; a++; }
        return { ano: a, mes: m };
      });
      slideX.setValue(dir * 40);
      Animated.parallel([
        Animated.spring(slideX, { toValue: 0, useNativeDriver: true, tension: 90, friction: 11 }),
        Animated.timing(gridOp, { toValue: 1, duration: 190, useNativeDriver: true }),
      ]).start();
    });
  }

  return (
    <View>
      <View style={styles.calHead}>
        <TouchableOpacity onPress={() => trocar(-1)} hitSlop={12} style={styles.nav}>
          <Ionicons name="chevron-back" size={22} color={colors.marca} />
        </TouchableOpacity>
        <Text style={styles.calMes}>{MESES[mes]} {ano}</Text>
        <TouchableOpacity onPress={() => trocar(1)} hitSlop={12} style={styles.nav}>
          <Ionicons name="chevron-forward" size={22} color={colors.marca} />
        </TouchableOpacity>
      </View>
      <View style={styles.semana}>
        {WEEK.map((d, i) => <Text key={i} style={styles.semanaTxt}>{d}</Text>)}
      </View>
      <Animated.View style={[styles.gridWrap, { opacity: gridOp, transform: [{ translateX: slideX }] }]}>
        {cells.map((c, i) => {
          const sel = !!selecionada && !c.fora && c.day === selecionada.getDate()
            && c.mes === selecionada.getMonth() && c.ano === selecionada.getFullYear();
          const hj = c.day === hoje.getDate() && c.mes === hoje.getMonth() && c.ano === hoje.getFullYear();
          return (
            <Pressable key={i} style={styles.cell} onPress={() => { if (!c.fora) onSelect(new Date(c.ano, c.mes, c.day)); }}>
              <View style={[styles.cellInner, sel && styles.cellSel]}>
                <Text style={[styles.cellTxt, c.fora && styles.cellFora, sel && styles.cellTxtSel,
                  hj && !sel && styles.cellHoje]}>{c.day}</Text>
              </View>
              {hj && !sel ? <View style={styles.hojeDot} /> : null}
            </Pressable>
          );
        })}
      </Animated.View>
    </View>
  );
}

const makeStyles = (colors: Cores) => StyleSheet.create({
  label: { color: colors.textoFraco, fontSize: 12, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, backgroundColor: colors.card2, color: colors.texto, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border, fontSize: 16 },
  calBtn: { width: 46, height: 46, borderRadius: 10, backgroundColor: colors.marca, alignItems: 'center', justifyContent: 'center' },
  fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  calCard: { width: '100%', maxWidth: 360, backgroundColor: colors.card, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: colors.border },
  calHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  nav: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  calMes: { color: colors.texto, fontSize: 16, fontWeight: '800' },
  semana: { flexDirection: 'row', marginBottom: 6 },
  semanaTxt: { flex: 1, textAlign: 'center', color: colors.textoFraco, fontSize: 12, fontWeight: '700' },
  gridWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: 42, alignItems: 'center', justifyContent: 'center' },
  cellInner: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  cellSel: { backgroundColor: colors.marca },
  cellTxt: { color: colors.texto, fontSize: 15 },
  cellFora: { color: colors.textoFraco, opacity: 0.5 },
  cellTxtSel: { color: '#FFFFFF', fontWeight: '800' },
  cellHoje: { color: colors.marca, fontWeight: '800' },
  hojeDot: { position: 'absolute', bottom: 4, width: 4, height: 4, borderRadius: 2, backgroundColor: colors.marca },
});
