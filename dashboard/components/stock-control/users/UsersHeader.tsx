'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, UserCog } from 'lucide-react';
import { ModeSwitcher } from '@/components/layout/mode-switcher';
import { MarketFlag } from '@/components/stock-control/shared/MarketFlag';
import type { DashboardStats } from '@/lib/stock-control/types';

interface Props {
  headerStats: DashboardStats | null;
  loading: boolean;
  onReload: () => void;
  activeCount: number;
  inactiveCount: number;
  /** Opens the "Altas y bajas" modal (create / delete users); disabled while not provided */
  onCreateUser?: () => void;
}

// ────── Function: HeaderTile ──────────────────────────────────────────────
// ─── Compact tile with a centered label, same style as the dashboard KPI strip
// ──────────────────────────────────────────────────────────────────────────
function HeaderTile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card px-2 py-1.5 shadow-sm text-center">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground truncate">{label}</p>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

// ────── Function: ValuePair ───────────────────────────────────────────────
// ─── Two values side by side, each with its small caption underneath
// ──────────────────────────────────────────────────────────────────────────
function ValuePair({ items }: { items: { value: number; caption: string; className?: string }[] }) {
  return (
    <div className="grid grid-cols-2 divide-x divide-border">
      {items.map((it) => (
        <div key={it.caption} className="min-w-0 px-1">
          <p className={`text-base font-bold leading-6 tabular-nums ${it.className ?? 'text-foreground'}`}>{it.value}</p>
          <p className="text-[10px] text-muted-foreground truncate">{it.caption}</p>
        </div>
      ))}
    </div>
  );
}

const ACTION_BUTTON =
  'inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-border bg-card text-sm font-medium hover:bg-muted transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed';

export function UsersHeader({ headerStats, loading, onReload, activeCount, inactiveCount, onCreateUser }: Props) {
  const asig = headerStats?.asignadosReales ?? 0;
  const pool = headerStats?.leadsEnPool ?? 0;
  const asigPct = asig + pool > 0 ? (asig / (asig + pool)) * 100 : 0;

  return (
    <header className="flex flex-wrap xl:flex-nowrap items-center justify-between gap-x-3 gap-y-3 border-b border-border pb-4">
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
          <h1 className="text-2xl font-bold tracking-tight text-foreground whitespace-nowrap">Gestión de usuarios</h1>
          <p className="text-xs text-muted-foreground mt-0.5 whitespace-nowrap">Mercados, capacidad y objetivos</p>
        </div>
      </div>

      {/* Métricas: en su propia fila en pantallas pequeñas, en la cabecera desde xl */}
      <section className="order-last xl:order-none w-full xl:w-auto xl:flex-1 min-w-0 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-[1.25fr_1fr_1fr_2.5fr_1.6fr] gap-2">
        <HeaderTile label="Usuarios">
          <ValuePair
            items={[
              { value: activeCount, caption: 'activos', className: 'text-emerald-600 dark:text-emerald-400' },
              { value: inactiveCount, caption: 'inactivos', className: 'text-muted-foreground' },
            ]}
          />
        </HeaderTile>

        <HeaderTile label="Origen">
          <ValuePair
            items={[
              { value: headerStats?.inboundVivos ?? 0, caption: 'in' },
              { value: headerStats?.outboundVivos ?? 0, caption: 'out' },
            ]}
          />
        </HeaderTile>

        <HeaderTile label="Pipeline">
          <ValuePair
            items={[
              { value: headerStats?.pipelineENT ?? 0, caption: 'ENT' },
              { value: headerStats?.pipelineMM ?? 0, caption: 'MM' },
            ]}
          />
        </HeaderTile>

        <HeaderTile label="Mercados (% de vivos)">
          <div className="flex items-center justify-around gap-1 pt-0.5">
            {headerStats?.marketStackedData?.map((m) => (
              <div key={m.name} className="flex flex-col items-center gap-1 min-w-0" title={`${m.name}: ${m.pct}% de los vivos`}>
                <MarketFlag marketName={m.name} width={20} height={14} />
                <span className="text-[11px] font-bold text-foreground leading-none tabular-nums">{m.pct}%</span>
              </div>
            ))}
          </div>
        </HeaderTile>

        <HeaderTile label="Asignados vs pool">
          <div className="flex items-center gap-2" title="Leads vivos asignados frente a leads en el pool">
            <div className="text-center">
              <p className="text-base font-bold leading-6 tabular-nums text-emerald-600 dark:text-emerald-400">{asig}</p>
              <p className="text-[10px] text-muted-foreground">asig.</p>
            </div>
            <div className="flex-1 h-2 rounded-full overflow-hidden bg-muted flex">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${asigPct}%` }} />
              <div className="h-full bg-orange-500 transition-all" style={{ width: `${100 - asigPct}%` }} />
            </div>
            <div className="text-center">
              <p className="text-base font-bold leading-6 tabular-nums text-orange-500">{pool}</p>
              <p className="text-[10px] text-muted-foreground">pool</p>
            </div>
          </div>
        </HeaderTile>
      </section>

      {/* Altas y bajas + Dashboard + Recargar + tema (solo icono por debajo de 2xl) */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onCreateUser}
          disabled={!onCreateUser}
          className={`${ACTION_BUTTON} bg-primary text-primary-foreground border-primary hover:bg-primary/90`}
          title="Altas y bajas de usuarios"
        >
          <UserCog className="w-4 h-4" />
          <span className="hidden 2xl:inline">Altas y bajas</span>
        </button>
        <Link href="/stock-control" className={ACTION_BUTTON} title="Volver al dashboard">
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden 2xl:inline">Dashboard</span>
        </Link>
        <button type="button" onClick={onReload} disabled={loading} className={ACTION_BUTTON} title="Recargar">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden 2xl:inline">Recargar</span>
        </button>
        <ModeSwitcher />
      </div>
    </header>
  );
}
