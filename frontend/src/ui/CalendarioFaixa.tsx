import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { type Cores } from '@/theme';
import { useTheme } from '@/theme-context';
import { useI18n } from '@/i18n';

// Calendário de FAIXA (range): toca no dia inicial e depois no final; mostra a banda entre eles.
// Mesmo grid FIXO de 42 células (6 linhas) e a MESMA transição slide+fade do CampoData —
// altura não muda de mês pra mês. Entrega desde/ate em ISO (YYYY-MM-DD).

const WEEK_PT = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const WEEK_EN = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const p2 = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const brData = (s: string) => s.split('-').reverse().join('/');
function parseISO(s?: string | null): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}

// 42 células fixas (6 linhas): dias do mês + preenchimento dos meses vizinhos (fora=true).
// Mesma lógica do CampoData — garante altura constante independente do mês.
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

export function CalendarioFaixa({ visible, desde, ate, onClose, onAplicar }: {
  visible: boolean; desde: string | null; ate: string | null;
  onClose: () => void; onAplicar: (desde: string, ate: string) => void;
}) {
  const { colors } = useTheme();
  const { lang, t } = useI18n();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const hoje = new Date();
  const [ref, setRef] = useState({ ano: hoje.getFullYear(), mes: hoje.getMonth() });
  const [inicio, setInicio] = useState<Date | null>(null);
  const [fim, setFim] = useState<Date | null>(null);
  const cells = useMemo(() => grid(ref.ano, ref.mes), [ref]);

  // transição slide+fade ao trocar de mês (igual CampoData / calendário de vendas)
  const slideX = useRef(new Animated.Value(0)).current;
  const gridOp = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) return;
    const di = parseISO(desde);
    const df = parseISO(ate);
    setInicio(di);
    setFim(df && di && df.getTime() !== di.getTime() ? df : null);
    if (di) setRef({ ano: di.getFullYear(), mes: di.getMonth() });
  }, [visible]);  // eslint-disable-line react-hooks/exhaustive-deps

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
  function tocar(d: Date) {
    if (!inicio || (inicio && fim)) { setInicio(d); setFim(null); return; }   // (re)começa a faixa
    if (d.getTime() < inicio.getTime()) { setInicio(d); setFim(null); return; }
    setFim(d);
  }

  const WEEK = lang === 'en' ? WEEK_EN : WEEK_PT;
  const nomeMes = new Date(ref.ano, ref.mes, 1)
    .toLocaleDateString(lang === 'en' ? 'en-US' : 'pt-BR', { month: 'long', year: 'numeric' });
  const t0 = inicio?.getTime();
  const t1 = fim?.getTime();
  const rotulo = inicio
    ? (fim ? `${brData(iso(inicio))} – ${brData(iso(fim))}` : brData(iso(inicio)))
    : t('dashboard.periodPick');

  // 42 células → 6 linhas de 7 (flex:1) — alinhamento garantido e altura fixa
  const linhas: typeof cells[] = [];
  for (let i = 0; i < cells.length; i += 7) linhas.push(cells.slice(i, i + 7));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.fundo} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.head}>
            <TouchableOpacity onPress={() => trocar(-1)} hitSlop={12} style={styles.nav}>
              <Ionicons name="chevron-back" size={22} color={colors.marca} />
            </TouchableOpacity>
            <Text style={styles.mes}>{nomeMes}</Text>
            <TouchableOpacity onPress={() => trocar(1)} hitSlop={12} style={styles.nav}>
              <Ionicons name="chevron-forward" size={22} color={colors.marca} />
            </TouchableOpacity>
          </View>

          <View style={styles.semanaRow}>
            {WEEK.map((d, i) => <Text key={i} style={styles.semanaTxt}>{d}</Text>)}
          </View>
          <Animated.View style={{ opacity: gridOp, transform: [{ translateX: slideX }] }}>
            {linhas.map((wk, wi) => (
              <View key={wi} style={styles.semanaGrid}>
                {wk.map((c, di) => {
                  const d = new Date(c.ano, c.mes, c.day);
                  const td = d.getTime();
                  const ini = t0 != null && td === t0;
                  const f = t1 != null && td === t1;
                  const naFaixa = t0 != null && t1 != null && td >= t0 && td <= t1;
                  const meio = naFaixa && !ini && !f;
                  return (
                    <View key={di} style={styles.cell}>
                      {meio ? <View style={styles.banda} /> : null}
                      {ini && t1 != null ? <View style={[styles.banda, styles.bandaDir]} /> : null}
                      {f ? <View style={[styles.banda, styles.bandaEsq]} /> : null}
                      <Pressable style={[styles.diaBolha, (ini || f) && styles.diaEndpoint]}
                        onPress={() => { if (!c.fora) tocar(d); }}>
                        <Text style={[styles.diaTxt, c.fora && styles.diaFora, (ini || f) && styles.diaTxtOn]}>{c.day}</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            ))}
          </Animated.View>

          <Text style={styles.rotulo}>{rotulo}</Text>
          <View style={styles.footer}>
            <TouchableOpacity hitSlop={8} onPress={() => { setInicio(null); setFim(null); }}>
              <Text style={styles.limpar}>{t('dashboard.periodClear')}</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            <TouchableOpacity style={[styles.aplicarBtn, !inicio && { opacity: 0.4 }]} disabled={!inicio}
              onPress={() => inicio && onAplicar(iso(inicio), iso(fim || inicio))}>
              <Text style={styles.aplicarTxt}>{t('dashboard.periodApply')}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (colors: Cores) => StyleSheet.create({
  fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 360, backgroundColor: colors.card, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: colors.border },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  nav: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  mes: { color: colors.texto, fontSize: 16, fontWeight: '800', textTransform: 'capitalize' },
  semanaRow: { flexDirection: 'row', marginBottom: 4 },
  semanaTxt: { flex: 1, textAlign: 'center', color: colors.textoFraco, fontSize: 12, fontWeight: '700' },
  semanaGrid: { flexDirection: 'row' },
  cell: { flex: 1, height: 42, alignItems: 'center', justifyContent: 'center' },
  banda: { position: 'absolute', top: 4, height: 34, left: 0, right: 0, backgroundColor: colors.card2 },
  bandaDir: { left: '50%', right: 0 },      // início: banda só pra direita
  bandaEsq: { left: 0, right: '50%' },      // fim: banda só pra esquerda
  diaBolha: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  diaEndpoint: { backgroundColor: colors.marca },
  diaTxt: { color: colors.texto, fontSize: 15 },
  diaFora: { color: colors.textoFraco, opacity: 0.5 },
  diaTxtOn: { color: '#FFFFFF', fontWeight: '800' },
  rotulo: { color: colors.texto, fontSize: 14, fontWeight: '700', textAlign: 'center', marginTop: 12 },
  footer: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  limpar: { color: colors.textoFraco, fontSize: 14, fontWeight: '600' },
  aplicarBtn: { backgroundColor: colors.marca, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  aplicarTxt: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});
