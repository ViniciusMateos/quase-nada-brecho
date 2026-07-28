import React, { useCallback, useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/lib/api';
import { type Cores } from '@/theme';
import { useTheme } from '@/theme-context';
import { useI18n } from '@/i18n';
import { Aparece, CartaoTocavel } from '@/ui/components';
import { useDogRefresh } from '@/ui/DogRefresh';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function HubScreen() {
  const nav = useNavigation<Nav>();
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [pecas, setPecas] = useState<number | null>(null);
  const [semDrop, setSemDrop] = useState(0);
  const [drops, setDrops] = useState<number | null>(null);
  const [erro, setErro] = useState(false);

  const carregar = useCallback(async () => {
    try {
      // total de drops = unificado (manuais + os publicados que vieram do Insta),
      // igual a tela de Drops — não só a tabela manual
      const [p, d] = await Promise.all([api.listPecas(), api.listDropsTodos()]);
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
            <Text style={styles.marca}>{t('hub.tagline')}</Text>
            <Text style={styles.titulo}>{t('hub.brand')}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={() => nav.navigate('Settings')} hitSlop={8} style={styles.engrenagem}>
          <Ionicons name="settings-outline" size={24} color={colors.textoFraco} />
        </TouchableOpacity>
      </View>

      {erro && (
        <View style={[styles.aviso, { borderColor: colors.erro }]}>
          <Text style={{ color: colors.erro }}>{t('hub.offline')}</Text>
        </View>
      )}

      <Aparece delay={40}>
        <MenuCard colors={colors} styles={styles} icone="pricetags" titulo={t('hub.pecas')}
          sub={pecas == null ? t('hub.loading') : t('hub.pecas.sub', { n: pecas })}
          onPress={() => nav.navigate('Pecas')} />
      </Aparece>
      <Aparece delay={80}>
        <MenuCard colors={colors} styles={styles} icone="albums" titulo={t('hub.drops')}
          sub={drops == null ? t('hub.loading') : t('hub.drops.sub', { n: drops })}
          onPress={() => nav.navigate('Drops')} />
      </Aparece>
      <Aparece delay={120}>
        <MenuCard colors={colors} styles={styles} icone="stats-chart" titulo={t('hub.dashboard')}
          sub={t('hub.dashboard.sub')} onPress={() => nav.navigate('Dashboard')} />
      </Aparece>
      <Aparece delay={160}>
        <MenuCard colors={colors} styles={styles} icone="sync" titulo={t('hub.sync')}
          sub={t('hub.sync.sub')} onPress={() => nav.navigate('Sincronizar')} />
      </Aparece>
      <Aparece delay={200}>
        <MenuCard colors={colors} styles={styles} icone="time" titulo={t('hub.history')}
          sub={t('hub.history.sub')} onPress={() => nav.navigate('Historico')} />
      </Aparece>
      </ScrollView>
    </View>
  );
}

function MenuCard({ colors, styles, icone, titulo, sub, onPress }:
  { colors: Cores; styles: ReturnType<typeof makeStyles>; icone: keyof typeof Ionicons.glyphMap; titulo: string; sub: string; onPress: () => void }) {
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

const makeStyles = (colors: Cores) => StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg },
  topo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  marcaRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  engrenagem: { padding: 4 },
  logo: { width: 54, height: 54, resizeMode: 'contain', tintColor: colors.marca },
  marca: { color: colors.marca, fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  titulo: { color: colors.texto, fontSize: 26, fontWeight: '900', marginTop: -2 },
  aviso: { borderWidth: 1, borderRadius: 12, padding: 14, backgroundColor: colors.card },
  menu: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  iconeBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.card2, alignItems: 'center', justifyContent: 'center' },
  menuTitulo: { color: colors.texto, fontSize: 18, fontWeight: '700' },
  menuSub: { color: colors.textoFraco, fontSize: 13, marginTop: 2 },
});
