import React, { useEffect, useRef, useState } from 'react';
import {
  Animated, Dimensions, Easing, Keyboard, Modal, PanResponder, Platform, Pressable,
  StyleSheet, View, ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/theme';

const H = Dimensions.get('window').height;

// Sheet que sobe de baixo, com barrinha (grabber) e arrastar-pra-baixo pra fechar.
// Usado em todos os modais que sobem a tela. Tudo animado (sem o slide padrão).
export function BottomSheet({
  visible, onClose, children, footer, style,
}: { visible: boolean; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; style?: ViewStyle }) {
  const insets = useSafeAreaInsets();
  const ty = useRef(new Animated.Value(H)).current;
  const backdrop = useRef(new Animated.Value(0)).current;
  const [montado, setMontado] = useState(false);
  const [tecladoAberto, setTecladoAberto] = useState(false);
  const kbAnim = useRef(new Animated.Value(0)).current;   // altura do teclado (empurra a sheet)
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const mostrar = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const esconder = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s = Keyboard.addListener(mostrar, (e) => {
      setTecladoAberto(true);
      Animated.timing(kbAnim, { toValue: e.endCoordinates?.height ?? 0, duration: e.duration || 220, useNativeDriver: false }).start();
    });
    const h = Keyboard.addListener(esconder, (e) => {
      setTecladoAberto(false);
      Animated.timing(kbAnim, { toValue: 0, duration: e.duration || 220, useNativeDriver: false }).start();
    });
    return () => { s.remove(); h.remove(); };
  }, [kbAnim]);

  useEffect(() => {
    if (visible) {
      setMontado(true);
      ty.setValue(H);
      backdrop.setValue(0);
      // começa sempre com o teclado "fechado" (senão herda a altura da sessão anterior
      // e os botões abrem no meio da tela)
      kbAnim.setValue(0);
      setTecladoAberto(false);
      // deixa o conteúdo montar/medir antes de subir (senão trava no 1º frame da animação)
      const id = requestAnimationFrame(() => {
        Animated.parallel([
          Animated.timing(backdrop, { toValue: 1, duration: 200, useNativeDriver: true }),
          Animated.spring(ty, {
            toValue: 0, useNativeDriver: true, tension: 68, friction: 12,
            restDisplacementThreshold: 0.4, restSpeedThreshold: 0.4,
          }),
        ]).start();
      });
      return () => cancelAnimationFrame(id);
    }
    if (montado) {
      Keyboard.dismiss();   // fecha o teclado junto com a sheet
      Animated.parallel([
        Animated.timing(backdrop, { toValue: 0, duration: 170, useNativeDriver: true }),
        Animated.timing(ty, { toValue: H, duration: 210, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      ]).start(() => setMontado(false));
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 3,
      onPanResponderMove: (_, g) => { if (g.dy > 0) ty.setValue(g.dy); },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 90 || g.vy > 0.8) {
          // desce direto de onde soltou (sem round-trip de estado) e só então fecha
          Animated.parallel([
            Animated.timing(backdrop, { toValue: 0, duration: 170, useNativeDriver: true }),
            Animated.timing(ty, { toValue: H, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          ]).start(() => onCloseRef.current());
        } else {
          Animated.spring(ty, { toValue: 0, useNativeDriver: true, tension: 68, friction: 12 }).start();
        }
      },
    }),
  ).current;

  if (!montado) return null;

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdrop }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        {/* fundo da cor do card ATRÁS do teclado — a sheet cola nele e some os cantos pretos */}
        <Animated.View pointerEvents="none"
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: kbAnim, backgroundColor: colors.card }} />
        <Animated.View style={[styles.wrap, { paddingBottom: kbAnim }]} pointerEvents="box-none">
          <Animated.View style={[styles.sheet, { transform: [{ translateY: ty }] }, style]}>
            <View {...pan.panHandlers} style={styles.grabberArea}>
              <View style={styles.grabber} />
            </View>
            {children}
            {footer ? (
              <View style={[styles.footer, { paddingBottom: tecladoAberto ? 12 : insets.bottom + 12 }]}>{footer}</View>
            ) : (
              <View style={{ height: tecladoAberto ? 8 : insets.bottom + 16 }} />
            )}
          </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: colors.card, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 16, maxHeight: '92%',
  },
  corpo: { flexShrink: 1 },
  // rodapé fixo (ações) colado acima do teclado — preenche a base e some os "buracos"
  footer: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, gap: 10, backgroundColor: colors.card },
  grabberArea: { alignItems: 'center', paddingTop: 12, paddingBottom: 14 },
  grabber: { width: 44, height: 5, borderRadius: 3, backgroundColor: colors.textoFraco },
});
