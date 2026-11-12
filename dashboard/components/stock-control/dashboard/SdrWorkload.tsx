'use client';

import { useState, type CSSProperties } from 'react';
import { ChevronRight, RefreshCw } from 'lucide-react';
import { MarketFlag } from '@/components/stock-control/shared/MarketFlag';
import type { Market, SdrWorkloadItem } from '@/lib/stock-control/types';

interface Props {
  sdrData: SdrWorkloadItem[];
  markets: Market[];
  onToggleAutomation: (userId: number) => void;
}

const NO_MARKET = 0;

// ────── Function: loadOf ──────────────────────────────────────────────────
// ─── Share of max stock in use (overload included), used to sort active users
// ──────────────────────────────────────────────────────────────────────────
function loadOf(sdr: SdrWorkloadItem): number {
  return (sdr.cargaNormal + sdr.sobrecarga) / Math.max(sdr.maxStock, 1);
}

// ────── Function: SdrRow ──────────────────────────────────────────────────
// ─── One user: name, stock count and automation toggle
// ─── The row background fills from the left with the load
// ─── `otherMarkets` = names of the user's other markets (shown as "+N")
// ──────────────────────────────────────────────────────────────────────────
function SdrRow({
  sdr,
  otherMarkets,
  onToggle,
}: {
  sdr: SdrWorkloadItem;
  otherMarkets: string[];
  onToggle: (userId: number) => void;
}) {
  const active = sdr.automation_enabled;
  const load = loadOf(sdr);

  // The row background fills from the left with the load (amber > 80%, red if overloaded)
  const fillColor = !active
    ? 'bg-muted-foreground/10'
    : load > 1
    ? 'bg-rose-500/20'
    : load > 0.8
    ? 'bg-amber-500/20'
    : 'bg-emerald-500/15';

  return (
    <div className={`relative flex items-center gap-2 my-1 px-2 py-1 rounded-md overflow-hidden text-xs ${active ? '' : 'opacity-60'}`}>
      <div
        className={`absolute inset-y-0 left-0 ${fillColor} transition-all`}
        style={{ width: `${Math.min(load, 1) * 100}%` }}
      />

      <span className="relative flex-1 min-w-0 truncate font-medium text-foreground" title={sdr.name}>
        {sdr.name}
      </span>
      {otherMarkets.length > 0 && (
        <span
          className="relative shrink-0 text-[10px] font-semibold text-muted-foreground"
          title={`También en: ${otherMarkets.join(', ')}`}
        >
          +{otherMarkets.length}
        </span>
      )}

      <span className="relative shrink-0 font-mono text-[11px] whitespace-nowrap">
        <span className="text-foreground font-semibold">{sdr.cargaNormal}</span>
        {sdr.sobrecarga > 0 && <span className="text-destructive font-semibold">+{sdr.sobrecarga}</span>}
        <span className="text-muted-foreground">/{sdr.maxStock}</span>
      </span>
      <button
        type="button"
        onClick={() => onToggle(sdr.id)}
        className={`relative shrink-0 p-1 rounded-full border transition-all ${
          active
            ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/20'
            : 'bg-rose-500/10 border-rose-500/40 text-rose-500 hover:bg-rose-500/20'
        }`}
        title={`${active ? 'Autom. ON' : 'Autom. OFF'} - Click para cambiar`}
      >
        <RefreshCw className={`w-3 h-3 ${active ? 'animate-spin' : ''}`} strokeWidth={2.5} />
      </button>
    </div>
  );
}

export function SdrWorkload({ sdrData, markets, onToggleAutomation }: Props) {
  const [openInactive, setOpenInactive] = useState<Set<number>>(new Set());

  const marketName = (id: number) => markets.find((m) => m.id === id)?.name ?? `Mercado ${id}`;

  // One group per market (a user with several markets appears in each), plus "Sin mercado"
  const groups = [
    ...[...markets].sort((a, b) => a.id - b.id).map((m) => ({ id: m.id, name: m.name })),
    { id: NO_MARKET, name: 'Sin mercado' },
  ]
    .map((g) => {
      const users = sdrData.filter((s) =>
        g.id === NO_MARKET ? s.marketIds.length === 0 : s.marketIds.includes(g.id)
      );
      return {
        ...g,
        active: users.filter((u) => u.automation_enabled).sort((a, b) => loadOf(b) - loadOf(a)),
        inactive: users.filter((u) => !u.automation_enabled).sort((a, b) => a.name.localeCompare(b.name)),
      };
    })
    .filter((g) => g.active.length + g.inactive.length > 0);

  const toggleOpen = (id: number) =>
    setOpenInactive((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="p-4 rounded-xl border border-border bg-card shadow-sm">
      <h3 className="text-sm font-semibold tracking-tight mb-2 text-foreground">Carga por SDR</h3>

      {groups.length > 0 ? (
        <div
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[repeat(var(--cols),minmax(0,1fr))] gap-x-6 gap-y-5"
          style={{ '--cols': groups.length } as CSSProperties}
        >
          {groups.map((g) => {
            const otherMarketsOf = (sdr: SdrWorkloadItem) =>
              sdr.marketIds.filter((id) => id !== g.id).map(marketName);
            const isOpen = openInactive.has(g.id);

            return (
              <div key={g.id} className="min-w-0">
                {/* Cabecera del mercado */}
                <div className="flex items-center gap-2 border-b border-border pb-1.5 mb-1">
                  {g.id !== NO_MARKET && <MarketFlag marketId={g.id} width={20} height={14} />}
                  <span className="text-xs font-bold uppercase tracking-wider text-foreground truncate">{g.name}</span>
                  <span className="ml-auto text-[11px] text-muted-foreground whitespace-nowrap">
                    {g.active.length}/{g.active.length + g.inactive.length} activos
                  </span>
                </div>

                {/* Activos */}
                {g.active.map((sdr) => (
                  <SdrRow key={sdr.id} sdr={sdr} otherMarkets={otherMarketsOf(sdr)} onToggle={onToggleAutomation} />
                ))}
                {g.active.length === 0 && (
                  <p className="py-1.5 text-xs text-muted-foreground">Ningún usuario activo</p>
                )}

                {/* Inactivos (plegable) */}
                {g.inactive.length > 0 && (
                  <div className="mt-1">
                    <button
                      type="button"
                      onClick={() => toggleOpen(g.id)}
                      className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                      Inactivos ({g.inactive.length})
                    </button>
                    {isOpen &&
                      g.inactive.map((sdr) => (
                        <SdrRow key={sdr.id} sdr={sdr} otherMarkets={otherMarketsOf(sdr)} onToggle={onToggleAutomation} />
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex items-center justify-center h-[170px] text-sm text-muted-foreground">
          No hay datos de carga por SDR disponibles
        </div>
      )}
    </div>
  );
}
