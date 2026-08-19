import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, IgCookie } from '@/lib/api';
import { iniciarLAparaRun } from '@/lib/la';
import { type Cores } from '@/theme';
import { useTheme } from '@/theme-context';
import { useI18n } from '@/i18n';
import { Botao } from '@/ui/components';
import { LoadingDog } from '@/ui/LoadingDog';
import type { RootStackParamList } from '@/navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const LOGIN_URL = 'https://www.instagram.com/accounts/login/';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

type RawCookie = { name: string; value: string; domain?: string; path?: string; secure?: boolean; httpOnly?: boolean };
type CookieMgr = {
  get: (url: string, useWebKit?: boolean) => Promise<Record<string, RawCookie>>;
  clearAll: (useWebKit?: boolean) => Promise<boolean>;
};

let CookieManager: CookieMgr | null = null;
try {
  const mod = require('@react-native-cookies/cookies');
  CookieManager = (mod && mod.default ? mod.default : mod) as CookieMgr;
} catch {
  CookieManager = null;
}
const semNativo = !CookieManager;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function InstagramLoginScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const nav = useNavigation<Nav>();
  const params = useRoute<RouteProp<RootStackParamList, 'InstagramLogin'>>().params;
  const usuario = (params?.label || '').replace(/^@/, '').trim();
  const senha = params?.senha || '';
  const autoLogin = !!(usuario && senha);   // tem credencial salva → login automático
  const insets = useSafeAreaInsets();
  const [carregandoPagina, setCarregandoPagina] = useState(true);
  const [status, setStatus] = useState<'idle' | 'capturando' | 'erro'>('idle');
  const [msg, setMsg] = useState('');
  const [limpo, setLimpo] = useState(false);   // cookies do IG já foram zerados?
  const jaCapturou = useRef(false);
  const webRef = useRef<WebView>(null);

  // SEMPRE começa deslogado: zera os cookies do IG ANTES de carregar, senão com uma conta
  // já conectada o webview abriria logado e capturaria a conta ERRADA.
  useEffect(() => {
    if (!CookieManager) { setLimpo(true); return; }
    let vivo = true;
    Promise.all([
      CookieManager.clearAll(true).catch(() => false),
      CookieManager.clearAll(false).catch(() => false),
    ]).finally(() => { if (vivo) setLimpo(true); });
    return () => { vivo = false; };
  }, []);

  // JS injetado: preenche @usuário (e senha, se houver) nos campos React-controlados e, no modo
  // auto, clica em "Entrar" quando os dois estão prontos. NÃO mexe em captcha/checkpoint.
  const injecao = usuario ? `
    (function(){
      if (window.__qnFill) return; window.__qnFill = true;
      var u = ${JSON.stringify(usuario)}, p = ${JSON.stringify(senha)}, auto = ${autoLogin ? 'true' : 'false'};
      var n = 0, clicou = false;
      var set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      function fill(el, val){
        if (el && val && el.value !== val) {
          set.call(el, val);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      function campos(){
        var pi = document.querySelector('input[type="password"], input[name="password"]');
        var ui = document.querySelector('input[name="username"], input[autocomplete="username"], input[type="email"], input[inputmode="email"]');
        if (!ui) {
          var todos = Array.prototype.slice.call(document.querySelectorAll('input'));
          ui = todos.filter(function(x){ var t=(x.type||'text').toLowerCase(); return t!=='password'&&t!=='hidden'&&t!=='checkbox'&&t!=='submit'&&t!=='button'&&t!=='radio'; })[0];
        }
        return { ui: ui, pi: pi };
      }
      var iv = setInterval(function(){
        n++;
        var c = campos();
        if (n <= 30) { fill(c.ui, u); fill(c.pi, p); }
        if (auto && !clicou && c.ui && c.pi && c.ui.value && c.pi.value && n > 3) {
          var cands = Array.prototype.slice.call(document.querySelectorAll('button, div[role="button"], [type="submit"]'));
          var btn = cands.filter(function(b){
            var t = (b.textContent || b.innerText || '').trim().toLowerCase();
            return t==='entrar' || t==='log in' || t==='continuar' || t==='acessar' || t==='iniciar sessão';
          })[0];
          if (!btn && c.pi.form) { btn = c.pi.form.querySelector('button[type="submit"]') || c.pi.form.querySelector('button'); }
          if (btn) { btn.click(); clicou = true; }
          else if (c.pi.form) { try { (c.pi.form.requestSubmit ? c.pi.form.requestSubmit() : c.pi.form.submit()); clicou = true; } catch (e) {} }
        }
        if (n > 60 || clicou) clearInterval(iv);
      }, 300);
    })(); true;
  ` : undefined;

  async function capturar() {
    if (jaCapturou.current || status === 'capturando' || !CookieManager) return;
    setStatus('capturando');
    let nomes: string[] = [];
    let bruto: Record<string, RawCookie> = {};
    for (let i = 0; i < 6; i++) {
      try {
        bruto = await CookieManager.get('https://www.instagram.com', true);
        nomes = Object.keys(bruto || {});
        if (nomes.includes('sessionid')) break;
      } catch { /* tenta de novo */ }
      await sleep(700);
    }
    if (!nomes.includes('sessionid')) {
      setStatus('erro');
      setMsg(t('iglogin.noSession'));
      return;
    }
    const cookies: IgCookie[] = nomes.map((nm) => {
      const c = bruto[nm];
      return {
        name: c.name, value: c.value,
        domain: c.domain || '.instagram.com', path: c.path || '/',
        secure: c.secure ?? true, httpOnly: c.httpOnly ?? false,
        sameSite: 'Lax', session: true,
      };
    });
    try {
      jaCapturou.current = true;
      const res = await api.connectInstagram(cookies);
      if (!res.runs?.length) throw new Error('sem runs');
      await iniciarLAparaRun(res.runs[0].id, 'Conectando Instagram');
      nav.replace('Run', { runId: res.runs[0].id, nome: 'Conectar Instagram' });
    } catch {
      jaCapturou.current = false;
      setStatus('erro');
      setMsg(t('iglogin.sendFail'));
    }
  }

  // NÃO auto-captura (igual ao app de bots): o webview preenche login/senha e faz o login,
  // mas a captura da sessão só acontece quando VOCÊ toca em "Conectar". Assim dá pra resolver
  // captcha/checkpoint/confirmar email ANTES de conectar — e não captura uma sessão inválida.

  return (
    <View style={styles.tela}>
      <View style={{ flex: 1 }}>
        {limpo && (
          <WebView
            ref={webRef}
            source={{ uri: LOGIN_URL }}
            userAgent={UA}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            incognito={false}
            injectedJavaScript={injecao}
            onLoadStart={() => setCarregandoPagina(true)}
            onLoadEnd={() => { setCarregandoPagina(false); if (injecao) webRef.current?.injectJavaScript(injecao); }}
            style={{ backgroundColor: colors.bg }}
          />
        )}
        {(!limpo || carregandoPagina) && (
          <View style={styles.overlayPagina} pointerEvents="none">
            <LoadingDog size={48} />
          </View>
        )}
      </View>

      <View style={[styles.rodape, { paddingBottom: insets.bottom + 12 }]}>
        {status === 'erro' && <Text style={styles.erro}>{msg}</Text>}
        {semNativo ? (
          <Text style={styles.aviso}>{t('iglogin.expoGo')}</Text>
        ) : status === 'capturando' ? (
          <View style={styles.capturando}>
            <LoadingDog size={30} />
            <Text style={styles.capturandoTxt}>{t('iglogin.connecting')}</Text>
          </View>
        ) : autoLogin ? (
          <>
            <Text style={styles.dica}>{t('iglogin.autoFilled', { u: usuario })}</Text>
            <Botao title={t('iglogin.connect')} onPress={() => capturar()} />
          </>
        ) : (
          <>
            <Text style={styles.dica}>{t('iglogin.manual')}</Text>
            <Botao title={t('iglogin.connect')} onPress={() => capturar()} />
          </>
        )}
      </View>
    </View>
  );
}

const makeStyles = (colors: Cores) => StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.bg },
  overlayPagina: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  rodape: { padding: 16, gap: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card },
  dica: { color: colors.textoFraco, fontSize: 13, textAlign: 'center', lineHeight: 18 },
  aviso: { color: colors.alerta, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  erro: { color: colors.erro, fontSize: 13, textAlign: 'center', lineHeight: 18 },
  capturando: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 6 },
  capturandoTxt: { color: colors.texto, fontSize: 15, fontWeight: '600' },
});
