import * as SecureStore from 'expo-secure-store';

/**
 * Credencial (user + senha) da conta do Instagram do brechó, guardada SÓ no aparelho
 * (Keychain do iOS via expo-secure-store). NUNCA vai pro servidor — só pré-preenche o
 * webview de login pra reconectar num toque. A sessão (cookies) continua sendo capturada
 * no login. É conta única (o brechó usa @brechoquasenadaa), mas guardo como lista pra
 * ficar igual ao app de bots e permitir mais de uma no futuro.
 */
export type Credencial = { usuario: string; senha: string };

const KEY = 'brecho_ig_credenciais_v1';

export async function lerCredenciais(): Promise<Credencial[]> {
  try {
    const s = await SecureStore.getItemAsync(KEY);
    const arr = s ? JSON.parse(s) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function gravarTodas(list: Credencial[]) {
  await SecureStore.setItemAsync(KEY, JSON.stringify(list));
}

export async function salvarCredencial(c: Credencial) {
  const u = c.usuario.trim().replace(/^@/, '');
  const list = await lerCredenciais();
  const resto = list.filter((x) => x.usuario.toLowerCase() !== u.toLowerCase());
  resto.push({ usuario: u, senha: c.senha });
  await gravarTodas(resto);
}

export async function removerCredencial(usuario: string) {
  const list = await lerCredenciais();
  await gravarTodas(list.filter((x) => x.usuario.toLowerCase() !== usuario.trim().toLowerCase()));
}
