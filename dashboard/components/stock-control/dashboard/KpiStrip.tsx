'use client';

import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import type { DashboardStats } from '@/lib/stock-control/types';

interface Props {
  stats: DashboardStats;
}

function fmt(n: number | undefined): string {
  return (n ?? 0).toLocaleString('es-ES');
}

function fmtPct(n: number | undefined): string {
  return `${(n ?? 0).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`;
}

function pctOf(part: number, total: number): string {
  return total > 0 ? `${Math.round((part / total) * 100)}%` : '0%';
}

// ────── Function: KpiTile ─────────────────────────────────────────────────
// ─── One compact KPI box with centered content and an info icon
// ─── Shows `value` + `sub`, or custom `children` instead
// ─── `info` is shown on hover under the tile
// ──────────────────────────────────────────────────────────────────────────
function KpiTile({
  label,
  info,
  value,
  sub,
  children,
  warn = false,
  className = '',
}: {
  label: string;
  info: ReactNode;
  value?: string;
  sub?: ReactNode;
  children?: ReactNode;
  warn?: boolean;
  className?: string;
}) {
  return (
    <div className={`group relative min-w-0 rounded-lg border border-border bg-card px-3 py-2 shadow-sm text-center ${className}`}>
      <p className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span className="truncate">{label}</span>
        <Info className="w-3 h-3 shrink-0" />
      </p>

      {children ?? (
        <>
          <p
            className={`mt-0.5 text-xl font-bold leading-tight tabular-nums truncate ${
              warn ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'
            }`}
          >
            {value}
          </p>
          <div className="text-[11px] text-muted-foreground truncate">{sub ?? ' '}</div>
        </>
      )}

      <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-1.5 hidden w-56 -translate-x-1/2 rounded-lg border border-border bg-card p-3 text-left text-xs shadow-md group-hover:block">
        {info}
      </div>
    </div>
  );
}

