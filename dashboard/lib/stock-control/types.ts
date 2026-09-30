export interface Market {
  id: number;
  name: string;
  flag: string;
  automation_enabled: boolean;
}

export interface User {
  id: number;
  owner_name: string;
  hubspot_user_id: string | null;
  email: string;
  market_ids: number[];
  market_names: string[];
  max_stock: number;
  restock_threshold: number;
  automation_enabled: boolean;
  current_stock: number;
  role: string;
  pipelines: string[];
  inbound_count: number;
  outbound_count: number;
  mm_count: number;
  ent_count: number;
  mm_percent: number;
  e_percent: number;
  target_mm_percent: number;
  target_e_percent: number;
  market_targets: Record<string, number> | null;
  market_breakdown: Record<string, { total: number; inbound: number; outbound: number; mm: number; ent: number }> | null;
  updated_at: string | null;
}

export interface Lead {
  id: string;
  market_name: string;
  status: string;
  score: number;
  owner_name: string;
  lead_type: string | null;
}

export interface DashboardStats {
  // Hero
  totalLeadsVivos: number;
  leadsEnPool: number;
  asignadosReales: number;
  scorePromedio: number;
  porcentajeCalificados: number;
  porcentajeDescalificados: number;
  totalCalificados: number;
  totalDescalificados: number;
  inboundVivos: number;
  outboundVivos: number;
  pctInbound: number;
  pctOutbound: number;

  // Score buckets
  scoreOver80: number;
  score60to80: number;
  scoreUnder60: number;

  // Pipeline
  pipelineData: PipelineItem[];
  pipelineMM: number;
  pipelineENT: number;
  pipelineLead: number;
  pipelineMMPct: number;
  pipelineENTPct: number;
  pipelineLeadPct: number;
  ratioMMENT: number;

  // Mercados
  marketStackedData: MarketStackedItem[];

  // Estados
  stateData: StateItem[];

  // SDRs
  sdrWorkloadData: SdrWorkloadItem[];
}

export interface MarketStackedItem {
  name: string;
  flag: string;
  flagCode: string;
  asignados: number;
  enPool: number;
  poolMM: number;
  poolENT: number;
  poolIN: number;
  poolOUT: number;
  asigMM: number;
  asigENT: number;
  asigIN: number;
  asigOUT: number;
  pct: number;
}

export interface PipelineItem {
  name: string;
  value: number;
  color: string;
}

export interface StateItem {
  name: string;
  value: number;
}

export interface SdrWorkloadItem {
  name: string;
  cargaNormal: number;
  sobrecarga: number;
  maxStock: number;
  automation_enabled: boolean;
}

export interface DashboardSettings {
  pool_auto_rotate: boolean;
  assigned_auto_rotate: boolean;
  metrics_auto_rotate: boolean;   // ← nuevo

}

export type ViewMode = 'tabla' | 'barras' | 'inout' | 'pie';