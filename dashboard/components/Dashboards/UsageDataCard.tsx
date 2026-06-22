// components/Dashboards/UsageDataCard.tsx
"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Activity, 
  Calendar, 
  Users, 
  ClipboardCheck, 
  PlayCircle, 
  TrendingUp, 
  FileText,
  Info,
  RotateCcw,
  CheckSquare // ✨ Icono para las actividades realizadas
} from "lucide-react";

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
  const [isFlipped, setIsFlipped] = useState(false);

  const dailyData = analytics?.daily || [];

  const rangeData = useMemo(() => {
    if (!dailyData.length) return null;

    const filtered = getLastNDays(dailyData, range);
    if (filtered.length === 0) return null;

    const lastActivityDate = filtered[filtered.length - 1]?.stat_date || null;
    const lastActivityDisplay = lastActivityDate ? formatDate(lastActivityDate) : "—";
    const lastActiveTherapists = filtered[filtered.length - 1]?.active_therapists ?? 0;

    const assignedSessions = filtered.reduce((sum, day) => sum + (day.sessions_assigned || 0), 0);
    const startedSessions = filtered.reduce((sum, day) => sum + (day.sessions_started || 0), 0);
    const completedSessions = filtered.reduce((sum, day) => sum + (day.sessions_finished || 0), 0);
    const reportsCreated = filtered.reduce((sum, day) => sum + (day.reports_created || 0), 0);
    // ✨ Acumulador periodo actual
    const activitiesStarted = filtered.reduce((sum, day) => sum + (day.activities_started || 0), 0);
    
    const completionRate = startedSessions > 0 ? (completedSessions / startedSessions) * 100 : 0;

    const previousPeriod = dailyData.slice(-range * 2, -range);
    const prevAssigned = previousPeriod.reduce((sum, day) => sum + (day.sessions_assigned || 0), 0);
    const prevStarted = previousPeriod.reduce((sum, day) => sum + (day.sessions_started || 0), 0);
    const prevCompleted = previousPeriod.reduce((sum, day) => sum + (day.sessions_finished || 0), 0);
    const prevReports = previousPeriod.reduce((sum, day) => sum + (day.reports_created || 0), 0);
    // ✨ Acumulador periodo anterior
    const prevActivities = previousPeriod.reduce((sum, day) => sum + (day.activities_started || 0), 0);
    
    const prevRate = prevStarted > 0 ? (prevCompleted / prevStarted) * 100 : 0;

    const assignedEvolution = prevAssigned ? ((assignedSessions - prevAssigned) / prevAssigned) * 100 : 0;
    const startedEvolution = prevStarted ? ((startedSessions - prevStarted) / prevStarted) * 100 : 0;
    const completedEvolution = prevCompleted ? ((completedSessions - prevCompleted) / prevCompleted) * 100 : 0;
    const reportsEvolution = prevReports ? ((reportsCreated - prevReports) / prevReports) * 100 : 0;
    // ✨ Cálculo de evolución porcentual
    const activitiesEvolution = prevActivities ? ((activitiesStarted - prevActivities) / prevActivities) * 100 : 0;
    
    const rateEvolution = prevRate ? completionRate - prevRate : 0;

    return {
      lastActivity: lastActivityDisplay,
      activeTherapists: lastActiveTherapists,
      assignedSessions,
      startedSessions,
      completedSessions,
      reportsCreated,
      activitiesStarted, // ✨ Retorno del total
      completionRate: Math.round(completionRate),
      evolution: {
        assigned: Math.round(assignedEvolution),
        started: Math.round(startedEvolution),
        completed: Math.round(completedEvolution),
        reports: Math.round(reportsEvolution),
        activities: Math.round(activitiesEvolution), // ✨ Retorno de la evolución
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
    // Se ajusta la altura de h-[450px] a h-[480px] para dar espacio a la nueva métrica
    <div className="relative h-[500px] w-full [perspective:1000px] group">
      
      <div 
        className={`w-full h-full transition-all duration-500 [transform-style:preserve-3d] ${isFlipped ? '[transform:rotateY(180deg)]' : ''}`}
      >
        
        {/* ========================================== */}
        {/* 🎭 CARA FRONTAL: Datos de Uso              */}
        {/* ========================================== */}
        <Card className="absolute inset-0 [backface-visibility:hidden] flex flex-col overflow-hidden transition-all duration-300 hover:shadow-lg hover:bg-accent/30">
          <CardHeader className="pb-2">
            <div className="flex justify-between items-start">
              <CardDescription className="flex items-center gap-1 text-xs uppercase tracking-wider">
                <Activity className="h-3 w-3" /> Datos de uso
              </CardDescription>
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <Button variant={range === 7 ? "default" : "outline"} size="sm" onClick={() => setRange(7)} className="h-7 px-2 text-xs">7d</Button>
                  <Button variant={range === 30 ? "default" : "outline"} size="sm" onClick={() => setRange(30)} className="h-7 px-2 text-xs">30d</Button>
                  <Button variant={range === 90 ? "default" : "outline"} size="sm" onClick={() => setRange(90)} className="h-7 px-2 text-xs">90d</Button>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10" 
                  onClick={() => setIsFlipped(true)}
                  title="Ver explicación de las métricas"
                >
                  <Info className="h-4 w-4" />
                </Button>
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
            {/* ✨ Nueva Fila en la interfaz */}
            <MetricRow icon={CheckSquare} label="Actividades realizadas" value={rangeData?.activitiesStarted ?? "—"} evolution={rangeData?.evolution.activities} />
            <MetricRow icon={FileText} label="Informes creados" value={rangeData?.reportsCreated ?? "—"} evolution={rangeData?.evolution.reports} />
          </CardContent>
        </Card>

        {/* ========================================== */}
        {/* 📖 CARA TRASERA: Diccionario / Ayuda       */}
        {/* ========================================== */}
        <Card className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] flex flex-col overflow-hidden bg-accent/20 border-primary/20 shadow-lg">
          <CardHeader className="pb-2 border-b bg-background/50">
            <div className="flex justify-between items-center">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Info className="h-4 w-4 text-primary" /> Diccionario de Métricas
              </CardTitle>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10" 
                onClick={() => setIsFlipped(false)}
                title="Volver a los datos"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto px-4 pb-4 pt-1 space-y-4 text-sm">            
            <div>
              <p className="font-semibold flex items-center gap-1"><Calendar className="h-3 w-3"/> Última interacción</p>
              <p className="text-muted-foreground text-xs">Fecha del último día en el que algún terapeuta del centro inició sesión o registró actividad.</p>
            </div>
            <div>
              <p className="font-semibold flex items-center gap-1"><Users className="h-3 w-3"/> Terapeutas activos</p>
              <p className="text-muted-foreground text-xs">Usuarios profesionales que han entrado a la plataforma dentro del rango de días seleccionado frente al total de profesionales contratados.</p>
            </div>
            <div>
              <p className="font-semibold flex items-center gap-1"><ClipboardCheck className="h-3 w-3"/> Sesiones asignadas</p>
              <p className="text-muted-foreground text-xs">Volumen total de pautas y sesiones que los profesionales han programado a los pacientes.</p>
            </div>
            <div>
              <p className="font-semibold flex items-center gap-1"><PlayCircle className="h-3 w-3"/> Sesiones empezadas / completadas</p>
              <p className="text-muted-foreground text-xs">Sesiones que los pacientes han comenzado y las que han llegado hasta el final de todos los ejercicios.</p>
            </div>
            <div>
              <p className="font-semibold flex items-center gap-1"><Activity className="h-3 w-3"/> Tasa de completitud</p>
              <p className="text-muted-foreground text-xs">Porcentaje que indica cuántas de las sesiones empezadas logran terminarse al 100%.</p>
            </div>
            {/* ✨ Nueva sección explicativa en el diccionario */}
            <div>
              <p className="font-semibold flex items-center gap-1"><CheckSquare className="h-3 w-3"/> Actividades realizadas</p>
              <p className="text-muted-foreground text-xs">Cantidad total de ejercicios, dinámicas o tareas individuales completadas por los pacientes dentro de las sesiones.</p>
            </div>
            <div>
              <p className="font-semibold flex items-center gap-1"><FileText className="h-3 w-3"/> Informes creados</p>
              <p className="text-muted-foreground text-xs">Número de informes de progreso (PDFs) que los terapeutas han descargado o generado.</p>
            </div>
            <div className="bg-primary/10 p-2 rounded border border-primary/20 mt-2">
              <p className="text-xs text-primary font-medium">💡 Evolución (Porcentajes)</p>
              <p className="text-xs text-muted-foreground">La flecha verde o roja compara el periodo actual con el periodo anterior equivalente (ej: si miras 7 días, se compara con los 7 días previos a esos).</p>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}