import { baseUrl, http } from '@/lib/apiClient';
import { getToken } from '@/lib/tokenStorage';
import { env } from '@/config/env';

export type Peca = {
  id: number;
  nome: string | null;
  item: string | null;
  tamanho: string | null;
  largura: string | null;
  comprimento: string | null;
  medida: string | null;
  observacao: string | null;
  condicao: string | null;
  compra: number;
  venda: number;
  vendida: boolean;
  consignado: boolean;
  consig_pct: number | null;
  consig_tipo: 'pct' | 'valor';
  consig_valor: number | null;
  so_manual: boolean;
  template: string | null;
  num: number | null;
  imagem_url: string | null;
  drop_id: number | null;
  drop_nome: string | null;
  drop_data: string | null;
  origem: string;
  code: string | null;
  postado_em: string | null;
};
export type PecaCampos = Partial<Pick<Peca,
  'nome' | 'item' | 'tamanho' | 'largura' | 'comprimento' | 'medida' | 'observacao' | 'condicao' | 'compra' | 'venda' | 'vendida' | 'drop_id' | 'consignado' | 'consig_pct' | 'consig_tipo' | 'consig_valor' | 'so_manual' | 'template'>>;

export type Drop = {
  id: number;
  nome: string;
  data: string | null;
  status: string;
  ordem: number;
  qtd_pecas: number;
};
export type DropDetalhe = Drop & { pecas: Peca[] };
export type DropCampos = Partial<Pick<Drop, 'nome' | 'data' | 'status' | 'ordem'>>;

// resumo unificado (manual + histórico do scraper) com saldo
export type DropResumo = {
  tipo: 'manual' | 'historico';
  id: number | null;
  numero: number;
  nome: string | null;
  data: string | null;
  status: string;
  qtd_pecas: number;
  vendidas: number;
  disponiveis: number;
  faturamento: number;
  projecao: number;
  gasto: number;
  lucro: number;
  sold_out: boolean;
};

export type Kpis = {
  total: number; vendidas: number; disponiveis: number; taxa_venda: number;
  faturamento: number; cmv: number; lucro: number; margem_pct: number; roi_pct: number;
  ticket_medio: number; custo_medio: number; investido_total: number;
  estoque_valor: number; estoque_custo: number; estoque_lucro_potencial: number;
};
export type Grupo = { total: number; vendidas: number; faturamento: number; lucro: number };
export type DashboardDrop = Grupo & { drop: string; numero: number | null };
export type DashboardCategoria = Grupo & { item: string };
export type Dashboard = {
  existe: boolean; kpis: Kpis | null; por_drop: DashboardDrop[]; por_categoria: DashboardCategoria[];
};

// ── scraper / runs ──
export type Progresso = { done: number; total: number; label: string };
export type RunInfo = {
  id: string; status: string; started_at: number; ended_at?: number | null;
  returncode?: number | null; params: Record<string, unknown>; linhas: number;
  progress?: Progresso | null; titulo?: string;
};
export type RunDetail = RunInfo & { log: string[] };
export type ImportStats = { novas: number; atualizadas: number; total: number };
export type RunHistorico = {
  id: string; bot: string; dry_run: boolean;
  started_at: number | null; ended_at: number | null; duracao_s: number | null;
  status: string; bloqueio: boolean; saldo: Record<string, number | string>; backfill?: boolean;
};
export type IgCookie = {
  name: string; value: string; domain?: string; path?: string;
  httpOnly?: boolean; secure?: boolean; sameSite?: string; session?: boolean; expirationDate?: number;
};
export type ConnectResult = { runs: { id: string }[] };

export const api = {
  // dashboard
  getDashboard: () => http.get<Dashboard>('/brecho/dashboard'),

  // peças
  listPecas: () => http.get<{ pecas: Peca[] }>('/brecho/pecas'),
  addPeca: (campos: PecaCampos) => http.post<Peca>('/brecho/pecas', campos),
  editPeca: (id: number, campos: PecaCampos) => http.put<Peca>(`/brecho/pecas/${id}`, campos),
  delPeca: (id: number) => http.del(`/brecho/pecas/${id}`),
  uploadImagem: (id: number, form: FormData) => http.upload<Peca>(`/brecho/pecas/${id}/imagem`, form),

  // drops
  listDrops: () => http.get<{ drops: Drop[] }>('/drops'),
  listDropsTodos: () => http.get<{ drops: DropResumo[] }>('/drops/todos'),
  getHistorico: (data: string) => http.get<{ pecas: Peca[] }>(`/drops/historico?data=${encodeURIComponent(data)}`),
  getDrop: (id: number) => http.get<DropDetalhe>(`/drops/${id}`),
  addDrop: (campos: DropCampos) => http.post<DropDetalhe>('/drops', campos),
  editDrop: (id: number, campos: DropCampos) => http.put<DropDetalhe>(`/drops/${id}`, campos),
  delDrop: (id: number) => http.del(`/drops/${id}`),
  setPecasDrop: (id: number, peca_ids: number[]) => http.put<DropDetalhe>(`/drops/${id}/pecas`, { peca_ids }),

  // scraper / runs
  startRun: (params: Record<string, unknown>) => http.post<RunInfo>('/runs', params),
  listRuns: () => http.get<RunInfo[]>('/runs'),
  getRunsHistorico: () => http.get<RunHistorico[]>('/runs/history'),
  getRun: (id: string) => http.get<RunDetail>(`/runs/${id}`),
  stopRun: (id: string) => http.post(`/runs/${id}/stop`),
  setLiveActivity: (runId: string, token: string, bundle?: string) =>
    http.post(`/runs/${runId}/liveactivity`, { token, bundle }),
  importarPlanilha: () => http.post<ImportStats>('/scraper/importar'),
  connectInstagram: (cookies: IgCookie[]) => http.post<ConnectResult>('/instagram/session', { cookies }),
  registerDevice: (token: string) => http.post<{ ok: boolean; devices: number }>('/devices', { token }),
};

// URL do WebSocket de log (http→ws, com o token na query).
export async function logsWsUrl(runId: string): Promise<string> {
  const base = (await baseUrl()).replace(/^http/, 'ws');
  const token = (await getToken()) || env.apiToken;
  return `${base}/runs/${runId}/logs?token=${encodeURIComponent(token ?? '')}`;
}
