'use client';

import { useEffect, useMemo, useState } from 'react';
import { DashboardHeader } from './DashboardHeader';
import { MainMetrics } from './MainMetrics';
import { PoolByMarket } from './PoolByMarket';
import { AssignedByMarket } from './AssignedByMarket';
import { StatesChart } from './StatesChart';
import { SdrWorkload } from './SdrWorkload';
import { ManageUsersCard } from './ManageUsersCard';
import { useAutoRotate } from '@/lib/hooks/useAutoRotate';
import {
  fetchDashboardStats,
  fetchGlobalAutomation,
  updateGlobalAutomation,
  fetchMarkets,
  updateMarketAutomation,
  fetchDashboardSettings,
  updateDashboardSettings,
  fetchUserByName,
  updateUser,
} from '@/lib/api/stock-control';
import type {
  DashboardStats,
  DashboardSettings,
  Market,
  ViewMode,
} from '@/lib/stock-control/types';

const DEFAULT_MARKETS: Market[] = [
  { id: 1, name: 'España',            flag: '🇪🇸', automation_enabled: true },
  { id: 2, name: 'Brasil - Portugal', flag: '🇧🇷', automation_enabled: true },
  { id: 3, name: 'Francia',           flag: '🇫🇷', automation_enabled: false },
  { id: 4, name: 'LATAM',             flag: '🌎', automation_enabled: true },
  { id: 5, name: 'Italia',            flag: '🇮🇹', automation_enabled: true },
  { id: 6, name: 'USA',               flag: '🇺🇸', automation_enabled: false },
];

