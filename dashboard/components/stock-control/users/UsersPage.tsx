'use client';

import { useEffect, useMemo, useState } from 'react';
import { UsersHeader } from './UsersHeader';
import { UsersGrid } from './UsersGrid';
import { UserEditModal } from './UserEditModal';
import {
  fetchUsers,
  fetchDashboardStats,
  updateUser,
  updateUserMarketTargets,
  deleteUserMarketTargets,
  fetchUserLeads,
} from '@/lib/api/stock-control';
import type { User, Lead, DashboardStats } from '@/lib/stock-control/types';

export default function UsersPage() {
    const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tooltipId, setTooltipId] = useState<string | null>(null);

  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  const [pipelineList, setPipelineList] = useState<string[]>([]);
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
        target_mm_percent: u.target_mm_percent ?? 40,
        target_e_percent: u.target_e_percent ?? 60,
        market_targets: u.market_targets || null,
        market_breakdown: u.market_breakdown || {},
      }));

      setUsers(normalized);

      const allPipelines = new Set<string>();
      normalized.forEach((u) => u.pipelines.forEach((p) => allPipelines.add(p)));
      if (allPipelines.size > 0) setPipelineList(Array.from(allPipelines));
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

  const handleEditUser = (user: User) => {
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

    if (!editForm.market_ids?.length) {
      alert('El usuario debe tener al menos un mercado asignado');
      return;
    }
    if (!editForm.pipelines?.length) {
      alert('El usuario debe tener al menos un pipeline asignado');
      return;
    }
    if (
      editForm.target_e_percent !== null &&
      editForm.target_e_percent !== undefined &&
      !editForm.pipelines.includes('Enterprise')
    ) {
      alert('No puedes establecer un objetivo ENT sin tener Enterprise habilitado en pipelines');
      return;
    }
    if (editForm.market_targets_enabled) {
      const assigned = editForm.market_ids || [];
      const targets = editForm.market_targets || {};
      const sum = assigned.reduce(
        (acc: number, mid: number) => acc + (targets[mid] || 0),
        0
      );
      if (sum !== 100) {
        alert(`Los porcentajes de mercado deben sumar 100. Actual: ${sum}%`);
        return;
      }
    }

    try {
      await updateUser(editingUser.id, {
        market_ids: editForm.market_ids,
        max_stock: editForm.max_stock,
        restock_threshold: editForm.restock_threshold,
        role: editForm.role,
        pipelines: editForm.pipelines,
        target_e_percent: editForm.target_e_percent,
      });

      if (editForm.market_targets_enabled) {
        const assigned = editForm.market_ids || [];
        const targets = editForm.market_targets || {};
        const targetsArray = assigned.map((mid: number) => ({
          market_id: mid,
          target_percent: targets[mid] || 0,
        }));
        await updateUserMarketTargets(editingUser.id, targetsArray);
      } else {
        await deleteUserMarketTargets(editingUser.id);
      }

      await loadUsers();
      setEditingUser(null);
    } catch (err: any) {
      alert(err.message || 'No se pudieron guardar los cambios');
    }
  };


    // ── Render ───────────────────────────────────────────────
  return (
    <div className="flex flex-1 flex-col min-h-screen bg-background">
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          <div className="px-4 lg:px-6 space-y-4">
            <UsersHeader
              headerStats={headerStats}
              loading={loading}
              onReload={() => {
                loadUsers();
                loadHeaderStats();
              }}
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
                tooltipId={tooltipId}
                setTooltipId={setTooltipId}
                onEdit={handleEditUser}
                onToggleAutomation={toggleUserAutomation}
              />
            )}

            {editingUser && (
              <UserEditModal
                user={editingUser}
                editForm={editForm}
                setEditForm={setEditForm}
                pipelineList={pipelineList}
                onSave={handleSaveEdit}
                onClose={() => setEditingUser(null)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}