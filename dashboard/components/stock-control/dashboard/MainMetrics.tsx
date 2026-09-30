'use client';

import { useEffect, useState } from 'react';
import { RotateButton } from '../shared/RotateButton';
import type { DashboardStats } from '@/lib/stock-control/types';

interface Props {
  stats?: DashboardStats;
  autoRotate: boolean;
  onToggleAutoRotate: () => void;
}

const COLOR_MAP: Record<string, string> = {
  emerald: 'text-emerald-500',
  rose:    'text-rose-500',
  amber:   'text-amber-500',
  sky:     'text-sky-500',
};

function fmt(n: number | undefined): string {
  return (n ?? 0).toLocaleString('es-ES');
}

function fmtPct(n: number | undefined): string {
  return `${(n ?? 0).toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`;
}

function buildPages(stats?: DashboardStats) {
  const s = stats;
  const totalVivos = s?.totalLeadsVivos ?? 0;
  const enPool = s?.leadsEnPool ?? 0;
  const pctPool = totalVivos > 0 ? (enPool / totalVivos) * 100 : 0;

  return [
    {
      cols: 3,
      groups: [
        {
          title: 'Vivos',
          items: [
            { label: 'Total Vivos', value: fmt(s?.totalLeadsVivos) },
            { label: 'En Pool',     value: fmt(s?.leadsEnPool) },
            { label: 'Asignados',   value: fmt(s?.asignadosReales) },
            { label: '% Pool',      value: fmtPct(pctPool) },
          ],
        },
        {
          title: 'Pipeline',
          items: [
            { label: 'Mid-Market',   value: fmt(s?.pipelineMM),  sub: fmtPct(s?.pipelineMMPct) },
            { label: 'Enterprise',   value: fmt(s?.pipelineENT), sub: fmtPct(s?.pipelineENTPct) },
            { label: 'Lead',         value: fmt(s?.pipelineLead), sub: fmtPct(s?.pipelineLeadPct) },
            { label: 'Ratio MM/ENT', value: (s?.ratioMMENT ?? 0).toLocaleString('es-ES', { maximumFractionDigits: 1 }) },
          ],
        },
        {
          title: 'Origen',
          items: [
            { label: 'Inbound',    value: fmt(s?.inboundVivos) },
            { label: 'Outbound',   value: fmt(s?.outboundVivos) },
            { label: '% Inbound',  value: fmtPct(s?.pctInbound) },
            { label: '% Outbound', value: fmtPct(s?.pctOutbound) },
          ],
        },
      ],
    },
    {
      cols: 2,
      groups: [
        {
          title: 'Score',
          items: [
            { label: 'Score Promedio', value: fmt(s?.scorePromedio) },
            { label: 'Score > 80',     value: fmt(s?.scoreOver80) },
            { label: 'Score 60 - 80',  value: fmt(s?.score60to80) },
            { label: 'Score < 60',     value: fmt(s?.scoreUnder60), color: 'rose' },
          ],
        },
        {
          title: 'Calificación',
          items: [
            { label: '% Calificados',    value: fmtPct(s?.porcentajeCalificados),    color: 'emerald' },
            { label: '% Descalificados', value: fmtPct(s?.porcentajeDescalificados), color: 'rose'    },
            { label: 'Calificados',      value: fmt(s?.totalCalificados) },
            { label: 'Descalificados',   value: fmt(s?.totalDescalificados) },
          ],
        },
      ],
    },
  ];
}

export function MainMetrics({ stats, autoRotate, onToggleAutoRotate }: Props) {
  const [page, setPage] = useState(0);
  const pages = buildPages(stats);
  const current = pages[page];

  useEffect(() => {
    if (!autoRotate) return;
    const id = setInterval(() => {
      setPage((p) => (p === pages.length - 1 ? 0 : p + 1));
    }, 10000);
    return () => clearInterval(id);
  }, [autoRotate, pages.length]);

  const goPrev = () => setPage((p) => (p === 0 ? pages.length - 1 : p - 1));
  const goNext = () => setPage((p) => (p === pages.length - 1 ? 0 : p + 1));

  return (
    <div className="p-5 rounded-xl border border-border bg-card shadow-sm h-full flex flex-col relative">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          Métricas Principales
        </h3>
        <RotateButton autoRotate={autoRotate} onToggle={onToggleAutoRotate} />
      </div>

      <button
        onClick={goPrev}
        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 w-7 h-7 rounded-full border border-border bg-card shadow-sm hover:bg-muted transition-colors flex items-center justify-center text-muted-foreground hover:text-foreground"
        title="Página anterior"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <button
        onClick={goNext}
        className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10 w-7 h-7 rounded-full border border-border bg-card shadow-sm hover:bg-muted transition-colors flex items-center justify-center text-muted-foreground hover:text-foreground"
        title="Página siguiente"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      <div
        className="flex-1 grid divide-x divide-border"
        style={{ gridTemplateColumns: `repeat(${current.cols}, minmax(0, 1fr))` }}
      >
        {current.groups.map((group, i) => (
          <div
            key={group.title}
            className={`flex flex-col min-w-0 ${
              i === 0 ? 'pr-4' : i === current.groups.length - 1 ? 'pl-4' : 'px-4'
            }`}
          >
            <p className="text-[11px] font-bold uppercase tracking-wider text-foreground/80 border-b border-border pb-1.5 mb-3">
              {group.title}
            </p>
            <div className="flex-1 flex flex-col justify-around gap-2">
              {group.items.map((m: any) => (
                <div key={m.label} className="min-w-0">
                  <p className="text-[13px] text-muted-foreground font-semibold leading-tight mb-0.5">
                    {m.label}
                  </p>
                  <div className="flex items-baseline gap-1.5">
                    <p
                      className={`text-2xl font-bold leading-none tabular-nums ${
                        m.color ? COLOR_MAP[m.color] : 'text-foreground'
                      }`}
                    >
                      {m.value}
                    </p>
                    {m.sub && (
                      <span className="text-xs font-semibold text-muted-foreground">
                        {m.sub}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-center gap-1.5 mt-3">
        {pages.map((_, i) => (
          <button
            key={i}
            onClick={() => setPage(i)}
            className={`w-1.5 h-1.5 rounded-full transition-colors ${
              i === page ? 'bg-foreground' : 'bg-muted-foreground/30'
            }`}
            title={`Página ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}