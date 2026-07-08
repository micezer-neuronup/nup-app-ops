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
  CheckSquare 
} from "lucide-react";

type Range = 7 | 30 | 90;

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" });
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
    if (!dailyData || dailyData.length === 0) return null;

    // 1. Última interacción global
    const lastRecord = dailyData[dailyData.length - 1];
    const lastActivityDate = lastRecord?.stat_date || null;
    const lastActivityDisplay = lastActivityDate ? formatDate(lastActivityDate) : "—";
    const lastActiveTherapists = lastRecord?.active_therapists ?? 0;

    // 2. Definimos las fechas límite: Empezamos a contar desde AYER
    const referenceDate = new Date();
    referenceDate.setDate(referenceDate.getDate() - 1); // Restamos 1 día
    referenceDate.setHours(0, 0, 0, 0);

    const currentPeriod: any[] = [];
    const previousPeriod: any[] = [];

    // 3. Filtramos por fechas reales de calendario
    dailyData.forEach(day => {
      if (!day.stat_date) return;
      
      const d = new Date(day.stat_date);
      d.setHours(0, 0, 0, 0);

      // Calculamos la diferencia en días entre "ayer" y la fecha del dato
      const diffTime = referenceDate.getTime() - d.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays >= 0 && diffDays < range) {
        currentPeriod.push(day);
      } else if (diffDays >= range && diffDays < range * 2) {
        previousPeriod.push(day);
      }
    });

    // 4. Sumamos métricas del periodo actual
    const assignedSessions = currentPeriod.reduce((sum, day) => sum + (day.sessions_assigned || 0), 0);
    const startedSessions = currentPeriod.reduce((sum, day) => sum + (day.sessions_started || 0), 0);
    const completedSessions = currentPeriod.reduce((sum, day) => sum + (day.sessions_finished || 0), 0);
    const reportsCreated = currentPeriod.reduce((sum, day) => sum + (day.reports_created || 0), 0);
    const activitiesStarted = currentPeriod.reduce((sum, day) => sum + (day.activities_started || 0), 0);
    
    const completionRate = startedSessions > 0 ? (completedSessions / startedSessions) * 100 : 0;

    // Lógica dinámica de semanas según el rango seleccionado
    const weeks = range === 7 ? 1 : range === 30 ? 4 : 12;
    const weeklyActivitiesAvg = activitiesStarted / weeks;

    // 5. Sumamos métricas del periodo anterior
    const prevAssigned = previousPeriod.reduce((sum, day) => sum + (day.sessions_assigned || 0), 0);
    const prevStarted = previousPeriod.reduce((sum, day) => sum + (day.sessions_started || 0), 0);
    const prevCompleted = previousPeriod.reduce((sum, day) => sum + (day.sessions_finished || 0), 0);
    const prevReports = previousPeriod.reduce((sum, day) => sum + (day.reports_created || 0), 0);
    const prevActivities = previousPeriod.reduce((sum, day) => sum + (day.activities_started || 0), 0);
    
    const prevRate = prevStarted > 0 ? (prevCompleted / prevStarted) * 100 : 0;
    const prevWeeklyActivitiesAvg = prevActivities / weeks;

    // 6. Cálculos de evolución
    const assignedEvolution = prevAssigned ? ((assignedSessions - prevAssigned) / prevAssigned) * 100 : 0;
    const startedEvolution = prevStarted ? ((startedSessions - prevStarted) / prevStarted) * 100 : 0;
    const completedEvolution = prevCompleted ? ((completedSessions - prevCompleted) / prevCompleted) * 100 : 0;
    const reportsEvolution = prevReports ? ((reportsCreated - prevReports) / prevReports) * 100 : 0;
    const activitiesEvolution = prevActivities ? ((activitiesStarted - prevActivities) / prevActivities) * 100 : 0;
    const rateEvolution = prevRate ? completionRate - prevRate : 0;
    const weeklyActivitiesEvolution = prevWeeklyActivitiesAvg ? ((weeklyActivitiesAvg - prevWeeklyActivitiesAvg) / prevWeeklyActivitiesAvg) * 100 : 0;

    return {
      lastActivity: lastActivityDisplay,
      activeTherapists: lastActiveTherapists,
      assignedSessions,
      startedSessions,
      completedSessions,
      reportsCreated,
      activitiesStarted,
      weeklyActivitiesAvg: Math.round(weeklyActivitiesAvg),
      completionRate: Math.round(completionRate),
      evolution: {
        assigned: Math.round(assignedEvolution),
        started: Math.round(startedEvolution),
        completed: Math.round(completedEvolution),
        reports: Math.round(reportsEvolution),
        activities: Math.round(activitiesEvolution),
        rate: Math.round(rateEvolution),
        weeklyActivities: Math.round(weeklyActivitiesEvolution),
      },
    };
  }, [dailyData, range]);

  // Se optimizan los tamaños de fuente para garantizar una legibilidad perfecta
  const MetricItem = ({ icon: Icon, label, subLabel, value, evolution }: any) => (
    <div className="flex items-center justify-between w-full min-w-0 gap-2">
      <div className="flex items-center gap-2 min-w-0">
        {Icon && <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
        <div className="flex flex-col min-w-0 leading-tight">
          <span className="text-sm font-medium text-foreground truncate">{label}</span>
          {subLabel && <span className="text-xs text-muted-foreground truncate font-normal">{subLabel}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="text-sm font-semibold">{value}</span>
        {evolution !== undefined && evolution !== 0 && (
          <span className={`font-medium text-xs ${evolution > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {evolution > 0 ? `↑${evolution}%` : `↓${Math.abs(evolution)}%`}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className="relative h-[500px] w-full [perspective:1000px] group">
      <div 
        className={`w-full h-full transition-all duration-500 [transform-style:preserve-3d] ${isFlipped ? '[transform:rotateY(180deg)]' : ''}`}
      >
        
        {/* ========================================== */}
        {/* 🎭 CARA FRONTAL: Datos de Uso              */}
        {/* ========================================== */}
        <Card className="absolute inset-0 [backface-visibility:hidden] flex flex-col overflow-hidden transition-all duration-300 hover:shadow-lg hover:bg-accent/30">
          <CardHeader className="pb-1">
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
          <CardContent className="space-y-1.5 flex-1 flex flex-col justify-between pb-4">
            
            {/* Fila 1 */}
            <div className="py-1.5 border-b px-2 -mx-2 rounded-md transition-colors hover:bg-secondary/50">
              <MetricItem icon={Calendar} label="Última interacción" value={rangeData?.lastActivity || "—"} />
            </div>

            {/* Fila 2 */}
            <div className="py-1.5 border-b px-2 -mx-2 rounded-md transition-colors hover:bg-secondary/50">
              <MetricItem icon={Users} label="Terapeutas activos" value={rangeData ? `${rangeData.activeTherapists} / ${numEmployees}` : "—"} />
            </div>


            {/* Fila 5 */}
            <div className="py-1.5 border-b px-2 -mx-2 rounded-md transition-colors hover:bg-secondary/50">
              <MetricItem icon={FileText} label="Informes creados" value={rangeData?.reportsCreated ?? "—"} evolution={rangeData?.evolution.reports} />
            </div>

            {/* Fila 3 */}
            <div className="py-1.5 border-b px-2 -mx-2 rounded-md transition-colors hover:bg-secondary/50">
              <MetricItem icon={ClipboardCheck} label="Sesiones asignadas" value={rangeData?.assignedSessions ?? "—"} evolution={rangeData?.evolution.assigned} />
            </div>

            {/* Fila 4 */}
            <div className="py-1.5 border-b px-2 -mx-2 rounded-md transition-colors hover:bg-secondary/50">
              <MetricItem icon={Activity} label="Tasa de completitud" value={rangeData ? `${rangeData.completionRate}%` : "—"} evolution={rangeData?.evolution.rate} />
            </div>


            {/* 🌟 Fila 6 (DOBLE): Sesiones (Empezadas vs Completadas) */}
            <div className="grid grid-cols-2 gap-4 py-1.5 border-b px-2 -mx-2 rounded-md transition-colors hover:bg-secondary/50">
              <div className="pr-2 border-r border-border/60">
                <MetricItem icon={PlayCircle} label="Sesiones" subLabel="empezadas" value={rangeData?.startedSessions ?? "—"} evolution={rangeData?.evolution.started} />
              </div>
              <div>
                <MetricItem icon={TrendingUp} label="Sesiones" subLabel="completadas" value={rangeData?.completedSessions ?? "—"} evolution={rangeData?.evolution.completed} />
              </div>
            </div>

            {/* 🌟 Fila 7 (DOBLE): Actividades (Totales vs Media Semanal) */}
            <div className="grid grid-cols-2 gap-4 py-1.5 px-2 -mx-2 rounded-md transition-colors hover:bg-secondary/50">
              <div className="pr-2 border-r border-border/60">
                <MetricItem icon={CheckSquare} label="Actividades" subLabel="totales" value={rangeData?.activitiesStarted ?? "—"} evolution={rangeData?.evolution.activities} />
              </div>
              <div>
                <MetricItem icon={Activity} label="Actividades" subLabel="media / semana" value={rangeData?.weeklyActivitiesAvg ?? "—"} evolution={rangeData?.evolution.weeklyActivities} />
              </div>
            </div>

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
          <CardContent className="flex-1 overflow-y-auto px-4 pb-4 pt-1 space-y-3 text-sm">            
            <div>
              <p className="font-semibold flex items-center gap-1 text-xs"><Calendar className="h-3 w-3"/> Última interacción</p>
              <p className="text-muted-foreground text-[11px] leading-tight">Fecha del último día en el que algún terapeuta del centro inició sesión o registró actividad.</p>
            </div>
            <div>
              <p className="font-semibold flex items-center gap-1 text-xs"><Users className="h-3 w-3"/> Terapeutas activos</p>
              <p className="text-muted-foreground text-[11px] leading-tight">Usuarios profesionales que han entrado a la plataforma en el rango seleccionado frente al total de contratados.</p>
            </div>
            <div>
              <p className="font-semibold flex items-center gap-1 text-xs"><ClipboardCheck className="h-3 w-3"/> Sesiones asignadas</p>
              <p className="text-muted-foreground text-[11px] leading-tight">Volumen total de pautas y sesiones que los profesionales han programado a los pacientes.</p>
            </div>
            <div>
              <p className="font-semibold flex items-center gap-1 text-xs"><Activity className="h-3 w-3"/> Tasa de completitud</p>
              <p className="text-muted-foreground text-[11px] leading-tight">Porcentaje que indica cuántas de las sesiones empezadas logran terminarse al 100%.</p>
            </div>
            <div>
              <p className="font-semibold flex items-center gap-1 text-xs"><FileText className="h-3 w-3"/> Informes creados</p>
              <p className="text-muted-foreground text-[11px] leading-tight">Número de informes de progreso (PDFs) que los terapeutas han descargado o generado.</p>
            </div>
            <div>
              <p className="font-semibold flex items-center gap-1 text-xs"><PlayCircle className="h-3 w-3"/> Sesiones empezadas / completadas</p>
              <p className="text-muted-foreground text-[11px] leading-tight">Sesiones que los pacientes han comenzado frente a las que han llegado hasta el final de todos los ejercicios.</p>
            </div>
            <div>
              <p className="font-semibold flex items-center gap-1 text-xs"><CheckSquare className="h-3 w-3"/> Actividades totales</p>
              <p className="text-muted-foreground text-[11px] leading-tight">Cantidad total de ejercicios, dinámicas o tareas individuales completadas por los pacientes dentro de las sesiones.</p>
            </div>
            <div>
              <p className="font-semibold flex items-center gap-1 text-xs"><Activity className="h-3 w-3"/> Actividades media / semana</p>
              <p className="text-muted-foreground text-[11px] leading-tight">Ritmo medio de ejercicios completados por semana dentro del rango seleccionado (total acumulado dividido entre las semanas del periodo).</p>
            </div>
            <div className="bg-primary/10 p-2 rounded border border-primary/20 mt-1">
              <p className="text-[11px] text-primary font-medium">💡 Evolución (Porcentajes)</p>
              <p className="text-[10px] text-muted-foreground leading-tight">Compara el periodo actual con el periodo anterior equivalente de igual duración (ej: si miras 30 días, se compara con los 30 días previos).</p>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}