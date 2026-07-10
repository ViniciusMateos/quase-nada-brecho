import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api, RunHistorico } from '@/lib/api';
import { colors } from '@/theme';
import { Aparece, Card } from '@/ui/components';
import { TelaCarregando } from '@/ui/LoadingDog';

type FiltroRes = 'todas' | 'ok' | 'bloqueio' | 'erro' | 'parado';
type Periodo = 'tudo' | '7d' | '30d';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function fmtData(epoch: number | null) {
  if (!epoch) return '—';
  const d = new Date(epoch * 1000);
  const dia = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${dia}/${MESES[d.getMonth()]} · ${hh}:${mm}`;
}
function fmtDur(s: number | null) {
  if (s == null) return null;
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${Math.round(s % 60)}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
function resultado(r: RunHistorico): { icon: keyof typeof Ionicons.glyphMap; label: string; cor: string } {
  if (r.bloqueio) return { icon: 'ban', label: 'bloqueio', cor: colors.erro };
  if (r.status === 'erro') return { icon: 'close-circle', label: 'erro', cor: colors.erro };
  if (r.status === 'parado') return { icon: 'stop-circle', label: 'parado', cor: colors.textoFraco };
  return { icon: 'checkmark-circle', label: 'ok', cor: colors.ok };
}
function saldoTxt(r: RunHistorico): string {
  const s = r.saldo || {};
  return [
    `${s.atualizadas ?? 0} atualizadas`,
    `${s.reconciliadas ?? 0} relacionadas`,
    `${s.recem_vendidas ?? 0} vendidas`,
  ].join(' · ');
}

export function HistoricoScreen() {
  const [regs, setRegs] = useState<RunHistorico[] | null>(null);
  const [fRes, setFRes] = useState<FiltroRes>('todas');
  const [periodo, setPeriodo] = useState<Periodo>('tudo');
  const [tick, setTick] = useState(0);   // muda a cada clique em filtro → re-anima os cards

  const carregar = useCallback(() => {
    api.getRunsHistorico().then(setRegs).catch(() => setRegs([]));
  }, []);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  const selRes = (v: FiltroRes) => { setFRes(v); setTick((t) => t + 1); };
  const selPer = (v: Periodo) => { setPeriodo(v); setTick((t) => t + 1); };

  const filtrados = useMemo(() => {
    if (!regs) return [];
    const corte = periodo === 'tudo' ? 0 : Date.now() / 1000 - (periodo === '7d' ? 7 : 30) * 86400;
    return regs.filter((r) => {
      if (periodo !== 'tudo' && (r.ended_at ?? 0) < corte) return false;
      if (fRes === 'ok' && !(r.status === 'finalizado' && !r.bloqueio)) return false;
      if (fRes === 'bloqueio' && !r.bloqueio) return false;
      if (fRes === 'erro' && !(r.status === 'erro' && !r.bloqueio)) return false;
      if (fRes === 'parado' && r.status !== 'parado') return false;
      return true;
    });
  }, [regs, fRes, periodo]);

  const resumo = useMemo(() => {
    let atualizadas = 0, relacionadas = 0, vendidas = 0;
    for (const r of filtrados) {
      atualizadas += Number(r.saldo?.atualizadas ?? 0);
      relacionadas += Number(r.saldo?.reconciliadas ?? 0);
      vendidas += Number(r.saldo?.recem_vendidas ?? 0);
    }
    return { atualizadas, relacionadas, vendidas };
  }, [filtrados]);

  if (!regs) return <TelaCarregando />;

  return (
    <View style={styles.tela}>
      <View style={styles.header}>
        <Aparece>
          <Card style={styles.resumo}>
            <Bloco num={resumo.atualizadas} label="atualizadas" />
            <View style={styles.divisor} />
            <Bloco num={resumo.relacionadas} label="relacionadas" />
            <View style={styles.divisor} />
            <Bloco num={resumo.vendidas} label="vendidas" />
          </Card>
        </Aparece>
        <ChipRow valor={fRes} onSel={(v) => selRes(v as FiltroRes)}
          ops={[['todas', 'Todas'], ['ok', 'ok'], ['bloqueio', 'bloqueio'], ['erro', 'erro'], ['parado', 'parado']]} />
        <ChipRow valor={periodo} onSel={(v) => selPer(v as Periodo)}
          ops={[['tudo', 'Tudo'], ['7d', '7 dias'], ['30d', '30 dias']]} />
      </View>

      <FlatList
        key={tick}
        data={filtrados}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: 16, paddingTop: 18, gap: 8, paddingBottom: 24 }}
        ListEmptyComponent={<Text style={styles.vazio}>Nenhuma raspagem nesse filtro.</Text>}
        renderItem={({ item, index }) => {
          const res = resultado(item);
          const dur = fmtDur(item.duracao_s);
          return (
            <Aparece delay={Math.min(index, 8) * 40}>
              <Card style={{ gap: 6 }}>
                <View style={styles.topoLinha}>
                  <Text style={styles.titulo}>Raspagem{item.dry_run ? ' · simulação' : ''}</Text>
                  <View style={[styles.badge, { borderColor: res.cor }]}>
                    <Ionicons name={res.icon} size={13} color={res.cor} />
                    <Text style={[styles.badgeTxt, { color: res.cor }]}>{res.label}</Text>
                  </View>
                </View>
                <Text style={styles.saldo}>{saldoTxt(item)}</Text>
                <View style={styles.rodape}>
                  <Text style={styles.meta}>{fmtData(item.ended_at)}</Text>
                  {dur ? <Text style={styles.meta}>· {dur}</Text> : null}
                  {item.backfill ? <Text style={styles.metaFraco}>· importada</Text> : null}
                </View>
              </Card>
            </Aparece>
          );
        }}
      />
    </View>
  );
}

function Bloco({ num, label }: { num: number; label: string }) {
  return (
    <View>
      <Text style={styles.resumoNum}>{num}</Text>
      <Text style={styles.resumoLabel}>{label}</Text>
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const anima = (to: number) =>
    Animated.spring(scale, { toValue: to, useNativeDriver: true, friction: 6, tension: 140 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={() => anima(0.9)} onPressOut={() => anima(1)}>
      <Animated.View style={[styles.chip, on && styles.chipOn, { transform: [{ scale }] }]}>
        <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

function ChipRow({ valor, onSel, ops }:
  { valor: string; onSel: (v: string) => void; ops: [string, string][] }) {
  return (
    <View style={styles.chips}>
      {ops.map(([v, label]) => (
        <Chip key={v} label={label} on={valor === v} onPress={() => onSel(v)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10, gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  resumo: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  resumoNum: { color: colors.texto, fontSize: 22, fontWeight: '800' },
  resumoLabel: { color: colors.textoFraco, fontSize: 11 },
  divisor: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6,
  },
  chipOn: { backgroundColor: colors.marca, borderColor: colors.marca },
  chipTxt: { color: colors.texto, fontSize: 13 },
  chipTxtOn: { color: '#0F0F0F', fontWeight: '700' },
  topoLinha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  badgeTxt: { fontSize: 12, fontWeight: '700' },
  titulo: { color: colors.texto, fontSize: 16, fontWeight: '700', flex: 1 },
  saldo: { color: colors.textoFraco, fontSize: 13 },
  rodape: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  meta: { color: colors.textoFraco, fontSize: 12 },
  metaFraco: { color: colors.border, fontSize: 12 },
  vazio: { color: colors.textoFraco, textAlign: 'center', marginTop: 24 },
});
