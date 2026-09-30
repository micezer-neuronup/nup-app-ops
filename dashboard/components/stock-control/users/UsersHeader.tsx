'use client';

import Link from 'next/link';
import { SiteHeader } from '@/components/layout/site-header';
import { MarketFlag } from '@/components/stock-control/shared/MarketFlag';
import type { DashboardStats } from '@/lib/stock-control/types';

interface Props {
  headerStats: DashboardStats | null;
  loading: boolean;
  onReload: () => void;
}

export function UsersHeader({ headerStats, loading, onReload }: Props) {
  return (
    <div className="w-full flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
      {/* Fila 1: Volver + SiteHeader (móvil) */}
      <div className="flex items-center gap-3 lg:shrink-0">
        <Link
          href="/stock-control"
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg border bg-card text-card-foreground hover:bg-muted transition-colors shadow-sm shrink-0"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Volver
        </Link>
        <div className="lg:hidden ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onReload}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-medium hover:bg-muted transition-colors shadow-sm disabled:opacity-50"
            title="Recargar"
          >
            <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Recargar
          </button>
          <SiteHeader />
        </div>
      </div>

      {/* Fila 2: Stats */}
      <div className="flex-1 flex items-center justify-start lg:justify-center gap-2 flex-wrap">
        {/* Inbound/Outbound */}
        <div className="flex items-center gap-2 shrink-0 rounded-lg border border-foreground/10 bg-card px-3 py-1.5">
          <div className="text-center">
            <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">Inbound</p>
            <p className="text-sm font-bold text-foreground leading-tight">{headerStats?.inboundVivos ?? 0}</p>
          </div>
          <div className="w-px h-5 bg-border" />
          <div className="text-center">
            <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">Outbound</p>
            <p className="text-sm font-bold text-foreground leading-tight">{headerStats?.outboundVivos ?? 0}</p>
          </div>
        </div>

        {/* Pipelines */}
        <div className="flex items-center gap-3 shrink-0 rounded-lg border border-foreground/10 bg-card px-3 py-1.5">
          {headerStats?.pipelineData?.map((p, i) => (
            <div key={p.name} className="flex items-center gap-3">
              {i > 0 && <div className="w-px h-5 bg-border" />}
              <div className="text-center">
                <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">{p.name}</p>
                <p className="text-sm font-bold text-foreground leading-tight">{p.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Mercados con % */}
        <div className="flex items-center gap-3 shrink-0 rounded-lg border border-foreground/10 bg-card px-3 py-1.5">
          {headerStats?.marketStackedData?.map((m) => (
            <div key={m.name} className="flex flex-col items-center gap-0.5">
              <MarketFlag marketName={m.name} width={20} height={14} />
              <span className="text-[11px] font-bold text-foreground leading-none">{m.pct}%</span>
            </div>
          ))}
        </div>

        {/* Barra Asignados/Pool */}
        <div className="flex items-center gap-2 shrink-0">
          {(() => {
            const asig = headerStats?.asignadosReales ?? 0;
            const pool = headerStats?.leadsEnPool ?? 0;
            const total = asig + pool;
            const asigPct = total > 0 ? (asig / total) * 100 : 0;
            const poolPct = total > 0 ? (pool / total) * 100 : 0;
            return (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold text-emerald-600">Asig.</span>
                  <span className="text-xs font-bold text-foreground">{asig}</span>
                </div>
                <div className="w-24 h-2.5 rounded-full overflow-hidden border border-slate-300 flex">
                  <div className="h-full bg-emerald-500 transition-all" style={{ width: `${asigPct}%` }} />
                  <div className="h-full bg-orange-500 transition-all" style={{ width: `${poolPct}%` }} />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-foreground">{pool}</span>
                  <span className="text-[10px] font-semibold text-orange-500">Pool</span>
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* SiteHeader en desktop */}
      <div className="hidden lg:flex lg:shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onReload}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-medium hover:bg-muted transition-colors shadow-sm disabled:opacity-50"
          title="Recargar"
        >
          <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Recargar
        </button>
        <SiteHeader />
      </div>
    </div>
  );
}