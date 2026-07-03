import React, { useEffect, useRef, useState } from 'react';
import {
  Animated, Dimensions, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable,
  StyleSheet, View, ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/theme';

const H = Dimensions.get('window').height;

// Sheet que sobe de baixo, com barrinha (grabber) e arrastar-pra-baixo pra fechar.
// Usado em todos os modais que sobem a tela. Tudo animado (sem o slide padrão).
export function BottomSheet({
  visible, onClose, children, style,
}: { visible: boolean; onClose: () => void; children: React.ReactNode; style?: ViewStyle }) {
  const insets = useSafeAreaInsets();
  const ty = useRef(new Animated.Value(H)).current;
  const backdrop = useRef(new Animated.Value(0)).current;
  const [montado, setMontado] = useState(false);

  useEffect(() => {
    if (visible) {
      setMontado(true);
      Animated.parallel([
        Animated.timing(backdrop, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.spring(ty, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }),
      ]).start();
    } else if (montado) {
      Animated.parallel([
        Animated.timing(backdrop, { toValue: 0, duration: 160, useNativeDriver: true }),
        Animated.timing(ty, { toValue: H, duration: 200, useNativeDriver: true }),
      ]).start(() => setMontado(false));
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 3,
      onPanResponderMove: (_, g) => { if (g.dy > 0) ty.setValue(g.dy); },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 90 || g.vy > 0.9) {
          onClose();
        } else {
          Animated.spring(ty, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
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
        <KeyboardAvoidingView
          style={styles.wrap} pointerEvents="box-none"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + 16, transform: [{ translateY: ty }] }, style]}>
            <View {...pan.panHandlers} style={styles.grabberArea}>
              <View style={styles.grabber} />
            </View>
            {children}
          </Animated.View>
        </KeyboardAvoidingView>
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
  grabberArea: { alignItems: 'center', paddingTop: 12, paddingBottom: 14 },
  grabber: { width: 44, height: 5, borderRadius: 3, backgroundColor: colors.textoFraco },
});
