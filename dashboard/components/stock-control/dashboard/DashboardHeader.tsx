'use client';

import { SiteHeader } from '@/components/layout/site-header';
import { MarketFlag } from '@/components/stock-control/shared/MarketFlag';
import type { Market } from '@/lib/stock-control/types';

interface Props {
  globalAutomation: boolean;
  onToggleGlobal: () => void;
  markets: Market[];
  onToggleMarket: (marketId: number) => void;
  onReload: () => void;
  loading: boolean;
}

export function DashboardHeader({
  globalAutomation,
  onToggleGlobal,
  markets,
  onToggleMarket,
  onReload,
  loading,
}: Props) {
  return (
    <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Leads Stock Control</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Panel de control y automatización de distribución de leads
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        {/* Botón Global */}
        <button
          type="button"
          onClick={onToggleGlobal}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all shadow-sm flex-shrink-0 cursor-pointer ${
            globalAutomation
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25'
              : 'bg-rose-500/15 border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-500/25'
          }`}
        >
          <svg
            className={`w-4 h-4 transition-transform ${globalAutomation ? 'animate-spin text-emerald-500' : 'text-rose-500'}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span>{globalAutomation ? 'Automatización: ON' : 'Automatización: OFF'}</span>
        </button>

        {/* Botones de Mercado */}
        <div className="flex items-center gap-2">
          {markets.map((market) => {
            const isEnabled = market.automation_enabled;
            const isMarketActive = globalAutomation && isEnabled;

            return (
              <button
                key={market.id}
                type="button"
                onClick={() => onToggleMarket(market.id)}
                disabled={!globalAutomation}
                title={`${market.name}: ${isEnabled ? 'ON' : 'OFF'}`}
                aria-label={`Toggle automation for ${market.name}`}
                className={`flex items-center gap-1.5 p-2 rounded-lg border transition-all shadow-sm flex-shrink-0 ${
                  !globalAutomation
                    ? 'bg-rose-500/15 border-rose-500/40 text-rose-600 dark:text-rose-400 cursor-not-allowed opacity-60'
                    : isEnabled
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25 cursor-pointer'
                    : 'bg-rose-500/15 border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-500/25 cursor-pointer'
                }`}
              >
                <MarketFlag marketId={market.id} width={24} height={16} />
                <svg
                  className={`w-4 h-4 transition-transform ${isMarketActive ? 'animate-spin' : ''} ${
                    !globalAutomation || !isEnabled ? 'text-rose-500' : 'text-emerald-500'
                  }`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            );
          })}
        </div>

        {/* Separador + Recargar + SiteHeader */}
        <div className="flex items-center border-l border-border pl-3 h-9 flex-shrink-0 gap-2">
          <button
            type="button"
            onClick={onReload}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-medium hover:bg-muted transition-colors shadow-sm disabled:opacity-50"
            title="Recargar estadísticas"
          >
            <svg
              className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Recargar
          </button>
          <SiteHeader />
        </div>
      </div>
    </header>
  );
}