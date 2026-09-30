'use client';

import { CustomTooltip } from '@/components/stock-control/shared/Tooltips';
import type { User } from '@/lib/stock-control/types';

interface Props {
  user: User;
  tooltipId: string | null;
  setTooltipId: (id: string | null) => void;
  onEdit: (user: User) => void;
  onToggleAutomation: (userId: number) => void;
}

export function UserCard({
  user,
  tooltipId,
  setTooltipId,
  onEdit,
  onToggleAutomation,
}: Props) {
  const carga = Math.round((user.current_stock / Math.max(user.max_stock, 1)) * 100);
  const isOverloaded = carga > 100;

  const dotColor = isOverloaded
    ? '#f43f5e'
    : carga > 80
    ? '#f59e0b'
    : carga > 50
    ? '#3b82f6'
    : '#10b981';

  const badges = [
    { key: 'in',  label: `IN ${user.inbound_count}`,  tooltip: 'Inbound',     value: user.inbound_count },
    { key: 'out', label: `OUT ${user.outbound_count}`, tooltip: 'Outbound',    value: user.outbound_count },
    { key: 'mm',  label: `MM ${user.mm_percent}%`,    tooltip: 'Mid-Market',  value: user.mm_percent },
    { key: 'e',   label: `ENT ${user.e_percent}%`,    tooltip: 'Enterprise',  value: user.e_percent },
  ];

  return (
    <div className="rounded-lg border-2 border-foreground/20 bg-card hover:border-primary/40 hover:shadow-md transition-all group overflow-visible p-2 space-y-1.5">
      {/* Fila 1: Nombre + Rol + Objetivo ENT */}
      <div className="flex items-center gap-1">
        <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />
        <p className="text-xs font-bold truncate">{user.owner_name}</p>
        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium bg-muted text-foreground border border-border shrink-0">
          {user.role}
        </span>

        <div
          className="relative inline-flex shrink-0 ml-auto"
          onMouseEnter={() => setTooltipId(`${user.id}-target-e`)}
          onMouseLeave={() => setTooltipId(null)}
        >
          <span className="text-[9px] font-medium text-foreground cursor-help whitespace-nowrap">
            {user.target_e_percent === null || user.target_e_percent === undefined
              ? 'X'
              : `ENT ${user.target_e_percent}%`}
          </span>
          {tooltipId === `${user.id}-target-e` && (
            <div className="absolute right-full top-1/2 -translate-y-1/2 mr-2 z-50">
              <CustomTooltip
                active={true}
                payload={[{
                  name: 'Enterprise',
                  value:
                    user.target_e_percent === null || user.target_e_percent === undefined
                      ? 'No aplica'
                      : user.target_e_percent,
                  color: '#64748b',
                }]}
                label={`${user.owner_name} - Objetivo`}
              />
            </div>
          )}
        </div>
      </div>

      {/* Fila 2: Stock + botones */}
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] text-muted-foreground font-medium shrink-0">Stock</span>
        <div className="flex-1 h-1.5 bg-muted/70 rounded-full overflow-hidden">
          <div className="h-full flex rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.min(carga, 100)}%` }} />
            {isOverloaded && <div className="h-full bg-rose-500" style={{ width: `${carga - 100}%` }} />}
          </div>
        </div>
        <span className={`text-[9px] font-bold shrink-0 ${isOverloaded ? 'text-rose-500' : 'text-foreground'}`}>
          {user.current_stock}/{user.max_stock}
        </span>

        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => onEdit(user)}
            className="shrink-0 p-1 rounded-full border transition-all bg-blue-500/15 border-blue-500/40 text-blue-600 hover:bg-blue-500/25"
            title="Editar usuario"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={() => onToggleAutomation(user.id)}
            className={`shrink-0 p-1 rounded-full border transition-all ${
              user.automation_enabled
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-500'
                : 'bg-rose-500/10 border-rose-500/40 text-rose-500'
            }`}
            title={user.automation_enabled ? 'Autom. ON' : 'Autom. OFF'}
          >
            <svg
              className={`w-3 h-3 transition-transform ${user.automation_enabled ? 'animate-spin' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Fila 3: Badges */}
      <div className="flex items-center gap-1">
        <span className="text-[8px] text-muted-foreground font-semibold uppercase tracking-wider shrink-0">Actual:</span>
        {badges.map((b) => (
          <div
            key={b.key}
            className="relative inline-flex shrink-0 min-w-0 flex-1"
            onMouseEnter={() => setTooltipId(`${user.id}-current-${b.key}`)}
            onMouseLeave={() => setTooltipId(null)}
          >
            <span className="w-full text-center text-[9px] px-1 py-0.5 rounded-full font-medium bg-muted text-foreground border border-border cursor-help whitespace-nowrap">
              {b.label}
            </span>
            {tooltipId === `${user.id}-current-${b.key}` && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50">
                <CustomTooltip
                  active={true}
                  payload={[{ name: b.tooltip, value: b.value, color: '#64748b' }]}
                  label={`${user.owner_name} - ${b.tooltip}`}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}