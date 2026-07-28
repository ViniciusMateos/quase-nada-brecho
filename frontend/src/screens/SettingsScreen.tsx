import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type Cores } from '@/theme';
import { useTheme } from '@/theme-context';
import { useI18n, LANGS } from '@/i18n';
import { Aparece, Card } from '@/ui/components';
import { OTA_VERSION, rodandoDeUpdate } from '@/constants/otaVersion';

// ── toggle animado (trilho + thumb desliza); tocar dispara o fade do tema ──
function Toggle({ on, onPress, colors }: { on: boolean; onPress: () => void; colors: Cores }) {
  const anim = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(anim, { toValue: on ? 1 : 0, useNativeDriver: false, friction: 9, tension: 90 }).start();
  }, [on]);  // eslint-disable-line react-hooks/exhaustive-deps
  const bg = anim.interpolate({ inputRange: [0, 1], outputRange: [colors.card2, colors.marca] });
  const x = anim.interpolate({ inputRange: [0, 1], outputRange: [3, 25] });
  return (
    <Pressable onPress={onPress} hitSlop={10}>
      <Animated.View style={{ width: 52, height: 30, borderRadius: 999, backgroundColor: bg, justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
        <Animated.View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFFFFF', transform: [{ translateX: x }], shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 3 }} />
      </Animated.View>
    </Pressable>
  );
}

// ── pílula de idioma com press (escala) ──
function Pilula({ ativo, label, onPress, colors }: { ativo: boolean; label: string; onPress: () => void; colors: Cores }) {
  const s = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      onPressIn={() => Animated.spring(s, { toValue: 0.93, useNativeDriver: true, friction: 7 }).start()}
      onPressOut={() => Animated.spring(s, { toValue: 1, useNativeDriver: true, friction: 5 }).start()}
      onPress={onPress}>
      <Animated.View style={[{
        paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, borderWidth: 1,
        backgroundColor: ativo ? colors.marca : colors.card2,
        borderColor: ativo ? colors.marca : colors.border,
        transform: [{ scale: s }],
      }]}>
        <Text style={{ color: ativo ? '#FFFFFF' : colors.texto, fontWeight: '700', fontSize: 14 }}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

export function SettingsScreen() {
  const { colors, isDark, toggleTheme } = useTheme();
  const { t, lang, setLang } = useI18n();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <ScrollView style={styles.tela} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 24 }}>

      <Aparece>
        <Text style={styles.secao}>{t('settings.appearance')}</Text>
      </Aparece>

      {/* Tema */}
      <Aparece delay={40}>
        <Card style={styles.linhaCard}>
          <View style={styles.iconeBox}>
            <Ionicons name={isDark ? 'moon' : 'sunny'} size={20} color={colors.marca} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitulo}>{t('settings.theme')}</Text>
            <Text style={styles.cardSub}>{isDark ? t('settings.dark') : t('settings.light')}</Text>
          </View>
          <Toggle on={!isDark} onPress={toggleTheme} colors={colors} />
        </Card>
      </Aparece>

      {/* Idioma */}
      <Aparece delay={80}>
        <Card style={{ gap: 12 }}>
          <View style={styles.linhaTopo}>
            <View style={styles.iconeBox}>
              <Ionicons name="language" size={20} color={colors.marca} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitulo}>{t('settings.language')}</Text>
              <Text style={styles.cardSub}>{t('settings.language.sub')}</Text>
            </View>
          </View>
          <View style={styles.pilulas}>
            {LANGS.map((l) => (
              <Pilula key={l.code} label={l.label} ativo={lang === l.code}
                onPress={() => setLang(l.code)} colors={colors} />
            ))}
          </View>
        </Card>
      </Aparece>

      {/* rodapé: versão de marketing + nº do OTA (sobe a cada eas update → prova de que
          o bundle novo baixou) + se está rodando de OTA ou do build embutido */}
      <Aparece delay={140}>
        <View style={styles.rodape}>
          <Text style={styles.rodapeVersao}>
            OTA #{OTA_VERSION}{'  ·  '}{rodandoDeUpdate() ? t('settings.otaUpdated') : t('settings.otaEmbedded')}
          </Text>
        </View>
      </Aparece>
    </ScrollView>
  );
}

const makeStyles = (colors: Cores) => StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg },
  secao: { color: colors.textoFraco, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2, marginLeft: 4 },
  linhaCard: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  linhaTopo: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  iconeBox: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.card2, alignItems: 'center', justifyContent: 'center' },
  cardTitulo: { color: colors.texto, fontSize: 16, fontWeight: '700' },
  cardSub: { color: colors.textoFraco, fontSize: 13, marginTop: 2 },
  pilulas: { flexDirection: 'row', gap: 10, marginLeft: 54 },
  rodape: { alignItems: 'center', marginTop: 18 },
  rodapeVersao: { color: colors.textoFraco, fontSize: 12, opacity: 0.8 },
});
