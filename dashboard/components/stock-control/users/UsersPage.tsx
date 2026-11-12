'use client';

import { useEffect, useState } from 'react';
import { UsersHeader } from './UsersHeader';
import { UsersGrid } from './UsersGrid';
import { UserEditModal } from './UserEditModal';
import { DeleteUserPanel } from './DeleteUserPanel';
import {
  fetchUsers,
  fetchDashboardStats,
  updateUser,
  createUser,
  fetchHubspotOwners,
  updateUserMarketTargets,
  deleteUserMarketTargets,
} from '@/lib/api/stock-control';
import type { User, DashboardStats, HubspotOwner } from '@/lib/stock-control/types';

const PIPELINE_OPTIONS = ['Mid-Market', 'Enterprise'];

// ────── Function: validateForm ────────────────────────────────────────────
// ─── Checks the user form (create and edit); returns the error text or null
// ──────────────────────────────────────────────────────────────────────────
function validateForm(form: any, isCreate: boolean): string | null {
  if (isCreate && !form.hubspot_user_id) return 'Elige un usuario de HubSpot';
  if (!form.market_ids?.length) return 'El usuario debe tener al menos un mercado asignado';
  if (!form.pipelines?.length) return 'El usuario debe tener al menos un pipeline asignado';
  if (!(form.max_stock > 0)) return 'Max stock debe ser mayor que 0';
  if (form.restock_threshold < 0 || form.restock_threshold >= form.max_stock) {
    return 'El umbral de recarga debe ser menor que max stock';
  }
  if (form.target_e_percent !== null && form.target_e_percent !== undefined && !form.pipelines.includes('Enterprise')) {
    return 'No puedes establecer un objetivo ENT sin tener Enterprise habilitado en pipelines';
  }
  if (form.market_targets_enabled) {
    const targets = form.market_targets || {};
    const sum = form.market_ids.reduce((acc: number, mid: number) => acc + (targets[mid] || 0), 0);
    if (sum !== 100) return `Los porcentajes de mercado deben sumar 100. Actual: ${sum}%`;
  }
  return null;
}

