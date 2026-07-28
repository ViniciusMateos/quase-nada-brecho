import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { DARK, LIGHT, type Cores } from '@/theme';

const CHAVE = 'brecho_tema';   // 'dark' | 'light'

type Ctx = {
  colors: Cores;
  isDark: boolean;
  toggleTheme: () => void;
  cover: Animated.Value;
  coverColor: string;
};
const ThemeContext = createContext<Ctx | null>(null);

/**
 * Tema do app com troca animada. A "cortina" (uma View sólida na cor de fundo do
 * tema de DESTINO) sobe e desce numa sequência contínua no driver nativo, e a
 * troca do tema é disparada perto do pico — o re-render pesado acontece escondido
 * atrás da cortina, sem ela ter que esperar/travar. Portado do Quase Nada Lembretes.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(true);          // padrão: escuro (a identidade do brechó)
  const [pronto, setPronto] = useState(false);         // gate: espera ler a preferência salva

  // lê a preferência salva (async) antes de mostrar o app, pra não piscar dark→light
  useEffect(() => {
    let vivo = true;
    SecureStore.getItemAsync(CHAVE)
      .then((v) => { if (vivo && v === 'light') setIsDark(false); })
      .catch(() => {})
      .finally(() => { if (vivo) setPronto(true); });
    return () => { vivo = false; };
  }, []);

  const cover = useRef(new Animated.Value(0)).current;
  const [coverColor, setCoverColor] = useState(DARK.bg);
  const animando = useRef(false);
  const trocaRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (trocaRef.current) clearTimeout(trocaRef.current); }, []);

  const toggleTheme = () => {
    if (animando.current) return;   // toques repetidos não empilham animação
    animando.current = true;

    const next = !isDark;
    setCoverColor((next ? DARK : LIGHT).bg);   // cortina na cor do tema de destino
    cover.setValue(0);

    Animated.sequence([
      Animated.timing(cover, { toValue: 1, duration: 220, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(cover, { toValue: 0, duration: 340, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start(() => { animando.current = false; });

    // troca perto do pico (cortina quase opaca) — re-render escondido
    trocaRef.current = setTimeout(() => {
      setIsDark(next);
      SecureStore.setItemAsync(CHAVE, next ? 'dark' : 'light').catch(() => {});
    }, 190);
  };

  const colors = useMemo(() => (isDark ? DARK : LIGHT), [isDark]);
  const value = useMemo<Ctx>(
    () => ({ colors, isDark, toggleTheme, cover, coverColor }),
    [colors, isDark, coverColor],   // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <ThemeContext.Provider value={value}>
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        {pronto ? children : null}
        <ThemeCover />
      </View>
    </ThemeContext.Provider>
  );
}

/** Cortina do tema. Renderize dentro de todo Modal que possa estar aberto na troca. */
export function ThemeCover() {
  const ctx = useContext(ThemeContext);
  if (!ctx) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: ctx.coverColor, opacity: ctx.cover }]}
    />
  );
}

export function useTheme(): Ctx {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme deve ser usado dentro de ThemeProvider');
  return ctx;
}

const styles = StyleSheet.create({ root: { flex: 1 } });
