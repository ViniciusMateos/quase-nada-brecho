import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Animated, Dimensions, FlatList, Keyboard, KeyboardAvoidingView, NativeScrollEvent,
  NativeSyntheticEvent, Platform, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { api } from '@/lib/api';
import { fotoParaUpload } from '@/lib/foto';
import { type Cores } from '@/theme';
import { useTheme } from '@/theme-context';
import { useI18n } from '@/i18n';
import { Botao } from '@/ui/components';
import { LoadingDog } from '@/ui/LoadingDog';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type R = RouteProp<RootStackParamList, 'CarrosselPecas'>;

export function CarrosselPecasScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const nav = useNavigation();
  const { fotos: fotosIniciais } = useRoute<R>().params;
  const [fotos, setFotos] = useState<string[]>(fotosIniciais);
  const [nomes, setNomes] = useState<string[]>(() => fotosIniciais.map(() => ''));
  const [idx, setIdx] = useState(0);
  const [progresso, setProgresso] = useState<{ feitas: number; total: number } | null>(null);
  const listRef = useRef<FlatList>(null);

  const W = Dimensions.get('window').width;

  // posição da rolagem — os dots seguem o swipe suavemente
  const scrollX = useRef(new Animated.Value(0)).current;

  // botão "voltar" entra/sai com animação (largura + opacidade) — sem flicker de layout
  const backAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(backAnim, { toValue: idx > 0 ? 1 : 0, duration: 200, useNativeDriver: false }).start();
  }, [idx, backAnim]);

  // índice só muda quando a rolagem PARA (evita piscar durante o swipe)
  const onMomentumEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / W);
    setIdx((atual) => (atual === i ? atual : i));
  }, [W]);

  function irPara(i: number) {
    listRef.current?.scrollToOffset({ offset: i * W, animated: true });
    setIdx(i);
  }
  function setNome(v: string) {
    setNomes((arr) => arr.map((n, i) => (i === idx ? v : n)));
  }

  async function trocarFoto(i: number) {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert(t('common.oops'), t('pecas.needPhotoPerm')); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (!res.canceled && res.assets[0]) {
      const uri = res.assets[0].uri;
      setFotos((arr) => arr.map((f, j) => (j === i ? uri : f)));
    }
  }

  function removerFoto(i: number) {
    Alert.alert(t('carrossel.removeTitle'), t('carrossel.removeMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('carrossel.remove'), style: 'destructive', onPress: () => {
          if (fotos.length <= 1) { nav.goBack(); return; }
          const novoIdx = Math.min(i, fotos.length - 2);
          setFotos((arr) => arr.filter((_, j) => j !== i));
          setNomes((arr) => arr.filter((_, j) => j !== i));
          setIdx(novoIdx);
          requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: novoIdx * W, animated: false }));
        },
      },
    ]);
  }

  const enviando = useRef(false);
  async function finalizar() {
    // trava SÍNCRONA de duplo-toque: o botão desabilita no `loading`, mas um 2º toque
    // no mesmo frame (antes do re-render) dispararia de novo e importaria tudo 2×.
    if (enviando.current) return;
    enviando.current = true;
    setProgresso({ feitas: 0, total: fotos.length });
    let ok = 0;
    for (let i = 0; i < fotos.length; i++) {
      try {
        const nome = nomes[i].trim();
        const peca = await api.addPeca({ nome, item: nome.split(/\s+/)[0] || '' });
        await api.uploadImagem(peca.id, await fotoParaUpload(fotos[i]));
        ok++;
      } catch { /* segue as outras */ }
      setProgresso({ feitas: i + 1, total: fotos.length });
    }
    setProgresso(null);
    Alert.alert(t('carrossel.doneTitle'), t('carrossel.doneMsg', { ok }), [
      { text: t('carrossel.ok'), onPress: () => nav.goBack() },
    ]);
  }

  function pular() {
    Alert.alert(t('carrossel.skipTitle'), t('carrossel.skipMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('carrossel.skipConfirm'), onPress: finalizar },
    ]);
  }

  // X (fechar): confirma antes de perder o que já nomeou. A animação de saída é a
  // do próprio modal (slide pra baixo) quando dá goBack.
  function confirmarDescartar() {
    Alert.alert(t('carrossel.discardTitle'), t('carrossel.discardMsg', { n: fotos.length }), [
      { text: t('carrossel.keepNaming'), style: 'cancel' },
      { text: t('carrossel.discard'), style: 'destructive', onPress: () => nav.goBack() },
    ]);
  }

  const ultimo = idx === fotos.length - 1;
  const backW = backAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 58] });

  return (
    <KeyboardAvoidingView
      style={[styles.tela, { paddingTop: insets.top + 8 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flex: 1 }}>
      <View style={styles.topo}>
        <TouchableOpacity onPress={confirmarDescartar} hitSlop={8}>
          <Ionicons name="close" size={24} color={colors.textoFraco} />
        </TouchableOpacity>
        <Text style={styles.titulo}>{t('carrossel.title')}</Text>
        <TouchableOpacity onPress={pular} hitSlop={8}>
          <Text style={styles.pular}>{t('carrossel.skip')}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={listRef}
        data={fotos}
        keyExtractor={(u, i) => `${i}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: false })}
        scrollEventThrottle={16}
        renderItem={({ item, index }) => (
          <Pressable style={{ width: W, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 }}
            onPress={() => Keyboard.dismiss()}>
            <View style={[styles.fotoWrap, { width: W - 32 }]}>
              <Image source={item} style={styles.foto} contentFit="cover" transition={120} cachePolicy="memory-disk" />
              <View style={styles.fotoAcoes}>
                <TouchableOpacity style={styles.fotoAcaoBtn} onPress={() => trocarFoto(index)} hitSlop={6}>
                  <Ionicons name="swap-horizontal" size={19} color="#FFFFFF" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.fotoAcaoBtn} onPress={() => removerFoto(index)} hitSlop={6}>
                  <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        )}
      />

      <View style={styles.dots}>
        {fotos.map((_, i) => {
          const input = [(i - 1) * W, i * W, (i + 1) * W];
          const w = scrollX.interpolate({ inputRange: input, outputRange: [6, 18, 6], extrapolate: 'clamp' });
          const bg = scrollX.interpolate({ inputRange: input, outputRange: [colors.border, colors.marca, colors.border], extrapolate: 'clamp' });
          return <Animated.View key={i} style={[styles.dot, { width: w, backgroundColor: bg }]} />;
        })}
      </View>

      <View style={[styles.rodape, { paddingBottom: insets.bottom + 12 }]}>
        <Text style={styles.contador}>{t('carrossel.counter', { i: idx + 1, n: fotos.length })}</Text>
        <TextInput
          value={nomes[idx]} onChangeText={setNome}
          placeholder={t('carrossel.namePlaceholder')} placeholderTextColor={colors.textoFraco}
          style={styles.input} returnKeyType={ultimo ? 'done' : 'next'} blurOnSubmit={ultimo}
          onSubmitEditing={() => { if (ultimo) finalizar(); else irPara(idx + 1); }} />
        <View style={styles.botoes}>
          <Animated.View style={{ width: backW, opacity: backAnim, overflow: 'hidden' }}>
            <TouchableOpacity style={styles.navBtn} onPress={() => irPara(idx - 1)} disabled={idx === 0}>
              <Ionicons name="chevron-back" size={22} color={colors.texto} />
            </TouchableOpacity>
          </Animated.View>
          <View style={{ flex: 1 }}>
            {ultimo
              ? <Botao title={t('carrossel.addN', { n: fotos.length })} onPress={finalizar} loading={!!progresso} />
              : <Botao title={t('carrossel.next')} onPress={() => irPara(idx + 1)} />}
          </View>
        </View>
      </View>
      </View>

      {progresso && (
        <View style={styles.overlay}>
          <View style={styles.overlayCard}>
            <LoadingDog size={56} />
            <Text style={styles.overlayTxt}>{t('carrossel.adding', { f: progresso.feitas, n: progresso.total })}</Text>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: Cores) => StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg },
  grabberWrap: { alignItems: 'center', paddingTop: 4, paddingBottom: 8 },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border },
  topo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10 },
  titulo: { color: colors.texto, fontSize: 20, fontWeight: '800' },
  pular: { color: colors.marca, fontSize: 15, fontWeight: '700' },
  fotoWrap: { aspectRatio: 4 / 5, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.card2, borderWidth: 1, borderColor: colors.border },
  foto: { width: '100%', height: '100%' },
  fotoAcoes: { position: 'absolute', top: 10, right: 10, flexDirection: 'row', gap: 8 },
  fotoAcaoBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 12, flexWrap: 'wrap', paddingHorizontal: 16 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotOn: { backgroundColor: colors.marca, width: 18 },
  rodape: { paddingHorizontal: 16, gap: 12 },
  contador: { color: colors.textoFraco, fontSize: 13, textAlign: 'center' },
  input: { backgroundColor: colors.card2, color: colors.texto, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, fontSize: 16, textAlign: 'center' },
  botoes: { flexDirection: 'row', alignItems: 'center' },
  navBtn: { width: 48, height: 48, borderRadius: 12, backgroundColor: colors.card2, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  overlayCard: { backgroundColor: colors.card, borderRadius: 18, padding: 28, alignItems: 'center', gap: 14, borderWidth: 1, borderColor: colors.border },
  overlayTxt: { color: colors.texto, fontSize: 15, fontWeight: '600' },
});
