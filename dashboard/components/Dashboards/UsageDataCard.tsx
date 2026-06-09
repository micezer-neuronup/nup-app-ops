// components/Dashboards/UsageDataCard.tsx
"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity, Calendar, Users, ClipboardCheck, PlayCircle, TrendingUp } from "lucide-react";

type Range = 7 | 30 | 90;

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" });
};

const getLastNDays = (daily: any[], days: number) => {
  return daily.slice(-days);
};

interface UsageDataCardProps {
  analytics?: { daily: any[]; totals: any };
  numEmployees?: string | number;
}

export function UsageDataCard({ analytics, numEmployees = "—" }: UsageDataCardProps) {
  const [range, setRange] = useState<Range>(7);

  const dailyData = analytics?.daily || [];

  // Calcular métricas según el rango seleccionado
  const rangeData = useMemo(() => {
    if (!dailyData.length) return null;

    const filtered = getLastNDays(dailyData, range);
    if (filtered.length === 0) return null;

    // Última actividad: cambiamos el nombre conceptualmente a "Última interacción"
    const lastActivityDate = filtered[filtered.length - 1]?.stat_date || null;
    const lastActivityDisplay = lastActivityDate ? formatDate(lastActivityDate) : "—";

    // Terapeutas activos: último valor registrado en el rango
    const lastActiveTherapists = filtered[filtered.length - 1]?.active_therapists ?? 0;

    // Sesiones
    const assignedSessions = filtered.reduce((sum, day) => sum + (day.sessions_assigned || 0), 0);
    const startedSessions = filtered.reduce((sum, day) => sum + (day.sessions_started || 0), 0);
    const completedSessions = filtered.reduce((sum, day) => sum + (day.sessions_finished || 0), 0);
    
    // Tasa de completitud calculada sobre las EMPEZADAS
    const completionRate = startedSessions > 0 ? (completedSessions / startedSessions) * 100 : 0;

    // Evolución (comparativa con el período anterior)
    const previousPeriod = dailyData.slice(-range * 2, -range);
    const prevAssigned = previousPeriod.reduce((sum, day) => sum + (day.sessions_assigned || 0), 0);
    const prevStarted = previousPeriod.reduce((sum, day) => sum + (day.sessions_started || 0), 0);
    const prevCompleted = previousPeriod.reduce((sum, day) => sum + (day.sessions_finished || 0), 0);
    const prevRate = prevStarted > 0 ? (prevCompleted / prevStarted) * 100 : 0;

    const assignedEvolution = prevAssigned ? ((assignedSessions - prevAssigned) / prevAssigned) * 100 : 0;
    const startedEvolution = prevStarted ? ((startedSessions - prevStarted) / prevStarted) * 100 : 0;
    const completedEvolution = prevCompleted ? ((completedSessions - prevCompleted) / prevCompleted) * 100 : 0;
    const rateEvolution = prevRate ? completionRate - prevRate : 0;

    return {
      lastActivity: lastActivityDisplay,
      activeTherapists: lastActiveTherapists,
      assignedSessions,
      startedSessions,
      completedSessions,
      completionRate: Math.round(completionRate),
      evolution: {
        assigned: Math.round(assignedEvolution),
        started: Math.round(startedEvolution),
        completed: Math.round(completedEvolution),
        rate: Math.round(rateEvolution),
      },
    };
  }, [dailyData, range]);

  const MetricRow = ({ icon: Icon, label, value, evolution }: any) => (
    <div className="flex items-center justify-between py-2 border-b last:border-0 px-2 -mx-2 rounded-md transition-colors hover:bg-secondary/50">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">{value}</span>
        {evolution !== undefined && evolution !== 0 && (
          <span className={`text-xs font-medium ${evolution > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {evolution > 0 ? `↑ ${evolution}%` : `↓ ${Math.abs(evolution)}%`}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <Card className="group overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:bg-accent/30">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <CardDescription className="flex items-center gap-1 text-xs uppercase tracking-wider">
            <Activity className="h-3 w-3" /> Datos de uso
          </CardDescription>
          <div className="flex gap-1">
            <Button variant={range === 7 ? "default" : "outline"} size="sm" onClick={() => setRange(7)} className="h-7 px-2 text-xs">7d</Button>
            <Button variant={range === 30 ? "default" : "outline"} size="sm" onClick={() => setRange(30)} className="h-7 px-2 text-xs">30d</Button>
            <Button variant={range === 90 ? "default" : "outline"} size="sm" onClick={() => setRange(90)} className="h-7 px-2 text-xs">90d</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <MetricRow icon={Calendar} label="Última interacción" value={rangeData?.lastActivity || "—"} />
        <MetricRow icon={Users} label="Terapeutas activos" value={rangeData ? `${rangeData.activeTherapists} / ${numEmployees}` : "—"} />
        <MetricRow icon={ClipboardCheck} label="Sesiones asignadas" value={rangeData?.assignedSessions ?? "—"} evolution={rangeData?.evolution.assigned} />
        <MetricRow icon={PlayCircle} label="Sesiones empezadas" value={rangeData?.startedSessions ?? "—"} evolution={rangeData?.evolution.started} />
        <MetricRow icon={TrendingUp} label="Sesiones completadas" value={rangeData?.completedSessions ?? "—"} evolution={rangeData?.evolution.completed} />
        <MetricRow icon={Activity} label="Tasa de completitud" value={rangeData ? `${rangeData.completionRate}%` : "—"} evolution={rangeData?.evolution.rate} />
      </CardContent>
    </Card>
  );
}