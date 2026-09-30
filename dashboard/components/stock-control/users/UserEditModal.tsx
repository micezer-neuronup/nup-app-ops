'use client';

import { MarketFlag } from '@/components/stock-control/shared/MarketFlag';
import { MarketBreakdownList } from './MarketBreakdownList';
import { MARKET_LIST } from '@/lib/stock-control/constants';
import type { User } from '@/lib/stock-control/types';

interface Props {
  user: User;
  editForm: any;
  setEditForm: (f: any) => void;
  pipelineList: string[];
  onSave: () => void;
  onClose: () => void;
}

export function UserEditModal({
  user,
  editForm,
  setEditForm,
  pipelineList,
  onSave,
  onClose,
}: Props) {
  const targetE = editForm.target_e_percent;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-card w-full max-w-7xl rounded-2xl shadow-2xl border border-border overflow-hidden max-h-[94vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-border bg-muted/30 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-foreground">Editar {user.owner_name}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Configura mercados, pipelines, capacidad y objetivos
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body: 2 columnas */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-2">
          {/* ─── Izquierda: CONFIGURACIÓN ─── */}
          <div className="px-8 py-6 space-y-6 overflow-y-auto border-r border-border">
            {/* Mercados permitidos */}
            <div>
              <label className="block text-sm font-semibold mb-3 text-foreground">Mercados Permitidos</label>
              <div className="flex flex-wrap gap-2.5">
                {MARKET_LIST.map((m) => {
                  const isSelected = (editForm.market_ids || []).includes(m.id);
                  return (
                    <label
                      key={m.id}
                      title={m.name}
                      className={`flex items-center justify-center px-3 py-2 rounded-lg border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-500/20 border-emerald-500/50'
                          : 'bg-rose-500/10 border-rose-500/30 opacity-60'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          const newIds = e.target.checked
                            ? [...(editForm.market_ids || []), m.id]
                            : (editForm.market_ids || []).filter((id: number) => id !== m.id);
                          setEditForm({ ...editForm, market_ids: newIds });
                        }}
                        className="sr-only"
                      />
                      <MarketFlag marketId={m.id} width={28} height={20} />
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Max stock + umbral */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2 text-foreground">Max Stock</label>
                <input
                  type="number"
                  value={editForm.max_stock}
                  onChange={(e) => setEditForm({ ...editForm, max_stock: parseInt(e.target.value) || 0 })}
                  className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2 text-foreground">Umbral Recarga</label>
                <input
                  type="number"
                  value={editForm.restock_threshold}
                  onChange={(e) => setEditForm({ ...editForm, restock_threshold: parseInt(e.target.value) || 0 })}
                  className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
                />
              </div>
            </div>

            {/* Pipelines + ENT */}
            <div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-3 text-foreground">Pipelines Permitidos</label>
                  <div className="flex flex-wrap gap-2">
                    {pipelineList.map((p) => {
                      const isSelected = editForm.pipelines.includes(p);
                      return (
                        <label
                          key={p}
                          className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-600 font-semibold'
                              : 'bg-rose-500/10 border-rose-500/30 text-rose-600'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setEditForm({ ...editForm, pipelines: [...editForm.pipelines, p] });
                              } else {
                                setEditForm({
                                  ...editForm,
                                  pipelines: editForm.pipelines.filter((x: string) => x !== p),
                                });
                              }
                            }}
                            className="sr-only"
                          />
                          <span>{p}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2 text-foreground">Objetivo ENTERPRISE (%)</label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setEditForm({ ...editForm, target_e_percent: null })}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                        targetE === null || targetE === undefined
                          ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-600 font-semibold'
                          : 'bg-rose-500/10 border-rose-500/30 text-rose-600'
                      }`}
                    >
                      No aplica
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (targetE === null || targetE === undefined) return;
                        if (targetE === 10) setEditForm({ ...editForm, target_e_percent: null });
                        else setEditForm({ ...editForm, target_e_percent: targetE - 10 });
                      }}
                      className="w-8 h-8 rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors flex items-center justify-center text-sm font-bold"
                    >
                      -
                    </button>
                    <div className="w-14 text-center">
                      <p className="text-sm font-bold text-foreground">
                        {targetE === null || targetE === undefined ? 'X' : `${targetE}%`}
                      </p>
                      <p className="text-[9px] text-muted-foreground">
                        {targetE === null || targetE === undefined ? 'MM: -' : `MM: ${100 - targetE}%`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (targetE === null || targetE === undefined) {
                          setEditForm({ ...editForm, target_e_percent: 10 });
                        } else {
                          setEditForm({ ...editForm, target_e_percent: Math.min(100, targetE + 10) });
                        }
                      }}
                      className="w-8 h-8 rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors flex items-center justify-center text-sm font-bold"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {targetE !== null && targetE !== undefined && !editForm.pipelines.includes('Enterprise') && (
                <p className="text-xs text-amber-600 font-medium mt-2">
                  ⚠️ El objetivo ENT requiere Enterprise habilitado
                </p>
              )}
            </div>

            {/* Objetivo por MERCADO */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-semibold text-foreground">Objetivo por MERCADO (%)</label>
                <button
                  type="button"
                  onClick={() => {
                    if (editForm.market_targets_enabled) {
                      setEditForm({ ...editForm, market_targets_enabled: false, market_targets: null });
                    } else {
                      const assigned = editForm.market_ids || [];
                      const base = assigned.length > 0 ? Math.floor(100 / assigned.length) : 0;
                      const remainder = assigned.length > 0 ? 100 - base * assigned.length : 0;
                      const initial: Record<string, number> = {};
                      assigned.forEach((mid: number, i: number) => {
                        initial[mid] = base + (i < remainder ? 1 : 0);
                      });
                      setEditForm({ ...editForm, market_targets_enabled: true, market_targets: initial });
                    }
                  }}
                  className={`text-xs px-3 py-1.5 rounded-md border transition-all ${
                    editForm.market_targets_enabled
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-600 font-semibold'
                      : 'bg-muted border-border text-muted-foreground hover:bg-muted/70'
                  }`}
                >
                  {editForm.market_targets_enabled ? 'Configurado' : 'Equitativo'}
                </button>
              </div>

              {editForm.market_targets_enabled && (
                <div className="space-y-3 p-4 rounded-lg border border-border bg-muted/20">
                  {(editForm.market_ids || []).map((mid: number) => {
                    const marketName = MARKET_LIST.find((m) => m.id === mid)?.name || `Mercado ${mid}`;
                    const pct = (editForm.market_targets || {})[mid] || 0;
                    return (
                      <div key={mid} className="flex items-center gap-3">
                        <MarketFlag marketId={mid} width={24} height={16} />
                        <span className="text-sm text-foreground flex-1 truncate">{marketName}</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={pct}
                          onChange={(e) => {
                            const newPct = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                            setEditForm({
                              ...editForm,
                              market_targets: { ...(editForm.market_targets || {}), [mid]: newPct },
                            });
                          }}
                          className="w-20 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground text-right focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                        <span className="text-sm text-muted-foreground w-4">%</span>
                      </div>
                    );
                  })}

                  <div className="flex items-center justify-between pt-3 border-t border-border">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Suma total</span>
                    <span
                      className={`text-lg font-bold ${
                        (() => {
                          const assigned = editForm.market_ids || [];
                          const targets = editForm.market_targets || {};
                          const sum = assigned.reduce(
                            (acc: number, mid: number) => acc + (targets[mid] || 0),
                            0
                          );
                          return sum === 100 ? 'text-emerald-600' : 'text-rose-600';
                        })()
                      }`}
                    >
                      {(() => {
                        const assigned = editForm.market_ids || [];
                        const targets = editForm.market_targets || {};
                        const sum = assigned.reduce(
                          (acc: number, mid: number) => acc + (targets[mid] || 0),
                          0
                        );
                        return `${sum}%`;
                      })()}
                    </span>
                  </div>

                  {(() => {
                    const assigned = editForm.market_ids || [];
                    const targets = editForm.market_targets || {};
                    const sum = assigned.reduce(
                      (acc: number, mid: number) => acc + (targets[mid] || 0),
                      0
                    );
                    if (sum !== 100) {
                      return <p className="text-xs text-rose-600 font-medium">⚠️ La suma debe ser exactamente 100%</p>;
                    }
                    return null;
                  })()}
                </div>
              )}

              {!editForm.market_targets_enabled && (
                <p className="text-xs text-muted-foreground mt-1.5">
                  Reparto equitativo entre los mercados asignados. Activa para definir porcentajes específicos.
                </p>
              )}
            </div>
          </div>

          {/* ─── Derecha: ESTADO ACTUAL ─── */}
          <div className="px-8 py-6 overflow-y-auto bg-muted/10">
            <div className="mb-4">
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Estado Actual</h3>
              <p className="text-xs text-muted-foreground mt-1">Leads asignados ahora mismo</p>
            </div>

            <div className="flex items-center gap-6 mb-5 pb-4 border-b border-border">
              <div>
                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Stock</p>
                <p className="text-xl font-bold text-foreground">
                  {user.current_stock}
                  <span className="text-sm text-muted-foreground">/{user.max_stock}</span>
                </p>
              </div>
              <div className="w-px h-8 bg-border" />
              <div>
                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Calificación</p>
                <p className="text-xl font-bold text-foreground">
                  {user.e_percent}
                  <span className="text-sm text-muted-foreground">% ENT</span>
                </p>
              </div>
            </div>

            <MarketBreakdownList
              marketBreakdown={user.market_breakdown}
              assignedMarketIds={user.market_ids || []}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-8 py-5 border-t border-border bg-muted/30 shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onSave}
            className="px-5 py-2.5 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}