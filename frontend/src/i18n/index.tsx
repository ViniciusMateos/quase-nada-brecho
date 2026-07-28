import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { PT, EN, type Dict } from './keys';
import * as pecas from './packs/pecas';
import * as editor from './packs/editor';
import * as drops from './packs/drops';
import * as dashboard from './packs/dashboard';
import * as sync from './packs/sync';
import * as run from './packs/run';
import * as historico from './packs/historico';
import * as common from './packs/common';

// Idioma da INTERFACE. Conteúdo do usuário (nome de peça, etc.) NÃO é traduzido.
// Dicionário = base (hub/settings/nav) + packs por domínio (cada tela tem o seu).
const PACKS = [{ pt: PT, en: EN }, pecas, editor, drops, dashboard, sync, run, historico, common];
const DICTS: Record<string, Dict> = {
  pt: Object.assign({}, ...PACKS.map((p) => p.pt)),
  en: Object.assign({}, ...PACKS.map((p) => p.en)),
};
export const LANGS = [
  { code: 'pt', label: 'Português' },
  { code: 'en', label: 'English' },
] as const;

const CHAVE = 'brecho_idioma';
const FALLBACK = 'pt';

// Estado no módulo: helpers fora de componente traduzem sem estar num Provider.
let current = FALLBACK;

export function getLang() { return current; }

// ── Transição de idioma: as letras se embaralham e vão se resolvendo no idioma
// novo, da esquerda pra direita. O progresso é DERIVADO DO RELÓGIO (não guardado),
// então toques rápidos no toggle nunca deixam texto preso embaralhado. ──
const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const DIGITOS = '0123456789';
const SINAIS = '/:.-,';
const DURACAO = 460;
const PASSO = 32;
let fimEm = 0;

function progressoAgora(): number | null {
  if (!fimEm) return null;
  const restante = fimEm - Date.now();
  if (restante <= 0) { fimEm = 0; return null; }
  return 1 - restante / DURACAO;
}
const sorteia = (a: string) => a[Math.floor(Math.random() * a.length)];
function embaralharChar(c: string): string {
  if (/[0-9]/.test(c)) return sorteia(DIGITOS);
  if (/[a-zA-ZÀ-ÿ]/.test(c)) return sorteia(LETRAS);
  if (SINAIS.includes(c)) return sorteia(SINAIS);
  return c;
}
export function embaralhar(texto: string, progresso: number): string {
  if (!texto) return texto;
  const revelados = Math.floor(texto.length * progresso);
  let saida = '';
  for (let i = 0; i < texto.length; i++) {
    saida += i < revelados ? texto[i] : embaralharChar(texto[i]);
  }
  return saida;
}
/** Aplica a animação de troca a um texto qualquer (fora do dicionário). Custo zero fora da transição. */
export function anim(texto: string): string {
  const p = progressoAgora();
  return p == null ? texto : embaralhar(texto, p);
}

/** Tradução CRUA (sem animação) — pra serviços/fora de tela. */
export function tRaw(key: string, params?: Record<string, string | number>): string {
  const dict = DICTS[current] || DICTS[FALLBACK];
  let str = dict[key];
  if (str == null) str = DICTS[FALLBACK][key];
  if (str == null) return key;
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (params[k] != null ? String(params[k]) : `{${k}}`));
}
/** Traduz o que vai PRA TELA (com o embaralho durante a troca de idioma). */
export function t(key: string, params?: Record<string, string | number>): string {
  return anim(tRaw(key, params));
}

type Ctx = {
  lang: string;
  setLang: (code: string) => void;
  t: typeof t;
  embaralhando: boolean;
};
const LanguageContext = createContext<Ctx | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState(current);
  const [progresso, setProgresso] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // lê o idioma salvo (async) no boot — sem embaralho (é o estado inicial)
  useEffect(() => {
    let vivo = true;
    SecureStore.getItemAsync(CHAVE).then((v) => {
      if (vivo && v && DICTS[v] && v !== current) { current = v; setLangState(v); }
    }).catch(() => {});
    return () => { vivo = false; if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const setLang = useCallback((code: string) => {
    if (!DICTS[code] || code === current) return;
    current = code;
    SecureStore.setItemAsync(CHAVE, code).catch(() => {});
    setLangState(code);

    if (timerRef.current) clearInterval(timerRef.current);
    fimEm = Date.now() + DURACAO;
    setProgresso(0);
    // o timer só força re-render por quadro; quem manda no progresso é o relógio
    const meuId = setInterval(() => {
      const p = progressoAgora();
      setProgresso(p);
      if (p == null) { clearInterval(meuId); if (timerRef.current === meuId) timerRef.current = null; }
    }, PASSO);
    timerRef.current = meuId;
    setTimeout(() => setProgresso(null), DURACAO + 80);   // rede de segurança
  }, []);

  const value = useMemo<Ctx>(
    () => ({ lang, setLang, t, embaralhando: progresso != null }),
    [lang, setLang, progresso],
  );
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useI18n deve ser usado dentro de LanguageProvider');
  return ctx;
}
