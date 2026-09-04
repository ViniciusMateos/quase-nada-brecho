import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { type Cores } from '@/theme';
import { useTheme } from '@/theme-context';
import { useI18n } from '@/i18n';

// "i" clicável (círculo com i) do lado de uma métrica. Abre um pop-up simples explicando o
// termo (título + texto vindos do pack `ajuda`, por `termo`). Fecha no botão ou tocando fora.
// Reutilizável: usado no Dashboard e no Calendário.
export function InfoAjuda({ termo, cor, size = 15 }: { termo: string; cor?: string; size?: number }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <TouchableOpacity onPress={() => setAberto(true)} hitSlop={10} style={styles.gatilho} accessibilityRole="button">
        <Ionicons name="information-circle-outline" size={size} color={cor ?? colors.textoFraco} />
      </TouchableOpacity>

      <Modal visible={aberto} transparent animationType="fade" statusBarTranslucent
        onRequestClose={() => setAberto(false)}>
        {/* tocar fora (no backdrop) fecha; tocar no card não propaga */}
        <Pressable style={styles.backdrop} onPress={() => setAberto(false)}>
          <Pressable style={styles.card} onPress={() => {}}>
            <View style={styles.head}>
              <Ionicons name="information-circle" size={22} color={colors.marca} />
              <Text style={styles.titulo}>{t(`ajuda.${termo}.titulo`)}</Text>
            </View>
            <Text style={styles.texto}>{t(`ajuda.${termo}.texto`)}</Text>
            <TouchableOpacity style={styles.fechar} activeOpacity={0.85} onPress={() => setAberto(false)}>
              <Text style={styles.fecharTxt}>{t('ajuda.fechar')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const makeStyles = (colors: Cores) => StyleSheet.create({
  gatilho: { marginLeft: 5, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  card: { width: '100%', maxWidth: 400, backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 20, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titulo: { color: colors.texto, fontSize: 17, fontWeight: '800', flex: 1 },
  texto: { color: colors.textoFraco, fontSize: 14, lineHeight: 21 },
  fechar: { alignSelf: 'flex-end', marginTop: 2, backgroundColor: colors.card2, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 18 },
  fecharTxt: { color: colors.texto, fontSize: 14, fontWeight: '700' },
});
