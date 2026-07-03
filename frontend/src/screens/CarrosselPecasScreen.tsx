import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Animated, Dimensions, FlatList, KeyboardAvoidingView, NativeScrollEvent,
  NativeSyntheticEvent, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/lib/api';
import { fotoParaUpload } from '@/lib/foto';
import { colors } from '@/theme';
import { Botao } from '@/ui/components';
import { LoadingDog } from '@/ui/LoadingDog';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type R = RouteProp<RootStackParamList, 'CarrosselPecas'>;

export function CarrosselPecasScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation();
  const { fotos } = useRoute<R>().params;
  const [nomes, setNomes] = useState<string[]>(() => fotos.map(() => ''));
  const [idx, setIdx] = useState(0);
  const [progresso, setProgresso] = useState<{ feitas: number; total: number } | null>(null);
  const listRef = useRef<FlatList>(null);

  const W = Dimensions.get('window').width;

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

  async function finalizar() {
    setProgresso({ feitas: 0, total: fotos.length });
    let ok = 0;
    for (let i = 0; i < fotos.length; i++) {
      try {
        const peca = await api.addPeca({ nome: nomes[i].trim() });
        await api.uploadImagem(peca.id, await fotoParaUpload(fotos[i]));
        ok++;
      } catch { /* segue as outras */ }
      setProgresso({ feitas: i + 1, total: fotos.length });
    }
    setProgresso(null);
    const comNome = nomes.filter((n) => n.trim()).length;
    Alert.alert('Pronto! 📸', `${ok} peça${ok === 1 ? '' : 's'} adicionada${ok === 1 ? '' : 's'}${comNome ? `, ${comNome} com nome` : ''}. Preço e detalhes é só tocar em cada uma.`, [
      { text: 'Beleza', onPress: () => nav.goBack() },
    ]);
  }

  function pular() {
    Alert.alert('Pular nomes?', 'Adiciona as peças só com a foto (você nomeia depois). Confirma?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Pular e adicionar', onPress: finalizar },
    ]);
  }

  const ultimo = idx === fotos.length - 1;
  const backW = backAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 58] });

  return (
    <KeyboardAvoidingView
      style={[styles.tela, { paddingTop: insets.top + 8 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.topo}>
        <Text style={styles.titulo}>Nomear peças</Text>
        <TouchableOpacity onPress={pular} hitSlop={8}>
          <Text style={styles.pular}>Pular</Text>
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
        renderItem={({ item }) => (
          <View style={{ width: W, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 }}>
            <View style={[styles.fotoWrap, { width: W - 32 }]}>
              <Image source={item} style={styles.foto} contentFit="cover" transition={120} cachePolicy="memory-disk" />
            </View>
          </View>
        )}
      />

      <View style={styles.dots}>
        {fotos.map((_, i) => (
          <View key={i} style={[styles.dot, i === idx && styles.dotOn]} />
        ))}
      </View>

      <View style={[styles.rodape, { paddingBottom: insets.bottom + 12 }]}>
        <Text style={styles.contador}>Peça {idx + 1} de {fotos.length}</Text>
        <TextInput
          value={nomes[idx]} onChangeText={setNome}
          placeholder="Nome da peça (opcional)" placeholderTextColor={colors.textoFraco}
          style={styles.input} returnKeyType={ultimo ? 'done' : 'next'}
          onSubmitEditing={() => { if (!ultimo) irPara(idx + 1); }} />
        <View style={styles.botoes}>
          <Animated.View style={{ width: backW, opacity: backAnim, overflow: 'hidden' }}>
            <TouchableOpacity style={styles.navBtn} onPress={() => irPara(idx - 1)} disabled={idx === 0}>
              <Ionicons name="chevron-back" size={22} color={colors.texto} />
            </TouchableOpacity>
          </Animated.View>
          <View style={{ flex: 1 }}>
            {ultimo
              ? <Botao title={`Adicionar ${fotos.length} peça${fotos.length === 1 ? '' : 's'}`} onPress={finalizar} loading={!!progresso} />
              : <Botao title="Próxima" onPress={() => irPara(idx + 1)} />}
          </View>
        </View>
      </View>

      {progresso && (
        <View style={styles.overlay}>
          <View style={styles.overlayCard}>
            <LoadingDog size={56} />
            <Text style={styles.overlayTxt}>Adicionando… {progresso.feitas}/{progresso.total}</Text>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg },
  topo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10 },
  titulo: { color: colors.texto, fontSize: 20, fontWeight: '800' },
  pular: { color: colors.marca, fontSize: 15, fontWeight: '700' },
  fotoWrap: { aspectRatio: 4 / 5, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.card2, borderWidth: 1, borderColor: colors.border },
  foto: { width: '100%', height: '100%' },
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