export default function StockControlDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [globalAutomation, setGlobalAutomation] = useState(true);
  const [markets, setMarkets] = useState<Market[]>(DEFAULT_MARKETS);

  const [poolView, setPoolView] = useState<ViewMode>('tabla');
  const [assignedView, setAssignedView] = useState<ViewMode>('tabla');
  const [poolAutoRotate, setPoolAutoRotate] = useState(false);
  const [assignedAutoRotate, setAssignedAutoRotate] = useState(false);

  const [metricsAutoRotate, setMetricsAutoRotate] = useState(false);

  // Rotación automática de Pool / Asignados
  useAutoRotate(poolAutoRotate, poolView, setPoolView);
  useAutoRotate(assignedAutoRotate, assignedView, setAssignedView);

  const loadStats = async () => {
    try {
      setLoading(true);
      const s = await fetchDashboardStats();
      setStats(s);
    } catch (err) {
      console.error('Error al cargar estadísticas:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadGlobal = async () => {
    try {
      setGlobalAutomation(await fetchGlobalAutomation());
    } catch (err) {
      console.error('Error al cargar estado global:', err);
    }
  };

  const loadMarkets = async () => {
    try {
      setMarkets(await fetchMarkets());
    } catch (err) {
      console.error('Error al cargar mercados:', err);
    }
  };

  const loadDashboardSettings = async () => {
  try {
    const s: DashboardSettings = await fetchDashboardSettings();
    setPoolAutoRotate(!!s.pool_auto_rotate);
    setAssignedAutoRotate(!!s.assigned_auto_rotate);
    setMetricsAutoRotate(!!s.metrics_auto_rotate);   // ← nuevo
  } catch (err) {
    console.error('Error al cargar dashboard settings:', err);
  }
};

  useEffect(() => {
    loadStats();
    loadGlobal();
    loadMarkets();
    loadDashboardSettings();
  }, []);

  // ── Toggles ──────────────────────────────────────────────
  const toggleGlobalAutomation = async () => {
    const next = !globalAutomation;
    setGlobalAutomation(next);
    try {
      await updateGlobalAutomation(next);
      if (next) await loadMarkets();
    } catch (err) {
      console.error('Error:', err);
      setGlobalAutomation(!next);
    }
  };

  const toggleMarketAutomation = async (marketId: number) => {
    const market = markets.find((m) => m.id === marketId);
    if (!market) return;
    const next = !market.automation_enabled;
    setMarkets((prev) =>
      prev.map((m) => (m.id === marketId ? { ...m, automation_enabled: next } : m))
    );
    try {
      await updateMarketAutomation(marketId, next);
    } catch (err) {
      console.error('Error:', err);
      setMarkets((prev) =>
        prev.map((m) => (m.id === marketId ? { ...m, automation_enabled: !next } : m))
      );
    }
  };

  const toggleSdrAutomation = async (sdrName: string) => {
    try {
      const users = await fetchUserByName(sdrName);
      if (!users || users.length === 0) return;
      const user = users[0];
      const next = !user.automation_enabled;

      setStats((prev) =>
        prev
          ? {
              ...prev,
              sdrWorkloadData: prev.sdrWorkloadData.map((sdr) =>
                sdr.name === sdrName ? { ...sdr, automation_enabled: next } : sdr
              ),
            }
          : prev
      );

      await updateUser(user.id, { automation_enabled: next });
      await loadStats();
    } catch (err) {
      console.error('Error al cambiar automatización:', err);
    }
  };

  const toggleAutoRotate = async (which: 'pool' | 'assigned' | 'metrics') => {
  const isPool = which === 'pool';
  const isMetrics = which === 'metrics';

  const current = isPool
    ? poolAutoRotate
    : isMetrics
    ? metricsAutoRotate
    : assignedAutoRotate;

  const next = !current;

  if (isPool) setPoolAutoRotate(next);
  else if (isMetrics) setMetricsAutoRotate(next);
  else setAssignedAutoRotate(next);

  try {
    const payload = isPool
      ? { pool_auto_rotate: next }
      : isMetrics
      ? { metrics_auto_rotate: next }
      : { assigned_auto_rotate: next };

    await updateDashboardSettings(payload);
  } catch (err) {
    console.error('Error al guardar auto-rotate:', err);
    if (isPool) setPoolAutoRotate(current);
    else if (isMetrics) setMetricsAutoRotate(current);
    else setAssignedAutoRotate(current);
  }
};

  // ── Datos derivados para los componentes ────────────────
const poolRows = useMemo(() => {
  const total = stats?.leadsEnPool ?? 0;
  return (stats?.marketStackedData || []).map((m) => ({
    name: m.name,
    flagCode: m.flagCode,
    mm: m.poolMM,
    ent: m.poolENT,
    in: m.poolIN,
    out: m.poolOUT,
    total: m.enPool,
    pct: total > 0 ? Math.round((m.enPool / total) * 100) : 0,
  }));
}, [stats]);

const assignedRows = useMemo(() => {
  const total = stats?.asignadosReales ?? 0;
  return (stats?.marketStackedData || []).map((m) => ({
    name: m.name,
    flagCode: m.flagCode,
    mm: m.asigMM,
    ent: m.asigENT,
    in: m.asigIN,
    out: m.asigOUT,
    total: m.asignados,
    pct: total > 0 ? Math.round((m.asignados / total) * 100) : 0,
  }));
}, [stats]);

  const poolTotal = stats?.leadsEnPool ?? 0;
  const assignedTotal = stats?.asignadosReales ?? 0;

  // ── Loading ──────────────────────────────────────────────
  if (loading || !stats) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-sm font-semibold text-muted-foreground">Cargando panel de control...</p>
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────
  return (
    <div className="flex flex-1 flex-col gap-5 py-5 w-full">
      <div className="max-w-7xl mx-auto w-full px-4 md:px-6 lg:px-8">
        <DashboardHeader
          globalAutomation={globalAutomation}
          onToggleGlobal={toggleGlobalAutomation}
          markets={markets}
          onToggleMarket={toggleMarketAutomation}
          onReload={loadStats}
          loading={loading}
        />
      </div>

      <div className="w-full px-6 md:px-10 lg:px-16 xl:px-20 pb-5 flex flex-col gap-5">
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 items-stretch">
          <MainMetrics
  stats={stats}
  autoRotate={metricsAutoRotate}
  onToggleAutoRotate={() => toggleAutoRotate('metrics')}
/>
          <PoolByMarket
            rows={poolRows}
            total={poolTotal}
            view={poolView}
            setView={setPoolView}
            autoRotate={poolAutoRotate}
            onToggleAutoRotate={() => toggleAutoRotate('pool')}
          />
          <AssignedByMarket
            rows={assignedRows}
            total={assignedTotal}
            view={assignedView}
            setView={setAssignedView}
            autoRotate={assignedAutoRotate}
            onToggleAutoRotate={() => toggleAutoRotate('assigned')}
          />
          <StatesChart stateData={stats.stateData} />
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-4 gap-5">
          <SdrWorkload
            sdrData={stats.sdrWorkloadData}
            onToggleAutomation={toggleSdrAutomation}
          />
          <ManageUsersCard />
        </section>
      </div>
    </div>
  );
}