'use client';

import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { MarketFlag } from '@/components/stock-control/shared/MarketFlag';
import { MARKET_LIST } from '@/lib/stock-control/constants';
import type { HubspotOwner, User } from '@/lib/stock-control/types';

interface Props {
  /** null = create mode (new user) */
  user: User | null;
  editForm: any;
  setEditForm: (f: any) => void;
  pipelineList: string[];
  onSave: () => void;
  onClose: () => void;
  owners?: HubspotOwner[];
  ownersLoading?: boolean;
  error?: string | null;
  saving?: boolean;
  /** Create mode only: content of the "Eliminar" tab (shows the Crear | Eliminar tabs) */
  deletePanel?: ReactNode;
}

const ROLES = ['SDR', 'BDR', 'AE', 'SM'];
const DEFAULT_ENT_TARGET = 60;

function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{children}</h3>
      {right}
    </div>
  );
}

// ────── Function: OwnerPicker ─────────────────────────────────────────────
// ─── Searchable list of HubSpot owners; only these can become users
// ──────────────────────────────────────────────────────────────────────────
function OwnerPicker({
  owners,
  loading,
  selectedId,
  onSelect,
}: {
  owners: HubspotOwner[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (owner: HubspotOwner) => void;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const filtered = owners.filter(
    (o) => !q || o.name.toLowerCase().includes(q) || o.email.toLowerCase().includes(q) || o.id.includes(q)
  );

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar por nombre, email o ID de HubSpot"
        className="w-full border-b border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none"
      />
      <div className="max-h-40 overflow-y-auto divide-y divide-border">
        {loading && <p className="px-3 py-3 text-sm text-muted-foreground">Cargando usuarios de HubSpot...</p>}
        {!loading && filtered.length === 0 && (
          <p className="px-3 py-3 text-sm text-muted-foreground">Sin resultados</p>
        )}
        {filtered.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onSelect(o)}
            className={`w-full text-left px-3 py-1.5 transition-colors ${
              o.id === selectedId ? 'bg-emerald-500/15' : 'hover:bg-muted'
            }`}
          >
            <span className="text-sm font-medium text-foreground">{o.name}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              {o.email || 'Sin email'} · ID {o.id}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function UserEditModal({
  user,
  editForm,
  setEditForm,
  pipelineList,
  onSave,
  onClose,
  owners = [],
  ownersLoading = false,
  error = null,
  saving = false,
  deletePanel,
}: Props) {
  const isCreate = user === null;
  const [tab, setTab] = useState<'create' | 'delete'>('create');
  const showTabs = isCreate && deletePanel !== undefined;
  const selectedOwner: HubspotOwner | null = editForm.owner ?? null;
  const marketIds: number[] = editForm.market_ids || [];
  const targets: Record<string, number> = editForm.market_targets || {};
  const customSplit = !!editForm.market_targets_enabled;
  const targetE: number | null = editForm.target_e_percent ?? null;
  const targetsSum = marketIds.reduce((acc, mid) => acc + (targets[mid] || 0), 0);

  const set = (patch: Record<string, unknown>) => setEditForm({ ...editForm, ...patch });

  // Equal split of the selected markets (remainder to the first ones)
  const equalSplit = (ids: number[]) => {
    const base = ids.length ? Math.floor(100 / ids.length) : 0;
    const remainder = ids.length ? 100 - base * ids.length : 0;
    return Object.fromEntries(ids.map((mid, i) => [mid, base + (i < remainder ? 1 : 0)]));
  };

  const toggleMarket = (mid: number) => {
    const next = marketIds.includes(mid) ? marketIds.filter((id) => id !== mid) : [...marketIds, mid];
    set({ market_ids: next, ...(customSplit ? { market_targets: equalSplit(next) } : {}) });
  };

  const togglePipeline = (p: string) => {
    const pipelines: string[] = editForm.pipelines || [];
    set({ pipelines: pipelines.includes(p) ? pipelines.filter((x) => x !== p) : [...pipelines, p] });
  };

  const subtitle = isCreate
    ? selectedOwner
      ? `${selectedOwner.name} · ${selectedOwner.email || 'sin email'}`
      : 'Elige un usuario de HubSpot'
    : `${editForm.role} · ${user.current_stock}/${user.max_stock} en stock · ${user.e_percent}% ENT actual`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-card w-full max-w-4xl rounded-2xl shadow-2xl border border-border overflow-hidden max-h-[94vh] flex flex-col">
        {/* Cabecera */}
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-border bg-muted/30 shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-foreground truncate">
              {showTabs ? 'Altas y bajas' : isCreate ? 'Nuevo usuario' : `Editar ${user.owner_name}`}
            </h2>
            {showTabs ? (
              <div className="mt-2 inline-flex rounded-md border border-border p-0.5 text-sm">
                {[
                  { key: 'create' as const, label: 'Crear' },
                  { key: 'delete' as const, label: 'Eliminar' },
                ].map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTab(t.key)}
                    className={`px-3 py-1 rounded transition-colors ${
                      tab === t.key
                        ? t.key === 'delete'
                          ? 'bg-rose-600 text-white font-semibold'
                          : 'bg-primary text-primary-foreground font-semibold'
                        : 'text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground truncate">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {showTabs && tab === 'delete' ? (
          <div className="flex-1 overflow-y-auto px-6 py-5">{deletePanel}</div>
        ) : (
        <>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Usuario de HubSpot (solo al crear) */}
          {isCreate && (
            <section>
              <SectionTitle>
                Usuario de HubSpot <span className="text-rose-500">*</span>
              </SectionTitle>
              <OwnerPicker
                owners={owners}
                loading={ownersLoading}
                selectedId={editForm.hubspot_user_id ?? null}
                onSelect={(o) => set({ hubspot_user_id: o.id, owner: o })}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Se crea desactivado: no recibirá leads hasta que actives su automatización.
              </p>
            </section>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* ─── Mercados y reparto ─── */}
            <section>
              <SectionTitle
                right={
                  <div className="inline-flex rounded-md border border-border p-0.5 text-xs">
                    {[
                      { label: 'Equitativo', on: !customSplit },
                      { label: 'Personalizado', on: customSplit },
                    ].map((opt) => (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() =>
                          opt.label === 'Personalizado'
                            ? set({ market_targets_enabled: true, market_targets: equalSplit(marketIds) })
                            : set({ market_targets_enabled: false, market_targets: null })
                        }
                        className={`px-2.5 py-1 rounded transition-colors ${
                          opt.on ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                }
              >
                Mercados y reparto
              </SectionTitle>

              <div className="rounded-lg border border-border divide-y divide-border">
                {MARKET_LIST.map((m) => {
                  const selected = marketIds.includes(m.id);
                  const breakdown = user?.market_breakdown?.[m.id];

                  return (
                    <div key={m.id} className={`flex items-center gap-3 px-3 py-2 ${selected ? '' : 'opacity-60'}`}>
                      <label className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleMarket(m.id)}
                          className="w-4 h-4 accent-emerald-600"
                        />
                        <MarketFlag marketId={m.id} width={22} height={15} />
                        <span className="text-sm text-foreground truncate">{m.name}</span>
                      </label>

                      {breakdown && breakdown.total > 0 && (
                        <span className="group/mk relative text-xs text-muted-foreground cursor-help whitespace-nowrap">
                          {breakdown.total} leads
                          <span className="pointer-events-none absolute right-0 bottom-full z-10 mb-1 hidden w-max rounded-md border border-border bg-card px-2 py-1 text-[11px] text-foreground shadow-md group-hover/mk:block">
                            IN {breakdown.inbound} · OUT {breakdown.outbound} · MM {breakdown.mm} · ENT {breakdown.ent}
                          </span>
                        </span>
                      )}

                      {customSplit && selected && (
                        <div className="flex items-center gap-1 shrink-0">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={targets[m.id] || 0}
                            onChange={(e) =>
                              set({
                                market_targets: {
                                  ...targets,
                                  [m.id]: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)),
                                },
                              })
                            }
                            className="w-16 rounded-md border border-border bg-background px-2 py-1 text-sm text-right text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                          />
                          <span className="text-sm text-muted-foreground">%</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <p className="mt-1.5 text-xs text-muted-foreground">
                {customSplit ? (
                  <>
                    Suma:{' '}
                    <span className={`font-semibold ${targetsSum === 100 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {targetsSum}%
                    </span>
                    {targetsSum !== 100 && ' (debe ser 100%)'}
                  </>
                ) : (
                  'El stock se reparte por igual entre los mercados marcados.'
                )}
              </p>
            </section>

            {/* ─── Rol, capacidad, pipelines y objetivo ENT ─── */}
            <div className="space-y-5">
              <section>
                <SectionTitle>Rol y capacidad</SectionTitle>
                <div className="flex items-end gap-3">
                  <label className="text-xs text-muted-foreground">
                    Rol
                    <select
                      value={editForm.role}
                      onChange={(e) => set({ role: e.target.value })}
                      className="mt-1 block rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Max stock
                    <input
                      type="number"
                      min={1}
                      value={editForm.max_stock}
                      onChange={(e) => set({ max_stock: parseInt(e.target.value) || 0 })}
                      className="mt-1 block w-20 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Umbral recarga
                    <input
                      type="number"
                      min={0}
                      value={editForm.restock_threshold}
                      onChange={(e) => set({ restock_threshold: parseInt(e.target.value) || 0 })}
                      className="mt-1 block w-20 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </label>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Se recarga cuando baja a {editForm.restock_threshold} leads o menos.
                </p>
              </section>

              <section>
                <SectionTitle>Pipelines</SectionTitle>
                <div className="flex gap-2">
                  {pipelineList.map((p) => {
                    const on = (editForm.pipelines || []).includes(p);
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => togglePipeline(p)}
                        className={`px-3 py-1.5 rounded-md border text-sm transition-colors ${
                          on
                            ? 'bg-primary text-primary-foreground border-primary font-semibold'
                            : 'border-border text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section>
                <SectionTitle
                  right={
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={targetE === null}
                        onChange={(e) => set({ target_e_percent: e.target.checked ? null : DEFAULT_ENT_TARGET })}
                        className="w-3.5 h-3.5 accent-emerald-600"
                      />
                      Sin objetivo
                    </label>
                  }
                >
                  Objetivo Enterprise
                </SectionTitle>

                {targetE === null ? (
                  <p className="text-sm text-muted-foreground">Sin objetivo: se reparte ENT y MM según haya leads.</p>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-emerald-600">ENT</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={targetE}
                        onChange={(e) => set({ target_e_percent: parseInt(e.target.value) })}
                        className="flex-1 accent-emerald-600"
                      />
                      <span className="text-xs font-semibold text-indigo-500">MM</span>
                    </div>
                    <p className="mt-1 text-sm text-foreground">
                      <span className="font-bold">{targetE}%</span> ENT /{' '}
                      <span className="font-bold">{100 - targetE}%</span> MM
                    </p>
                  </>
                )}

                <p className="mt-1 text-xs text-muted-foreground">
                  {!isCreate && `Actual: ${user.e_percent}% ENT`}
                  {targetE !== null && !(editForm.pipelines || []).includes('Enterprise') && (
                    <span className="block text-amber-600 font-medium">El objetivo ENT requiere Enterprise en pipelines</span>
                  )}
                </p>
              </section>
            </div>
          </div>
        </div>

        {/* Pie */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-muted/30 shrink-0">
          {error && <p className="mr-auto text-sm font-medium text-rose-600">{error}</p>}
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onSave}
            disabled={saving || (isCreate && !editForm.hubspot_user_id)}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Guardando...' : isCreate ? 'Crear' : 'Guardar'}
          </button>
        </div>
        </>
        )}
      </div>
    </div>
  );
}
