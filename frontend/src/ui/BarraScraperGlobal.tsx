import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, RunInfo } from '@/lib/api';
import { colors } from '@/theme';
import { LoadingDog } from '@/ui/LoadingDog';
import { interacaoBus } from '@/ui/interacaoBus';

const ativaRun = (r: RunInfo) => r.status === 'rodando' || r.status === 'iniciando';
const BOLHA = 62;     // diâmetro da bolha colapsada
const MARGEM = 10;    // distância das bordas quando cola na lateral

/**
 * Indicador flutuante GLOBAL do scraper/conexão. Dois estados, com animação:
 *   • BARRA  — pílula embaixo com título + % + barra (estado "aberto"). Aparece assim
 *     quando começa um processo; tocar abre a tela da Run.
 *   • BOLHA  — bolinha com o logo girando + % (estado "de cantinho"). Recolhe sozinha
 *     quando o usuário toca/scrolla a tela; é arrastável, cola na lateral (esq/dir),
 *     sobe/desce, e pode ser jogada pro outro lado. Tocar nela expande de volta.
 */
export function BarraScraperGlobal({ onAbrir }: { onAbrir?: (runId: string) => void }) {
  const insets = useSafeAreaInsets();
  const win = Dimensions.get('window');
  const [run, setRun] = useState<RunInfo | null>(null);
  const [modo, setModo] = useState<'barra' | 'bolha'>('barra');
  const [montado, setMontado] = useState(false);   // renderiza enquanto ativo OU saindo
  const runRef = useRef<RunInfo | null>(null);      // último run (renderiza durante a saída)
  const modoRef = useRef(modo);
  modoRef.current = modo;                            // modo fresco pra saída (fora do closure do efeito)

  const barAnim = useRef(new Animated.Value(0)).current;     // 0→1 entrada da barra
  const bolhaAnim = useRef(new Animated.Value(0)).current;   // 0→1 entrada da bolha
  const inicial = { x: win.width - BOLHA - MARGEM, y: win.height * 0.55 };
  const pos = useRef(new Animated.ValueXY(inicial)).current; // posição visual da bolha
  const posRef = useRef({ ...inicial });    // posição absoluta corrente (fonte da verdade, em JS)
  const dragStart = useRef({ x: 0, y: 0 }); // posição no momento em que pega pra arrastar
  const grace = useRef(0);      // ignora "recolher" logo após expandir/aparecer
  const movido = useRef(0);     // distância arrastada (pra distinguir toque de arrasto)
  const insetsRef = useRef(insets);
  insetsRef.current = insets;   // insets sempre frescos dentro do PanResponder

  // poll dos runs ativos
  useEffect(() => {
    let vivo = true;
    const tick = async () => {
      try {
        const runs = await api.listRuns();
        const r = runs.filter(ativaRun).sort((a, b) => b.started_at - a.started_at)[0] ?? null;
        if (vivo) setRun(r);
      } catch { /* offline / sem server */ }
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => { vivo = false; clearInterval(id); };
  }, []);

  const ativo = !!run;
  if (run) runRef.current = run;          // guarda o último run pra renderizar durante a saída
  const dados = run ?? runRef.current;

  // aparece (barra, animado) quando surge um processo; SAI animado quando acaba
  useEffect(() => {
    if (ativo) {
      setMontado(true);
      setModo('barra');
      grace.current = Date.now() + 1000;
      pos.setValue(posRef.current);       // bolha num ponto válido (evita começar off-screen de uma saída anterior)
      bolhaAnim.setValue(0);
      barAnim.setValue(0);
      Animated.spring(barAnim, { toValue: 1, useNativeDriver: false, friction: 8, tension: 70 }).start();
    } else {
      sair();
    }
  }, [ativo]);  // eslint-disable-line react-hooks/exhaustive-deps

  // recolhe em bolha quando o usuário toca/scrolla a tela
  useEffect(() => {
    return interacaoBus.ouvir(() => {
      if (!ativo || modo !== 'barra' || Date.now() < grace.current) return;
      recolher();
    });
  }, [ativo, modo]);  // eslint-disable-line react-hooks/exhaustive-deps

  function recolher() {
    setModo('bolha');
    Animated.parallel([
      Animated.timing(barAnim, { toValue: 0, duration: 180, useNativeDriver: false }),
      Animated.spring(bolhaAnim, { toValue: 1, useNativeDriver: false, friction: 7, tension: 80 }),
    ]).start();
  }

  function expandir() {
    grace.current = Date.now() + 1000;
    setModo('barra');
    Animated.parallel([
      Animated.timing(bolhaAnim, { toValue: 0, duration: 150, useNativeDriver: false }),
      Animated.spring(barAnim, { toValue: 1, useNativeDriver: false, friction: 8, tension: 70 }),
    ]).start();
  }

  // saída animada quando o processo acaba: a barra DESCE e some; a bolha DESLIZA pra
  // fora da lateral onde estiver. Só desmonta (para de renderizar) no fim da animação.
  function sair() {
    const fim = (r: { finished: boolean }) => { if (r.finished) setMontado(false); };
    if (modoRef.current === 'barra') {
      Animated.timing(barAnim, {
        toValue: 0, duration: 320, easing: Easing.in(Easing.cubic), useNativeDriver: false,
      }).start(fim);
    } else {
      const w = Dimensions.get('window');
      const foraX = posRef.current.x + BOLHA / 2 < w.width / 2 ? -BOLHA - MARGEM * 2 : w.width + MARGEM * 2;
      Animated.parallel([
        Animated.timing(pos.x, { toValue: foraX, duration: 340, easing: Easing.in(Easing.cubic), useNativeDriver: false }),
        Animated.timing(bolhaAnim, { toValue: 0, duration: 340, useNativeDriver: false }),
      ]).start((r) => { pos.setValue(posRef.current); fim(r); });  // reseta pos pro último ponto válido
    }
  }

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3,
    onPanResponderGrant: () => {
      movido.current = 0;
      // captura a posição visual EXATA (para qualquer spring em andamento) como base do arrasto
      pos.stopAnimation((v: { x: number; y: number }) => {
        dragStart.current = { x: v.x, y: v.y };
        posRef.current = { x: v.x, y: v.y };
      });
    },
    onPanResponderMove: (_, g) => {
      movido.current = Math.max(movido.current, Math.abs(g.dx) + Math.abs(g.dy));
      const nx = dragStart.current.x + g.dx;   // posição ABSOLUTA (sem offset)
      const ny = dragStart.current.y + g.dy;
      posRef.current = { x: nx, y: ny };
      pos.setValue({ x: nx, y: ny });
    },
    onPanResponderRelease: (_, g) => {
      if (movido.current < 6) { expandir(); return; }  // foi toque, não arrasto → expande
      const w = Dimensions.get('window');
      const ins = insetsRef.current;
      const cx = posRef.current.x + BOLHA / 2;
      // fling: a velocidade decide o lado; senão, o lado mais próximo
      const paraDir = g.vx > 0.3 ? true : g.vx < -0.3 ? false : cx > w.width / 2;
      const destX = paraDir ? w.width - BOLHA - MARGEM : MARGEM;
      const minY = ins.top + 6;
      const maxY = w.height - BOLHA - ins.bottom - 6;
      const destY = Math.max(minY, Math.min(maxY, posRef.current.y));  // MANTÉM o Y arrastado
      posRef.current = { x: destX, y: destY };
      Animated.spring(pos, {
        toValue: { x: destX, y: destY }, useNativeDriver: false, friction: 7, tension: 60,
      }).start();
    },
  })).current;

  if (!montado || !dados) return null;
  const p = dados.progress;
  const pct = p && p.total ? Math.max(0, Math.min(100, Math.round((p.done / p.total) * 100))) : null;
  const titulo = dados.titulo ?? 'Raspando o brechó';

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* BARRA (aberta, embaixo) */}
      <Animated.View
        pointerEvents={modo === 'barra' ? 'box-none' : 'none'}
        style={[styles.barraWrap, {
          bottom: insets.bottom + 10,
          opacity: barAnim,
          transform: [{ translateY: barAnim.interpolate({ inputRange: [0, 1], outputRange: [90, 0] }) }],
        }]}>
        <Pressable style={styles.pill} onPress={() => onAbrir?.(dados.id)}>
          <LoadingDog size={26} />
          <View style={{ flex: 1, gap: 5 }}>
            <Text style={styles.titulo} numberOfLines={1}>
              {pct != null ? `${titulo} · ${pct}%` : `${titulo}…`}
            </Text>
            {p && p.total ? (
              <>
                <View style={styles.trilho}>
                  <View style={[styles.preenchido, { width: `${pct ?? 0}%` }]} />
                </View>
                <Text style={styles.sub} numberOfLines={1}>
                  {p.done}/{p.total}{p.label ? `  ·  ${p.label}` : ''}
                </Text>
              </>
            ) : (
              <View style={styles.trilho} />
            )}
          </View>
        </Pressable>
      </Animated.View>

      {/* BOLHA (de cantinho, arrastável) */}
      <Animated.View
        pointerEvents={modo === 'bolha' ? 'auto' : 'none'}
        {...pan.panHandlers}
        style={[styles.bolhaWrap, {
          opacity: bolhaAnim,
          transform: [
            { translateX: pos.x },
            { translateY: pos.y },
            { scale: bolhaAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
          ],
        }]}>
        <View style={styles.bolha}>
          <LoadingDog size={28} />
          <Text style={styles.bolhaPct}>{pct != null ? `${pct}%` : '···'}</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  barraWrap: { position: 'absolute', left: 12, right: 12 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card,
    borderRadius: 16, borderWidth: 1, borderColor: colors.marca, paddingVertical: 12, paddingHorizontal: 14,
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 10,
  },
  titulo: { color: colors.texto, fontSize: 14, fontWeight: '800' },
  trilho: { height: 7, borderRadius: 999, backgroundColor: colors.card2, overflow: 'hidden' },
  preenchido: { height: '100%', borderRadius: 999, backgroundColor: colors.marca },
  sub: { color: colors.textoFraco, fontSize: 11 },
  bolhaWrap: { position: 'absolute', top: 0, left: 0 },
  bolha: {
    width: BOLHA, height: BOLHA, borderRadius: BOLHA / 2, backgroundColor: colors.card,
    borderWidth: 1.5, borderColor: colors.marca, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 12,
  },
  bolhaPct: { color: colors.marca, fontSize: 11, fontWeight: '800', marginTop: -1 },
});
