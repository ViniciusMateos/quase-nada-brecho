import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type Cores } from '@/theme';
import { useTheme } from '@/theme-context';
import { useI18n, LANGS } from '@/i18n';
import { Aparece, Botao, Card } from '@/ui/components';
import { LoadingDog } from '@/ui/LoadingDog';
import { OTA_VERSION, rodandoDeUpdate } from '@/constants/otaVersion';

type EstadoOta = 'checando' | 'atualizado' | 'disponivel' | 'baixando' | 'erro';

// expo-updates guardado: em dev client / Expo Go o módulo pode nem existir.
function getUpdates(): {
  checkForUpdateAsync?: () => Promise<{ isAvailable: boolean }>;
  fetchUpdateAsync?: () => Promise<unknown>;
  reloadAsync?: () => Promise<void>;
} | null {
  try { return require('expo-updates'); } catch { return null; }
}

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

// ── overlay de "Atualizando…" que aparece com fade enquanto o OTA baixa/reinicia ──
// reanimated não está no projeto → fade feito com Animated do react-native.
// entra em ~220ms (FadeIn) e sai em ~180ms (FadeOut) mantendo o backdrop ~0.96 opaco.
function OverlayAtualizando({ ativo, colors, texto }: { ativo: boolean; colors: Cores; texto: string }) {
  const op = useRef(new Animated.Value(0)).current;
  const [montado, setMontado] = useState(ativo);
  useEffect(() => {
    if (ativo) {
      setMontado(true);
      Animated.timing(op, { toValue: 0.96, duration: 220, useNativeDriver: true }).start();
    } else if (montado) {
      Animated.timing(op, { toValue: 0, duration: 180, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setMontado(false);
      });
    }
  }, [ativo]);  // eslint-disable-line react-hooks/exhaustive-deps
  if (!montado) return null;
  return (
    <Animated.View
      style={[StyleSheet.absoluteFillObject, {
        backgroundColor: colors.bg, opacity: op,
        alignItems: 'center', justifyContent: 'center',
      }]}>
      <LoadingDog size={72} />
      <Text style={{ color: colors.texto, fontSize: 16, fontWeight: '700', marginTop: 16 }}>{texto}</Text>
    </Animated.View>
  );
}

export function SettingsScreen() {
  const { colors, isDark, toggleTheme } = useTheme();
  const { t, lang, setLang } = useI18n();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [ota, setOta] = useState<EstadoOta>('checando');

  // ao abrir: pergunta ao servidor de OTA se tem versão mais nova que a que está rodando
  useEffect(() => {
    let vivo = true;
    (async () => {
      const U = getUpdates();
      if (!U?.checkForUpdateAsync) { if (vivo) setOta('atualizado'); return; }  // dev/expo go
      try {
        const r = await U.checkForUpdateAsync();
        if (vivo) setOta(r.isAvailable ? 'disponivel' : 'atualizado');
      } catch { if (vivo) setOta('atualizado'); }   // offline/erro → não alarma
    })();
    return () => { vivo = false; };
  }, []);

  async function atualizarAgora() {
    const U = getUpdates();
    if (!U?.fetchUpdateAsync || !U?.reloadAsync) return;
    setOta('baixando');
    try {
      await U.fetchUpdateAsync();
      await new Promise((r) => setTimeout(r, 550));   // segura o fade "Atualizando…" antes do reload
      await U.reloadAsync();   // reinicia já com o bundle novo
    } catch { setOta('erro'); }
  }

  const estado =
    ota === 'checando' ? t('settings.otaChecking')
    : ota === 'disponivel' ? t('settings.otaOutdated')
    : ota === 'baixando' ? t('settings.otaDownloading')
    : ota === 'erro' ? t('settings.otaUpdateError')
    : rodandoDeUpdate() ? t('settings.otaUpdated') : t('settings.otaEmbedded');
  const estadoCor = ota === 'disponivel' || ota === 'erro' ? colors.alerta : colors.textoFraco;

  return (
    <View style={{ flex: 1 }}>
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

      {/* atualização OTA: só aparece quando há versão nova esperando (ou baixando) */}
      {(ota === 'disponivel' || ota === 'baixando') && (
        <Aparece delay={120}>
          <Card style={{ gap: 12, borderColor: colors.alerta }}>
            <View style={styles.otaHead}>
              <Ionicons name="cloud-download-outline" size={20} color={colors.alerta} />
              <Text style={styles.otaTitulo}>{t('settings.otaAvailable')}</Text>
            </View>
            <Text style={styles.cardSub}>{t('settings.otaAvailableDesc')}</Text>
            <Botao title={t('settings.otaUpdateNow')} loading={ota === 'baixando'} onPress={atualizarAgora} />
          </Card>
        </Aparece>
      )}

      {/* rodapé: nº do OTA (sobe a cada eas update → prova de que o bundle novo baixou)
          + estado: verificando / atualizado / desatualizado / baixando / build.
          'desatualizado' e 'erro' saem na cor de alerta pra chamar atenção. */}
      <Aparece delay={160}>
        <View style={styles.rodape}>
          <Text style={styles.rodapeVersao}>
            OTA #{OTA_VERSION}{'  ·  '}<Text style={{ color: estadoCor }}>{estado}</Text>
          </Text>
        </View>
      </Aparece>
    </ScrollView>

    {/* overlay full-screen com fade enquanto o OTA baixa e reinicia */}
    <OverlayAtualizando ativo={ota === 'baixando'} colors={colors} texto={t('settings.otaUpdating')} />
    </View>
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
  otaHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  otaTitulo: { color: colors.texto, fontSize: 16, fontWeight: '800' },
  rodape: { alignItems: 'center', marginTop: 18 },
  rodapeVersao: { color: colors.textoFraco, fontSize: 12, opacity: 0.8 },
});
