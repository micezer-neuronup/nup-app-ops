'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { MarketFlag } from '@/components/stock-control/shared/MarketFlag';
import { deleteUser, fetchAdmins } from '@/lib/api/stock-control';
import type { User } from '@/lib/stock-control/types';

interface Props {
  users: User[];
  onDeleted: () => void;
  onCancel: () => void;
}

type Step = 'pick' | 'confirm' | 'final';

const SECONDARY_BUTTON =
  'px-4 py-2 text-sm font-medium rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors';
const DANGER_BUTTON =
  'px-4 py-2 text-sm font-medium rounded-lg bg-rose-600 text-white hover:bg-rose-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

// ────── Function: DeleteUserPanel ─────────────────────────────────────────
// ─── Step 1: pick a user (users with active leads can't be picked)
// ─── Step 2: first "are you sure" with a summary
// ─── Step 3: say who you are, delete
// ──────────────────────────────────────────────────────────────────────────
export function DeleteUserPanel({ users, onDeleted, onCancel }: Props) {
  const [step, setStep] = useState<Step>('pick');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [admins, setAdmins] = useState<string[]>([]);
  const [deletedBy, setDeletedBy] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchAdmins().then(setAdmins).catch((err) => setError(err.message));
  }, []);

  const selected = users.find((u) => u.id === selectedId) ?? null;
  const q = query.trim().toLowerCase();
  const filtered = [...users]
    .sort((a, b) => a.owner_name.localeCompare(b.owner_name))
    .filter((u) => !q || u.owner_name.toLowerCase().includes(q) || (u.hubspot_user_id ?? '').includes(q));

  const handleDelete = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await deleteUser(selected.id, { deleted_by: deletedBy });
      onDeleted();
    } catch (err: any) {
      setError(err.message || 'No se pudo eliminar el usuario');
    } finally {
      setSaving(false);
    }
  };

  // ─── Paso 1: elegir usuario ───
  if (step === 'pick' || !selected) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Solo se pueden eliminar usuarios sin leads activos. Si tiene leads, vacía primero su stock.
        </p>
        <div className="rounded-lg border border-border overflow-hidden">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre o ID de HubSpot"
            className="w-full border-b border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none"
          />
          <div className="max-h-72 overflow-y-auto divide-y divide-border">
            {filtered.map((u) => {
              const blocked = u.current_stock > 0;
              return (
                <button
                  key={u.id}
                  type="button"
                  disabled={blocked}
                  onClick={() => setSelectedId(u.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors disabled:cursor-not-allowed ${
                    u.id === selectedId ? 'bg-rose-500/10' : 'hover:bg-muted'
                  } ${blocked ? 'opacity-50' : ''}`}
                >
                  <span className="flex-1 min-w-0 truncate text-sm font-medium text-foreground">{u.owner_name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted border border-border">{u.role}</span>
                  <span className={`text-xs ${u.automation_enabled ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                    {u.automation_enabled ? 'Activo' : 'Inactivo'}
                  </span>
                  <span className="w-40 text-right text-xs text-muted-foreground">
                    {blocked ? `Tiene ${u.current_stock} leads activos` : `${u.current_stock}/${u.max_stock} · sin leads`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className={SECONDARY_BUTTON}>Cancelar</button>
          <button onClick={() => setStep('confirm')} disabled={!selected} className={DANGER_BUTTON}>
            Continuar
          </button>
        </div>
      </div>
    );
  }

  // ─── Paso 2: primera confirmación ───
  if (step === 'confirm') {
    return (
      <div className="space-y-4">
        <div className="flex gap-3 rounded-lg border border-rose-500/30 bg-rose-500/5 p-4">
          <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
          <div className="space-y-2 text-sm">
            <p className="font-semibold text-foreground">¿Seguro que quieres eliminar a {selected.owner_name}?</p>
            <ul className="space-y-1 text-muted-foreground">
              <li>Rol: {selected.role} · ID HubSpot: <span className="font-mono">{selected.hubspot_user_id}</span></li>
              <li className="flex items-center gap-1.5">
                Mercados:
                {selected.market_ids.length === 0 && ' ninguno'}
                {selected.market_ids.map((mid) => (
                  <MarketFlag key={mid} marketId={mid} width={18} height={12} />
                ))}
              </li>
              <li>Sin leads activos. Sus leads cerrados (Qualified / Disqualified) se desvinculan pero conservan el owner de HubSpot.</li>
              <li className="font-semibold text-rose-600">Esta acción no se puede deshacer.</li>
            </ul>
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={() => setStep('pick')} className={SECONDARY_BUTTON}>Atrás</button>
          <button onClick={() => setStep('final')} className={DANGER_BUTTON}>Sí, continuar</button>
        </div>
      </div>
    );
  }

  // ─── Paso 3: confirmación final ───
  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground">
        Vas a eliminar a <span className="font-semibold">{selected.owner_name}</span>. Indica quién eres para confirmar.
      </p>
      <label className="block text-sm text-foreground">
        ¿Quién eres?
        <select
          value={deletedBy}
          onChange={(e) => setDeletedBy(e.target.value)}
          className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-rose-500/30"
        >
          <option value="">Selecciona tu nombre</option>
          {admins.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </label>
      <p className="text-xs text-muted-foreground">Queda registrado quién eliminó al usuario y cuándo.</p>
      {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
      <div className="flex justify-end gap-3">
        <button onClick={() => setStep('confirm')} className={SECONDARY_BUTTON}>Atrás</button>
        <button onClick={handleDelete} disabled={!deletedBy || saving} className={DANGER_BUTTON}>
          {saving ? 'Eliminando...' : 'Eliminar definitivamente'}
        </button>
      </div>
    </div>
  );
}
