'use client';

import { useEffect, useMemo, useState } from 'react';
import { DashboardHeader } from './DashboardHeader';
import { KpiStrip } from './KpiStrip';
import { PoolAssignedByMarket } from './PoolAssignedByMarket';
import { SdrWorkload } from './SdrWorkload';
import { DistributionHistoryModal } from './DistributionHistoryModal';
import { useAutoRotate } from '@/lib/hooks/useAutoRotate';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import {
  fetchDashboardStats,
  fetchGlobalAutomation,
  updateGlobalAutomation,
  fetchMarkets,
  updateMarketAutomation,
  fetchDashboardSettings,
  updateDashboardSettings,
  updateUser,
} from '@/lib/api/stock-control';
import type {
  DashboardStats,
  DashboardSettings,
  Market,
  ViewMode,
} from '@/lib/stock-control/types';

export default function StockControlDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [globalAutomation, setGlobalAutomation] = useState(true);
  const [confirmGlobalOff, setConfirmGlobalOff] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [markets, setMarkets] = useState<Market[]>([]);

  const [poolView, setPoolView] = useState<ViewMode>('tabla');
  const [assignedView, setAssignedView] = useState<ViewMode>('tabla');
  const [poolAutoRotate, setPoolAutoRotate] = useState(false);
  const [assignedAutoRotate, setAssignedAutoRotate] = useState(false);

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
  const setGlobal = async (next: boolean) => {
    setGlobalAutomation(next);
    try {
      await updateGlobalAutomation(next);
      if (next) await loadMarkets();
    } catch (err) {
      console.error('Error:', err);
      setGlobalAutomation(!next);
    }
  };

  // Turning automation OFF asks for confirmation first; turning it ON applies directly
  const toggleGlobalAutomation = () => {
    if (globalAutomation) setConfirmGlobalOff(true);
    else setGlobal(true);
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

  const toggleSdrAutomation = async (userId: number) => {
    const sdr = stats?.sdrWorkloadData.find((s) => s.id === userId);
    if (!sdr) return;
    const next = !sdr.automation_enabled;
    const setSdr = (value: boolean) =>
      setStats((prev) =>
        prev
          ? {
              ...prev,
              sdrWorkloadData: prev.sdrWorkloadData.map((s) =>
                s.id === userId ? { ...s, automation_enabled: value } : s
              ),
            }
          : prev
      );

    setSdr(next);
    try {
      await updateUser(userId, { automation_enabled: next });
    } catch (err) {
      console.error('Error al cambiar automatización:', err);
      setSdr(!next);
    }
  };

  const toggleAutoRotate = async (which: 'pool' | 'assigned') => {
    const isPool = which === 'pool';
    const current = isPool ? poolAutoRotate : assignedAutoRotate;
    const setValue = isPool ? setPoolAutoRotate : setAssignedAutoRotate;

    setValue(!current);
    try {
      await updateDashboardSettings(
        isPool ? { pool_auto_rotate: !current } : { assigned_auto_rotate: !current }
      );
    } catch (err) {
      console.error('Error al guardar auto-rotate:', err);
      setValue(current);
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
    huecos: m.huecos,
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


  // ── Loading (first load only; "Recargar" keeps the page visible) ──
  if (!stats) {
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
    <div className="flex flex-1 flex-col gap-4 py-4 w-full">
      <div className="w-full px-6 md:px-10 lg:px-16 xl:px-20">
        <DashboardHeader
          globalAutomation={globalAutomation}
          onToggleGlobal={toggleGlobalAutomation}
          markets={markets}
          onToggleMarket={toggleMarketAutomation}
          onReload={loadStats}
          loading={loading}
          lastSync={stats.lastSync}
          onOpenHistory={() => setHistoryOpen(true)}
        />
      </div>

      {historyOpen && <DistributionHistoryModal onClose={() => setHistoryOpen(false)} />}

      <AlertDialog open={confirmGlobalOff} onOpenChange={setConfirmGlobalOff}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desactivar la automatización?</AlertDialogTitle>
            <AlertDialogDescription>
              Se detiene la distribución en todos los mercados. No se asignarán leads hasta que la vuelvas a activar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => setGlobal(false)}>Desactivar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="w-full px-6 md:px-10 lg:px-16 xl:px-20 pb-4 flex flex-col gap-4">
        <KpiStrip stats={stats} />

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
          <PoolAssignedByMarket
            title="Pool por Mercado"
            rows={poolRows}
            showHuecos
            view={poolView}
            setView={setPoolView}
            autoRotate={poolAutoRotate}
            onToggleAutoRotate={() => toggleAutoRotate('pool')}
          />
          <PoolAssignedByMarket
            title="Asignados por Mercado"
            rows={assignedRows}
            view={assignedView}
            setView={setAssignedView}
            autoRotate={assignedAutoRotate}
            onToggleAutoRotate={() => toggleAutoRotate('assigned')}
          />
        </section>

        <section>
          <SdrWorkload
            sdrData={stats.sdrWorkloadData}
            markets={markets}
            onToggleAutomation={toggleSdrAutomation}
          />
        </section>
      </div>
    </div>
  );
}