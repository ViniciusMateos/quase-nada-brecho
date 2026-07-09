import { requireOptionalNativeModule } from 'expo-modules-core';

type Sub = { remove: () => void };

// null no Expo Go / Android (módulo nativo ausente) — tudo vira no-op gracioso.
const M = requireOptionalNativeModule<{
  disponivel: () => boolean;
  start: (titulo: string, total: number) => Promise<boolean>;
  end: () => Promise<void>;
  addListener: (evento: string, cb: (e: { token: string }) => void) => Sub;
}>('LiveActivity');

/** true se o device suporta e o usuário deixou Live Activities ligadas. */
export function laDisponivel(): boolean {
  try { return M?.disponivel?.() ?? false; } catch { return false; }
}

/**
 * Escuta o push token da Live Activity. O token chega ~1-3s depois de iniciar (e pode
 * rotacionar) — registre o listener ANTES de chamar `iniciarLiveActivity`. Devolve uma
 * função pra parar de escutar. No-op fora do iOS/dev build.
 */
export function aoReceberTokenLA(cb: (token: string) => void): () => void {
  try {
    const sub = M?.addListener?.('onToken', (e) => { if (e?.token) cb(e.token); });
    return () => { try { sub?.remove(); } catch { /* no-op */ } };
  } catch {
    return () => { /* no-op */ };
  }
}

/** Inicia a Live Activity. Retorna true se conseguiu (o token vem pelo evento onToken). */
export async function iniciarLiveActivity(titulo: string, total: number): Promise<boolean> {
  try { return (await M?.start?.(titulo, total)) ?? false; } catch { return false; }
}

/** Encerra a(s) Live Activity(ies) do scraper (some do lock screen). */
export async function encerrarLiveActivity(): Promise<void> {
  try { await M?.end?.(); } catch { /* no-op */ }
}
