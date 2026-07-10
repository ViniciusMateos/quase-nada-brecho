import React, { useCallback, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/lib/api';
import { colors } from '@/theme';
import { Aparece, CartaoTocavel } from '@/ui/components';
import { useDogRefresh } from '@/ui/DogRefresh';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function HubScreen() {
  const nav = useNavigation<Nav>();
  const [pecas, setPecas] = useState<number | null>(null);
  const [semDrop, setSemDrop] = useState(0);
  const [drops, setDrops] = useState(0);
  const [erro, setErro] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const [p, d] = await Promise.all([api.listPecas(), api.listDrops()]);
      setPecas(p.pecas.length);
      // só peças do catálogo manual sem drop contam pro "gerar cronograma"
      setSemDrop(p.pecas.filter((x) => x.drop_id == null && x.origem === 'manual').length);
      setDrops(d.drops.length);
      setErro(false);
    } catch {
      setErro(true);
    }
  }, []);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  const insets = useSafeAreaInsets();
  const { scrollProps, dog, spacerEl } = useDogRefresh(carregar, insets.top + 4);

  return (
    <View style={styles.tela}>
      {dog}
      <ScrollView style={styles.tela} contentContainerStyle={{ padding: 16, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 20, gap: 14 }} {...scrollProps}>
      {spacerEl}
      <View style={styles.topo}>
        <View style={styles.marcaRow}>
          <Image source={require('../assets/logo.png')} style={styles.logo} />
          <View>
            <Text style={styles.marca}>Quase Nada</Text>
            <Text style={styles.titulo}>Brechó</Text>
          </View>
        </View>
      </View>

      {erro && (
        <View style={[styles.aviso, { borderColor: colors.erro }]}>
          <Text style={{ color: colors.erro }}>
            Não conectei no servidor. Confira URL e token em Configurações.
          </Text>
        </View>
      )}

      <Aparece delay={40}>
        <MenuCard icone="pricetags" titulo="Peças" sub={pecas == null ? 'carregando…' : `${pecas} cadastradas`}
          onPress={() => nav.navigate('Pecas')} />
      </Aparece>
      <Aparece delay={80}>
        <MenuCard icone="albums" titulo="Drops" sub={`${drops} drop${drops === 1 ? '' : 's'} · agenda dos lançamentos`}
          onPress={() => nav.navigate('Drops')} />
      </Aparece>
      <Aparece delay={120}>
        <MenuCard icone="stats-chart" titulo="Dashboard" sub="faturamento, lucro, ROI e estoque"
          onPress={() => nav.navigate('Dashboard')} />
      </Aparece>
      <Aparece delay={160}>
        <MenuCard icone="sync" titulo="Sincronizar brechó" sub="raspa o Instagram e atualiza as vendas"
          onPress={() => nav.navigate('Sincronizar')} />
      </Aparece>
      <Aparece delay={200}>
        <MenuCard icone="time" titulo="Histórico" sub="raspagens anteriores: saldo, data e resultado"
          onPress={() => nav.navigate('Historico')} />
      </Aparece>
      </ScrollView>
    </View>
  );
}

function MenuCard({ icone, titulo, sub, onPress }:
  { icone: keyof typeof Ionicons.glyphMap; titulo: string; sub: string; onPress: () => void }) {
  return (
    <CartaoTocavel onPress={onPress} style={styles.menu}>
      <View style={styles.iconeBox}>
        <Ionicons name={icone} size={22} color={colors.marca} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.menuTitulo}>{titulo}</Text>
        <Text style={styles.menuSub}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textoFraco} />
    </CartaoTocavel>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg },
  topo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  marcaRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 54, height: 54, resizeMode: 'contain', tintColor: colors.marca },
  marca: { color: colors.marca, fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  titulo: { color: colors.texto, fontSize: 26, fontWeight: '900', marginTop: -2 },
  aviso: { borderWidth: 1, borderRadius: 12, padding: 14, backgroundColor: colors.card },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.marca, borderRadius: 14, padding: 16 },
  ctaTxt: { flex: 1, color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  menu: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  iconeBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.card2, alignItems: 'center', justifyContent: 'center' },
  menuTitulo: { color: colors.texto, fontSize: 18, fontWeight: '700' },
  menuSub: { color: colors.textoFraco, fontSize: 13, marginTop: 2 },
});