function InfoText({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground leading-snug">{children}</p>;
}

function DetailRow({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground tabular-nums">{value}</span>
    </div>
  );
}

export function KpiStrip({ stats: s }: Props) {
  const vivos = s.totalLeadsVivos;
  const blocked = s.poolBlocked;
  const external = s.externalOwner;
  const stateValue = (key: string) => s.stateData.find((st) => st.name === key)?.value ?? 0;
  const decided = s.totalCalificados + s.totalDescalificados;

  return (
    <section className="grid grid-cols-3 md:grid-cols-5 xl:grid-cols-10 gap-2">
      <KpiTile
        label="Vivos"
        value={fmt(vivos)}
        sub="En curso"
        info={
          <>
            <InfoText>Leads que se están trabajando. Excluye Qualified, Disqualified y Academy.</InfoText>
            <div className="mt-2">
              <DetailRow label="En pool" value={fmt(s.leadsEnPool)} />
              <DetailRow label="Asignados" value={fmt(s.asignadosReales)} />
              <DetailRow label="Fuera del pool" value={fmt(blocked.total)} />
              <DetailRow label="Owner externo" value={fmt(external.total)} />
            </div>
          </>
        }
      />

      <KpiTile
        label="En pool"
        value={fmt(s.leadsEnPool)}
        sub={`${pctOf(s.leadsEnPool, vivos)} de vivos`}
        info={<InfoText>Leads vivos sin owner, listos para repartir.</InfoText>}
      />

      <KpiTile
        label="Asignados"
        value={fmt(s.asignadosReales)}
        sub={`${pctOf(s.asignadosReales, vivos)} de vivos`}
        info={<InfoText>Leads vivos asignados a un usuario del dashboard.</InfoText>}
      />

      <KpiTile
        label="Score pool"
        value={fmt(s.scorePromedio)}
        sub="Media del pool"
        info={
          <>
            <InfoText>Score medio de los leads del pool.</InfoText>
            <p className="font-semibold text-foreground mt-2 mb-1">Leads vivos por score</p>
            <DetailRow label="Score > 80" value={fmt(s.scoreOver80)} />
            <DetailRow label="Score 60 - 80" value={fmt(s.score60to80)} />
            <DetailRow label="Score < 60" value={fmt(s.scoreUnder60)} />
          </>
        }
      />

      <KpiTile label="In / Out" info={<InfoText>Origen de los leads vivos: inbound y outbound.</InfoText>}>
        <div className="mt-0.5 grid grid-cols-2 divide-x divide-border">
          {[
            { pct: s.pctInbound,  count: s.inboundVivos,  label: 'in' },
            { pct: s.pctOutbound, count: s.outboundVivos, label: 'out' },
          ].map((o) => (
            <div key={o.label} className="min-w-0 px-1">
              <p className="text-lg font-bold leading-7 tabular-nums text-foreground">{Math.round(o.pct ?? 0)}%</p>
              <p className="text-[11px] text-muted-foreground truncate">{fmt(o.count)} {o.label}</p>
            </div>
          ))}
        </div>
      </KpiTile>

      <KpiTile
        label="MM / ENT"
        value={`${fmt(s.pipelineMM)} / ${fmt(s.pipelineENT)}`}
        sub={`Ratio ${(s.ratioMMENT ?? 0).toLocaleString('es-ES')}`}
        info={<InfoText>Leads vivos por pipeline. Ratio = leads MM por cada lead ENT.</InfoText>}
      />

      <KpiTile
        label="Fuera del pool"
        value={fmt(blocked.total)}
        sub={`${fmt(external.total)} owner externo`}
        warn={blocked.total > 0}
        info={
          <>
            <p className="font-semibold text-foreground mb-1">Sin owner, no entran al pool</p>
            <DetailRow label="Sin mercado" value={fmt(blocked.noMarket)} />
            <DetailRow label="Sin score" value={fmt(blocked.noScore)} />
            <DetailRow label="Sin segmento" value={fmt(blocked.noSegment)} />
            <DetailRow label="Vertical no NeuronUP" value={fmt(blocked.notNeuronUP)} />
            <p className="font-semibold text-foreground mt-2 mb-1">Owner externo (ID HubSpot)</p>
            {external.byOwner.length === 0 && <p className="text-muted-foreground">Ninguno</p>}
            {external.byOwner.slice(0, 5).map((o) => (
              <DetailRow key={o.ownerId} label={o.ownerId} value={fmt(o.count)} />
            ))}
          </>
        }
      />

      <KpiTile
        label="En curso"
        className="col-span-2"
        info={<InfoText>Leads vivos por etapa.</InfoText>}
      >
        <div className="mt-0.5 grid grid-cols-3 divide-x divide-border">
          {[
            { key: 'New',   label: 'New' },
            { key: 'Att.',  label: 'Attempting' },
            { key: 'Cont.', label: 'Contacted' },
          ].map((st) => (
            <div key={st.key} className="min-w-0 px-1.5">
              <p className="text-xl font-bold leading-tight tabular-nums text-foreground">{fmt(stateValue(st.key))}</p>
              <p className="text-[10px] text-muted-foreground truncate">{st.label}</p>
            </div>
          ))}
        </div>
      </KpiTile>

      <KpiTile
        label="Calificados"
        value={fmtPct(s.porcentajeCalificados)}
        sub={
          <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden flex">
            {decided > 0 && (
              <>
                <div className="h-full bg-emerald-500" style={{ width: `${s.porcentajeCalificados}%` }} />
                <div className="h-full bg-rose-500" style={{ width: `${s.porcentajeDescalificados}%` }} />
              </>
            )}
          </div>
        }
        info={
          <>
            <InfoText>De los leads ya decididos, % que acaban Qualified.</InfoText>
            <div className="mt-2">
              <DetailRow label="Qualified" value={`${fmt(s.totalCalificados)} · ${fmtPct(s.porcentajeCalificados)}`} />
              <DetailRow label="Disqualified" value={`${fmt(s.totalDescalificados)} · ${fmtPct(s.porcentajeDescalificados)}`} />
            </div>
          </>
        }
      />
    </section>
  );
}