// Saves (or clears) the per-market targets of a user from the form
async function saveMarketTargets(userId: number, form: any) {
  if (form.market_targets_enabled) {
    const targets = form.market_targets || {};
    await updateUserMarketTargets(
      userId,
      form.market_ids.map((mid: number) => ({ market_id: mid, target_percent: targets[mid] || 0 }))
    );
  } else {
    await deleteUserMarketTargets(userId);
  }
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [owners, setOwners] = useState<HubspotOwner[]>([]);
  const [ownersLoading, setOwnersLoading] = useState(false);

  const [headerStats, setHeaderStats] = useState<DashboardStats | null>(null);

  // ── Carga de datos ───────────────────────────────────────
  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchUsers();

      const normalized = data.map((u) => ({
        ...u,
        market_ids: u.market_ids || [],
        market_names: u.market_names || [],
        automation_enabled: u.automation_enabled ?? true,
        current_stock: u.current_stock || 0,
        role: u.role || 'BDR',
        pipelines: u.pipelines || [],
        inbound_count: u.inbound_count || 0,
        outbound_count: u.outbound_count || 0,
        mm_count: u.mm_count || 0,
        ent_count: u.ent_count || 0,
        mm_percent: u.mm_percent || 0,
        e_percent: u.e_percent || 0,
        target_mm_percent: u.target_mm_percent ?? null,
        target_e_percent: u.target_e_percent ?? null,
        market_targets: u.market_targets || null,
        market_breakdown: u.market_breakdown || {},
      }));

      setUsers(normalized);
    } catch (err: any) {
      setError(err.message || 'Error al cargar los usuarios');
    } finally {
      setLoading(false);
    }
  };

  const loadHeaderStats = async () => {
    try {
      const s = await fetchDashboardStats();
      setHeaderStats(s);
    } catch (err) {
      console.error('Error al cargar header stats:', err);
    }
  };

  useEffect(() => {
    loadUsers();
    loadHeaderStats();
  }, []);

  // ── Handlers ─────────────────────────────────────────────
  const toggleUserAutomation = async (userId: number) => {
    const user = users.find((u) => u.id === userId);
    if (!user) return;
    const next = !user.automation_enabled;

    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, automation_enabled: next } : u))
    );

    try {
      await updateUser(userId, { automation_enabled: next });
    } catch (err) {
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, automation_enabled: !next } : u))
      );
      alert('Error al guardar el estado de automatización');
    }
  };

  const closeModal = () => {
    setEditingUser(null);
    setCreating(false);
    setFormError(null);
  };

  const handleCreateUser = async () => {
    setCreating(true);
    setFormError(null);
    setEditForm({
      hubspot_user_id: null,
      owner: null,
      role: 'SDR',
      market_ids: [],
      max_stock: 10,
      restock_threshold: 3,
      pipelines: ['Mid-Market'],
      target_e_percent: null,
      market_targets: null,
      market_targets_enabled: false,
    });

    setOwnersLoading(true);
    try {
      setOwners(await fetchHubspotOwners());
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setOwnersLoading(false);
    }
  };

  const handleSaveCreate = async () => {
    const validationError = validateForm(editForm, true);
    if (validationError) return setFormError(validationError);

    setSaving(true);
    try {
      const newId = await createUser({
        hubspot_user_id: editForm.hubspot_user_id,
        role: editForm.role,
        market_ids: editForm.market_ids,
        max_stock: editForm.max_stock,
        restock_threshold: editForm.restock_threshold,
        pipelines: editForm.pipelines,
        target_e_percent: editForm.target_e_percent,
      });
      if (editForm.market_targets_enabled) await saveMarketTargets(newId, editForm);
      await loadUsers();
      closeModal();
    } catch (err: any) {
      setFormError(err.message || 'No se pudo crear el usuario');
    } finally {
      setSaving(false);
    }
  };

  const handleEditUser = (user: User) => {
    setFormError(null);
    setEditingUser(user);
    setEditForm({
      market_ids: user.market_ids || [],
      max_stock: user.max_stock,
      restock_threshold: user.restock_threshold,
      role: user.role,
      pipelines: [...(user.pipelines || [])],
      target_e_percent:
        user.target_e_percent !== undefined && user.target_e_percent !== null
          ? user.target_e_percent
          : null,
      market_targets: user.market_targets || null,
      market_targets_enabled: !!user.market_targets,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingUser) return;

    const validationError = validateForm(editForm, false);
    if (validationError) return setFormError(validationError);

    setSaving(true);
    try {
      await updateUser(editingUser.id, {
        market_ids: editForm.market_ids,
        max_stock: editForm.max_stock,
        restock_threshold: editForm.restock_threshold,
        role: editForm.role,
        pipelines: editForm.pipelines,
        target_e_percent: editForm.target_e_percent,
      });
      await saveMarketTargets(editingUser.id, editForm);
      await loadUsers();
      closeModal();
    } catch (err: any) {
      setFormError(err.message || 'No se pudieron guardar los cambios');
    } finally {
      setSaving(false);
    }
  };


    // ── Render ───────────────────────────────────────────────
  return (
    <div className="flex flex-1 flex-col min-h-screen bg-background">
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          <div className="px-6 md:px-10 lg:px-16 xl:px-20 space-y-4">
            <UsersHeader
              headerStats={headerStats}
              loading={loading}
              onReload={() => {
                loadUsers();
                loadHeaderStats();
              }}
              activeCount={users.filter((u) => u.automation_enabled).length}
              inactiveCount={users.filter((u) => !u.automation_enabled).length}
              onCreateUser={handleCreateUser}
            />

            {loading && (
              <div className="p-8 text-center text-sm text-muted-foreground border rounded-xl">
                Cargando listado de usuarios...
              </div>
            )}

            {error && (
              <div className="p-4 text-center text-sm text-destructive border border-destructive/30 bg-destructive/10 rounded-xl">
                Error: {error}
              </div>
            )}

            {!loading && !error && (
              <UsersGrid
                users={users}
                onEdit={handleEditUser}
                onToggleAutomation={toggleUserAutomation}
              />
            )}

            {(editingUser || creating) && (
              <UserEditModal
                user={creating ? null : editingUser}
                editForm={editForm}
                setEditForm={setEditForm}
                pipelineList={PIPELINE_OPTIONS}
                onSave={creating ? handleSaveCreate : handleSaveEdit}
                onClose={closeModal}
                owners={owners}
                ownersLoading={ownersLoading}
                error={formError}
                saving={saving}
                deletePanel={
                  creating ? (
                    <DeleteUserPanel
                      users={users}
                      onCancel={closeModal}
                      onDeleted={async () => {
                        await loadUsers();
                        loadHeaderStats();
                        closeModal();
                      }}
                    />
                  ) : undefined
                }
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}