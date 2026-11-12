'use client';

import { useEffect, useState } from 'react';
import { ChevronRight, X } from 'lucide-react';
import { MarketFlag } from '@/components/stock-control/shared/MarketFlag';
import { fetchDistributionRun, fetchDistributionRuns } from '@/lib/api/stock-control';
import type { DistributionAssignmentItem, DistributionRun } from '@/lib/stock-control/types';

interface Props {
  onClose: () => void;
}

const TRIGGER_LABEL: Record<DistributionRun['trigger'], string> = {
  automatica: 'Automática',
  manual: 'Manual',
  script: 'Script',
};

function fmtDate(iso: string, withYear = false): string {
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    ...(withYear ? { year: 'numeric' } : {}),
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ────── Function: summarizeByUser ─────────────────────────────────────────
// ─── Groups the assigned leads of a run by user: total, per market and MM/ENT
// ──────────────────────────────────────────────────────────────────────────
function summarizeByUser(items: DistributionAssignmentItem[]) {
  const map = new Map<string, { name: string; count: number; markets: Record<number, number>; mm: number; ent: number }>();
  for (const it of items) {
    const name = it.userName || 'Sin usuario';
    const u = map.get(name) ?? { name, count: 0, markets: {}, mm: 0, ent: 0 };
    u.count += 1;
    if (it.marketId != null) u.markets[it.marketId] = (u.markets[it.marketId] ?? 0) + 1;
    if (it.pipeline?.includes('Enterprise')) u.ent += 1;
    else if (it.pipeline?.includes('Mid-Market')) u.mm += 1;
    map.set(name, u);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

export function DistributionHistoryModal({ onClose }: Props) {
  const [includeEmpty, setIncludeEmpty] = useState(false);
  const [runs, setRuns] = useState<DistributionRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<DistributionAssignmentItem[] | null>(null);
  const [showLeads, setShowLeads] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchDistributionRuns(includeEmpty)
      .then((data) => {
        setRuns(data);
        setSelectedId(data[0]?.id ?? null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [includeEmpty]);

  useEffect(() => {
    setDetail(null);
    setShowLeads(false);
    if (selectedId === null) return;
    fetchDistributionRun(selectedId)
      .then(setDetail)
      .catch((err) => setError(err.message));
  }, [selectedId]);

  const selected = runs.find((r) => r.id === selectedId) ?? null;
  const users = detail ? summarizeByUser(detail) : [];
  const maxCount = Math.max(1, ...users.map((u) => u.count));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-card w-full max-w-5xl rounded-2xl shadow-2xl border border-border overflow-hidden h-[min(640px,88vh)] flex flex-col">
        {/* Cabecera */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-border bg-muted/30 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-foreground">Historial de distribuciones</h2>
            <p className="text-sm text-muted-foreground">Leads asignados en cada ejecución del reparto</p>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={includeEmpty}
                onChange={(e) => setIncludeEmpty(e.target.checked)}
                className="w-3.5 h-3.5 accent-emerald-600"
              />
              Incluir ejecuciones sin leads
            </label>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-[260px_1fr]">
          {/* ─── Lista de ejecuciones ─── */}
          <div className="border-r border-border overflow-y-auto">
            {loading && <p className="p-4 text-sm text-muted-foreground">Cargando...</p>}
            {!loading && runs.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">Todavía no hay distribuciones registradas.</p>
            )}
            {runs.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedId(r.id)}
                className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border text-left transition-colors ${
                  r.id === selectedId ? 'bg-muted' : 'hover:bg-muted/50'
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{fmtDate(r.startedAt)}</p>
                  <p className="text-[11px] text-muted-foreground">{TRIGGER_LABEL[r.trigger]}</p>
                </div>
                {r.status === 'error' ? (
                  <span className="text-xs font-semibold text-rose-600">Error</span>
                ) : r.status === 'running' ? (
                  <span className="text-xs font-semibold text-amber-600">En curso</span>
                ) : (
                  <span className={`text-sm font-bold tabular-nums ${r.totalAssigned > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {r.totalAssigned}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ─── Detalle de la ejecución ─── */}
          <div className="overflow-y-auto px-6 py-5">
            {error && <p className="mb-3 text-sm font-medium text-rose-600">{error}</p>}
            {!selected && !loading && <p className="text-sm text-muted-foreground">Selecciona una ejecución.</p>}

            {selected && (
              <>
                <p className="text-2xl font-bold text-foreground">
                  {selected.totalAssigned} leads distribuidos
                </p>
                <p className="text-sm text-muted-foreground">
                  {fmtDate(selected.startedAt, true)} · {TRIGGER_LABEL[selected.trigger]}
                  {selected.restarts > 0 && ` · ${selected.restarts} reinicios`}
                </p>
                {selected.note && <p className="mt-2 text-sm text-muted-foreground">{selected.note}</p>}
                {selected.error && (
                  <p className="mt-2 rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600">{selected.error}</p>
                )}

                {/* Por usuario */}
                {users.length > 0 && (
                  <div className="mt-5 space-y-2">
                    {users.map((u) => (
                      <div key={u.name} className="grid grid-cols-[minmax(0,12rem)_1fr_auto] items-center gap-3 text-sm">
                        <span className="truncate font-medium text-foreground" title={u.name}>{u.name}</span>
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${(u.count / maxCount) * 100}%` }} />
                          <span className="font-bold tabular-nums text-foreground">{u.count}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground whitespace-nowrap">
                          {Object.entries(u.markets).map(([mid, n]) => (
                            <span key={mid} className="flex items-center gap-1">
                              <MarketFlag marketId={Number(mid)} width={16} height={11} />
                              {n}
                            </span>
                          ))}
                          <span>· MM {u.mm} · ENT {u.ent}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Lista de leads */}
                {detail && detail.length > 0 && (
                  <div className="mt-5">
                    <button
                      type="button"
                      onClick={() => setShowLeads(!showLeads)}
                      className="flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ChevronRight className={`w-4 h-4 transition-transform ${showLeads ? 'rotate-90' : ''}`} />
                      Ver los {detail.length} leads
                    </button>
                    {showLeads && (
                      <div className="mt-2 rounded-lg border border-border divide-y divide-border text-sm">
                        {detail.map((d) => (
                          <div key={d.leadId} className="grid grid-cols-[1fr_10rem_auto_5rem_3rem] items-center gap-3 px-3 py-1.5">
                            <span className="truncate text-foreground" title={d.leadName ?? d.leadId}>{d.leadName ?? d.leadId}</span>
                            <span className="truncate text-muted-foreground" title={d.userName ?? ''}>{d.userName}</span>
                            {d.marketId != null ? <MarketFlag marketId={d.marketId} width={18} height={12} /> : <span />}
                            <span className="text-xs text-muted-foreground">{d.pipeline?.includes('Enterprise') ? 'ENT' : 'MM'}</span>
                            <span className="text-right tabular-nums text-muted-foreground">{d.score ?? '—'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
