'use client';

import { MarketFlag } from '@/components/stock-control/shared/MarketFlag';
import { MARKET_LIST } from '@/lib/stock-control/constants';

interface Props {
  marketBreakdown: Record<
    string,
    { total: number; inbound: number; outbound: number; mm: number; ent: number }
  > | null;
  assignedMarketIds: number[];
}

export function MarketBreakdownList({ marketBreakdown, assignedMarketIds }: Props) {
  const breakdown = marketBreakdown || {};
  const sortedIds = Object.keys(breakdown)
    .map((k) => parseInt(k))
    .sort((a, b) => a - b);

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-2">
        Por Mercado
      </p>

      {sortedIds.map((mid) => {
        const market = MARKET_LIST.find((m) => m.id === mid);
        const flagCode = market?.code;
        const mb = breakdown[mid] || { total: 0, inbound: 0, outbound: 0, mm: 0, ent: 0 };
        const isAssigned = assignedMarketIds.includes(mid);

        return (
          <div
            key={mid}
            className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
              isAssigned ? 'border-border bg-card' : 'border-amber-500/40 bg-amber-500/5'
            }`}
          >
            <MarketFlag marketId={mid} width={24} height={16} />

            <span className="text-sm font-bold text-foreground w-8">{mb.total}</span>

            <div className="flex-1 grid grid-cols-4 gap-1 text-center">
              <div>
                <p className="text-[9px] text-muted-foreground font-bold uppercase">IN</p>
                <p className="text-xs font-bold text-blue-500">{mb.inbound}</p>
              </div>
              <div>
                <p className="text-[9px] text-muted-foreground font-bold uppercase">OUT</p>
                <p className="text-xs font-bold text-cyan-500">{mb.outbound}</p>
              </div>
              <div>
                <p className="text-[9px] text-muted-foreground font-bold uppercase">MM</p>
                <p className="text-xs font-bold text-indigo-500">{mb.mm}</p>
              </div>
              <div>
                <p className="text-[9px] text-muted-foreground font-bold uppercase">ENT</p>
                <p className="text-xs font-bold text-emerald-500">{mb.ent}</p>
              </div>
            </div>

            {!isAssigned && (
              <div className="shrink-0" title="Mercado no asignado a este usuario">
                <span className="text-amber-500 text-base">⚠️</span>
              </div>
            )}
          </div>
        );
      })}

      {sortedIds.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">Sin datos de mercado</p>
      )}
    </div>
  );
}