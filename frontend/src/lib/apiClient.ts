import axios from 'axios';
import { env } from '@/config/env';
import { getServerUrl, getToken } from '@/lib/tokenStorage';

// URL efetiva: a salva em Configurações tem prioridade sobre a do build.
export async function baseUrl(): Promise<string> {
  return (await getServerUrl()) || env.apiBaseUrl;
}

// Monta a URL absoluta de uma imagem (o backend devolve caminhos tipo /uploads/x.jpg).
export async function urlAbsoluta(caminho: string | null | undefined): Promise<string | null> {
  if (!caminho) return null;
  if (/^https?:\/\//.test(caminho)) return caminho;
  const base = (await baseUrl()).replace(/\/+$/, '');
  return `${base}${caminho.startsWith('/') ? '' : '/'}${caminho}`;
}

const instance = axios.create({
  timeout: 30000,
  headers: { 'Content-Type': 'application/json', 'Bypass-Tunnel-Reminder': '1' },
});

instance.interceptors.request.use(async (config) => {
  config.baseURL = await baseUrl();
  const token = await getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// devolve direto o corpo (data), igual ao padrão dos outros apps
instance.interceptors.response.use((r) => r.data, (e) => Promise.reject(e));

export const http = {
  get: <T>(url: string) => instance.get(url) as unknown as Promise<T>,
  post: <T>(url: string, body?: unknown) => instance.post(url, body) as unknown as Promise<T>,
  put: <T>(url: string, body?: unknown) => instance.put(url, body) as unknown as Promise<T>,
  del: <T>(url: string) => instance.delete(url) as unknown as Promise<T>,
  // upload multipart (foto da peça)
  upload: <T>(url: string, form: FormData) =>
    instance.post(url, form, { headers: { 'Content-Type': 'multipart/form-data' } }) as unknown as Promise<T>,
};
