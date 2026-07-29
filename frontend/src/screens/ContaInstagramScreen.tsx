import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Credencial, lerCredenciais, salvarCredencial, removerCredencial } from '@/lib/credenciais';
import { type Cores } from '@/theme';
import { useTheme } from '@/theme-context';
import { useI18n } from '@/i18n';
import { Aparece, Botao, Card } from '@/ui/components';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function ContaInstagramScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const nav = useNavigation<Nav>();
  const [creds, setCreds] = useState<Credencial[]>([]);
  const [modal, setModal] = useState({ aberto: false, editando: false, usuario: '', senha: '' });

  const carregar = useCallback(async () => {
    setCreds(await lerCredenciais().catch(() => []));
  }, []);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  function conectar(c?: Credencial) {
    nav.navigate('InstagramLogin', c ? { label: c.usuario, senha: c.senha } : undefined);
  }

  function esquecer(c: Credencial) {
    Alert.alert(t('conta.forgetTitle'), t('conta.forgetMsg', { u: c.usuario }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('conta.forget'), style: 'destructive', onPress: async () => {
        await removerCredencial(c.usuario).catch(() => {}); await carregar();
      } },
    ]);
  }

  function abrirAdd() { setModal({ aberto: true, editando: false, usuario: '', senha: '' }); }
  function abrirEdit(c: Credencial) { setModal({ aberto: true, editando: true, usuario: c.usuario, senha: c.senha }); }
  function fecharModal() { setModal((m) => ({ ...m, aberto: false })); }

  async function salvar() {
    const u = modal.usuario.trim().replace(/^@/, '');
    if (!u) { Alert.alert(t('common.oops'), t('conta.needUser')); return; }
    if (!modal.senha) { Alert.alert(t('common.oops'), t('conta.needPass')); return; }
    try { await salvarCredencial({ usuario: u, senha: modal.senha }); fecharModal(); await carregar(); }
    catch { Alert.alert(t('common.oops'), t('conta.saveFail')); }
  }

  return (
    <View style={styles.tela}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text style={styles.intro}>{t('conta.intro')}</Text>

        {creds.length === 0 ? (
          <Text style={styles.vazio}>{t('conta.empty')}</Text>
        ) : creds.map((c, i) => (
          <Aparece key={c.usuario} delay={Math.min(i, 8) * 40}>
            <Card style={{ gap: 10 }}>
              <View style={styles.topo}>
                <View style={styles.iconeBox}>
                  <Ionicons name="logo-instagram" size={20} color={colors.marca} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>@{c.usuario}</Text>
                  <Text style={styles.sub}>{t('conta.saved')}</Text>
                </View>
              </View>
              <View style={styles.acoesRow}>
                <View style={{ flex: 1 }}><Botao title={t('conta.connect')} onPress={() => conectar(c)} /></View>
                <TouchableOpacity onPress={() => abrirEdit(c)} style={styles.icon} hitSlop={6}>
                  <Ionicons name="create-outline" size={20} color={colors.textoFraco} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => esquecer(c)} style={styles.icon} hitSlop={6}>
                  <Ionicons name="trash-outline" size={20} color={colors.erro} />
                </TouchableOpacity>
              </View>
            </Card>
          </Aparece>
        ))}

        <Botao title={t('conta.add')} cor={colors.marca} txtCor="#fff" onPress={abrirAdd} />
        <Botao title={t('conta.connectManual')} cor={colors.card2} txtCor={colors.texto} onPress={() => conectar()} />
      </ScrollView>

      <Modal visible={modal.aberto} transparent animationType="fade" onRequestClose={fecharModal}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalWrap}>
          <Pressable style={StyleSheet.absoluteFill} onPress={fecharModal} />
          <Pressable style={styles.modalCard} onPress={() => Keyboard.dismiss()}>
            <Text style={styles.modalTitulo}>
              {modal.editando ? t('conta.editTitle', { u: modal.usuario }) : t('conta.newTitle')}
            </Text>
            <TextInput style={styles.input} placeholder={t('conta.userPlaceholder')} placeholderTextColor={colors.textoFraco}
              autoCapitalize="none" autoCorrect={false} value={modal.usuario} editable={!modal.editando}
              onChangeText={(v) => setModal((m) => ({ ...m, usuario: v }))} />
            <TextInput style={styles.input} placeholder={t('conta.passPlaceholder')} placeholderTextColor={colors.textoFraco}
              secureTextEntry autoCapitalize="none" autoCorrect={false} value={modal.senha}
              onChangeText={(v) => setModal((m) => ({ ...m, senha: v }))} />
            <Text style={styles.modalDica}>{t('conta.passHint')}</Text>
            <View style={styles.modalBtns}>
              <View style={{ flex: 1 }}><Botao title={t('common.cancel')} cor={colors.card2} txtCor={colors.texto} onPress={fecharModal} /></View>
              <View style={{ flex: 1 }}><Botao title={t('common.save')} onPress={salvar} /></View>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const makeStyles = (colors: Cores) => StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg },
  intro: { color: colors.textoFraco, fontSize: 13, lineHeight: 19 },
  vazio: { color: colors.textoFraco, textAlign: 'center', marginVertical: 16 },
  topo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconeBox: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.card2, alignItems: 'center', justifyContent: 'center' },
  label: { color: colors.texto, fontSize: 16, fontWeight: '700' },
  sub: { color: colors.textoFraco, fontSize: 12, marginTop: 2 },
  acoesRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  icon: { padding: 6 },
  modalWrap: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.55)' },
  modalCard: { backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 12 },
  modalTitulo: { color: colors.texto, fontSize: 18, fontWeight: '800' },
  input: { backgroundColor: colors.card2, color: colors.texto, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border },
  modalDica: { color: colors.textoFraco, fontSize: 11, lineHeight: 15 },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
});
