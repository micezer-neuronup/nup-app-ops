'use client';

import { Pencil, RefreshCw } from 'lucide-react';
import type { User } from '@/lib/stock-control/types';

interface Props {
  user: User;
  onEdit: (user: User) => void;
  onToggleAutomation: (userId: number) => void;
}

export function UserCard({ user, onEdit, onToggleAutomation }: Props) {
  const max = Math.max(user.max_stock, 1);
  const load = user.current_stock / max;
  const active = user.automation_enabled;
  const hasTarget = user.target_e_percent !== null && user.target_e_percent !== undefined;

  // Same color scale as "Carga por SDR": green, amber > 80%, red if overloaded
  const barColor = !active
    ? 'bg-muted-foreground/40'
    : load > 1
    ? 'bg-rose-500'
    : load > 0.8
    ? 'bg-amber-500'
    : 'bg-emerald-500';

  const stats = [
    { label: 'IN',  value: `${user.inbound_count}`,  hint: `${user.inbound_count} leads inbound` },
    { label: 'OUT', value: `${user.outbound_count}`, hint: `${user.outbound_count} leads outbound` },
    {
      label: 'MM',
      value: `${user.mm_percent}%`,
      hint: `${user.mm_count} leads Mid-Market · ${user.mm_percent}% de su stock`,
    },
    {
      label: 'ENT',
      value: `${user.e_percent}%`,
      sub: hasTarget ? `obj. ${user.target_e_percent}%` : 'obj. —',
      hint: `${user.ent_count} leads Enterprise · ${user.e_percent}% de su stock · ${
        hasTarget ? `objetivo ${user.target_e_percent}%` : 'sin objetivo ENT'
      }`,
    },
  ];

  return (
    <div
      className={`rounded-lg border-2 border-foreground/20 bg-card hover:border-primary/40 hover:shadow-md transition-all p-2.5 space-y-2 ${
        active ? '' : 'opacity-60 hover:opacity-100'
      }`}
    >
      {/* Fila 1: Nombre + Rol + botones */}
      <div className="flex items-center gap-1.5">
        <p className="text-xs font-bold truncate min-w-0" title={user.owner_name}>{user.owner_name}</p>
        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium bg-muted text-foreground border border-border shrink-0">
          {user.role}
        </span>
        <div className="ml-auto flex items-center gap-1 shrink-0">
          <button
            onClick={() => onEdit(user)}
            className="p-1 rounded-full border transition-all bg-blue-500/15 border-blue-500/40 text-blue-600 hover:bg-blue-500/25"
            title="Editar usuario"
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button
            onClick={() => onToggleAutomation(user.id)}
            className={`p-1 rounded-full border transition-all ${
              active
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-500'
                : 'bg-rose-500/10 border-rose-500/40 text-rose-500'
            }`}
            title={active ? 'Autom. ON - Click para desactivar' : 'Autom. OFF - Click para activar'}
          >
            <RefreshCw className={`w-3 h-3 ${active ? 'animate-spin' : ''}`} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Fila 2: Stock */}
      <div className="flex items-center gap-2" title={`Stock: ${user.current_stock} de ${user.max_stock}`}>
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div className={`h-full ${barColor} transition-all`} style={{ width: `${Math.min(load, 1) * 100}%` }} />
        </div>
        <span className={`text-[11px] font-bold tabular-nums shrink-0 ${load > 1 ? 'text-rose-500' : 'text-foreground'}`}>
          {user.current_stock}
          <span className="font-normal text-muted-foreground">/{user.max_stock}</span>
        </span>
      </div>

      {/* Fila 3: IN / OUT / MM / ENT (ENT con su objetivo debajo) */}
      <div className="grid grid-cols-[1fr_1fr_1fr_1.5fr] divide-x divide-border rounded-md bg-muted/40 py-1">
        {stats.map((s) => (
          <div key={s.label} className="group/stat relative min-w-0 text-center px-1 cursor-help">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{s.label}</p>
            <p className="text-xs font-bold tabular-nums text-foreground">{s.value}</p>
            {s.sub && <p className="text-[10px] font-semibold text-foreground/70 whitespace-nowrap">{s.sub}</p>}

            <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 hidden w-max max-w-[13rem] -translate-x-1/2 rounded-md border border-border bg-card px-2.5 py-1.5 text-left text-[11px] text-foreground shadow-md group-hover/stat:block">
              <span className="font-semibold">{user.owner_name}</span>
              <br />
              {s.hint}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
