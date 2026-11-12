'use client';

import Image from 'next/image';
import Link from 'next/link';
import { History, RefreshCw, Users } from 'lucide-react';
import { ModeSwitcher } from '@/components/layout/mode-switcher';
import { MarketFlag } from '@/components/stock-control/shared/MarketFlag';
import type { Market } from '@/lib/stock-control/types';

interface Props {
  globalAutomation: boolean;
  onToggleGlobal: () => void;
  markets: Market[];
  onToggleMarket: (marketId: number) => void;
  onReload: () => void;
  loading: boolean;
  lastSync: string | null;
  onOpenHistory: () => void;
}

// ────── Function: timeAgo ─────────────────────────────────────────────────
// ─── Turns an ISO date into a short relative text ("hace 12 min")
// ──────────────────────────────────────────────────────────────────────────
function timeAgo(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'hace menos de 1 min';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}

export function DashboardHeader({
  globalAutomation,
  onToggleGlobal,
  markets,
  onToggleMarket,
  onReload,
  loading,
  lastSync,
  onOpenHistory,
}: Props) {
  return (
    <header className="flex flex-wrap xl:flex-nowrap items-center justify-between gap-x-6 gap-y-3 border-b border-border pb-5">
      {/* Logo + título */}
      <div className="flex items-center gap-3 shrink-0">
        <Image
          src="/Icono_NeuronUP-positivo.png"
          alt="NeuronUP"
          width={40}
          height={40}
          loading="eager"
          className="shrink-0"
        />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground whitespace-nowrap">Leads Stock Control</h1>
          <p
            className="text-xs text-muted-foreground mt-0.5"
            title={lastSync ? new Date(lastSync).toLocaleString('es-ES') : undefined}
          >
            {lastSync ? `Último cambio de HubSpot: ${timeAgo(lastSync)}` : 'Sin sincronizaciones todavía'}
          </p>
        </div>
      </div>

      {/* Automatización: global + mercados */}
      <div className="flex items-center gap-1.5 rounded-xl border border-border bg-card p-1.5 shadow-sm">
        <button
          type="button"
          onClick={onToggleGlobal}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all shrink-0 cursor-pointer ${
            globalAutomation
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25'
              : 'bg-rose-500/15 border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-500/25'
          }`}
        >
          <RefreshCw
            className={`w-4 h-4 ${globalAutomation ? 'animate-spin text-emerald-500' : 'text-rose-500'}`}
            strokeWidth={2.5}
          />
          <span className="whitespace-nowrap">{globalAutomation ? 'Automatización: ON' : 'Automatización: OFF'}</span>
        </button>

        <div className="w-px h-6 bg-border mx-1" />

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
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border transition-all shrink-0 ${
                !globalAutomation
                  ? 'bg-rose-500/15 border-rose-500/40 cursor-not-allowed opacity-60'
                  : isEnabled
                  ? 'bg-emerald-500/15 border-emerald-500/40 hover:bg-emerald-500/25 cursor-pointer'
                  : 'bg-rose-500/15 border-rose-500/40 hover:bg-rose-500/25 cursor-pointer'
              }`}
            >
              <MarketFlag marketId={market.id} width={22} height={15} />
              <RefreshCw
                className={`w-3.5 h-3.5 ${isMarketActive ? 'animate-spin text-emerald-500' : 'text-rose-500'}`}
                strokeWidth={2.5}
              />
            </button>
          );
        })}
      </div>

      {/* Historial + Usuarios + Recargar + tema */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onOpenHistory}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card text-sm font-medium hover:bg-muted transition-colors shadow-sm"
          title="Historial de distribuciones"
        >
          <History className="w-4 h-4" />
          Historial
        </button>
        <Link
          href="/stock-control/users"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card text-sm font-medium hover:bg-muted transition-colors shadow-sm"
          title="Gestión de usuarios"
        >
          <Users className="w-4 h-4" />
          Usuarios
        </Link>
        <button
          type="button"
          onClick={onReload}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card text-sm font-medium hover:bg-muted transition-colors shadow-sm disabled:opacity-50"
          title="Recargar estadísticas"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Recargar
        </button>
        <ModeSwitcher />
      </div>
    </header>
  );
}
