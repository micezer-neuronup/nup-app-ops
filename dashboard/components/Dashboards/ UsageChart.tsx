// components/Dashboards/UsageChart.tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceArea
} from "recharts";
import { 
  Activity, 
  Users, 
  LogIn, 
  ChevronDown, 
  Eye, 
  EyeOff, 
  Info, 
  RotateCcw,
  Calendar,
  Filter,
  BarChart3
} from "lucide-react";

type MetricType = "logins" | "sessions" | "features";
type RangeType = "7d" | "30d" | "90d";

interface FeatureConfig {
  key: string;
  label: string;
  dataKey1: string;
  dataKey2?: string;
  label1: string;
  label2?: string;
}

interface UsageChartProps {
  subscriptionFeatures?: string[];
  dailyData?: any[]; 
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-background/95 backdrop-blur-sm border border-border rounded-lg shadow-md p-3 text-sm">
        <p className="font-semibold mb-2 text-foreground border-b pb-1">{label}</p>
        <div className="flex flex-col gap-1.5 mt-2">
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div 
                  className="w-2.5 h-2.5 rounded-full shadow-sm" 
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-muted-foreground">{entry.name}</span>
              </div>
              <span className="font-semibold text-foreground">
                {entry.value.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

function processRealData(dailyData: any[] | undefined, range: RangeType) {
  const safeData = Array.isArray(dailyData) ? dailyData : [];
  
  const today = new Date();
  today.setDate(today.getDate() - 1); 

  const result = [];
  const dailyMap = new Map<string, any>();
  
  safeData.forEach((row) => {
    if (!row.stat_date) return;
    let key = "";
    if (typeof row.stat_date === 'string') {
      key = row.stat_date.substring(0, 10); 
    } else {
      const d = new Date(row.stat_date);
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    dailyMap.set(key, row);
  });

  if (range === "90d") {
    const weeks = 12;
    for (let i = weeks - 1; i >= 0; i--) {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - (i * 7) - 6);
      
      let wLogins = 0, wAssigned = 0, wStarted = 0, wCompleted = 0;
      let wTestsStarted = 0, wTestsFinished = 0, wActivities = 0, wDownloads = 0;
      
      for (let d = 0; d < 7; d++) {
        const currentDay = new Date(weekStart);
        currentDay.setDate(weekStart.getDate() + d);
        const key = `${currentDay.getFullYear()}-${String(currentDay.getMonth() + 1).padStart(2, "0")}-${String(currentDay.getDate()).padStart(2, "0")}`;
        
        const row = dailyMap.get(key) || {};
        wLogins += Number(row.total_logins || 0);
        wAssigned += Number(row.sessions_assigned || 0);
        wStarted += Number(row.sessions_started || 0);
        wCompleted += Number(row.sessions_finished || 0);
        wTestsStarted += Number(row.tests_started || 0);
        wTestsFinished += Number(row.tests_finished || 0);
        wActivities += Number(row.activities_started || 0);
        wDownloads += Number(row.exercises_downloaded || 0) + Number(row.materials_downloaded || 0);
      }

      result.push({
        name: `Sem. ${weekStart.getDate()} ${weekStart.toLocaleDateString("es", { month: "short" })}`,
        isWeekend: false,
        logins: wLogins,
        sessionsAssigned: wAssigned,
        sessionsStarted: wStarted,
        sessionsCompleted: wCompleted,
        tests_started: wTestsStarted,
        tests_finished: wTestsFinished,
        digital_activities: wActivities,
        paper_downloads: wDownloads,
      });
    }
  } else {
    const days = range === "7d" ? 7 : 30;
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      
      const row = dailyMap.get(key) || {};
      const isWeekend = d.getDay() === 0 || d.getDay() === 6; 

      result.push({
        name: d.toLocaleDateString("es", { day: "numeric", month: "short" }),
        isWeekend, 
        logins: Number(row.total_logins || 0),
        sessionsAssigned: Number(row.sessions_assigned || 0),
        sessionsStarted: Number(row.sessions_started || 0),
        sessionsCompleted: Number(row.sessions_finished || 0),
        tests_started: Number(row.tests_started || 0),
        tests_finished: Number(row.tests_finished || 0),
        digital_activities: Number(row.activities_started || 0),
        paper_downloads: Number(row.exercises_downloaded || 0) + Number(row.materials_downloaded || 0),
      });
    }
  }

  return result;
}

export function UsageChart({ subscriptionFeatures = [], dailyData = [] }: UsageChartProps) {
  const [range, setRange] = useState<RangeType>("7d");
  const [metric, setMetric] = useState<MetricType>("logins");
  const [showAssigned, setShowAssigned] = useState(true);
  const [showStarted, setShowStarted] = useState(true);
  const [showCompleted, setShowCompleted] = useState(true);
  const [chartData, setChartData] = useState<any[]>([]);
  const [featureConfig, setFeatureConfig] = useState<FeatureConfig | null>(null);
  const [selectedFeatureKey, setSelectedFeatureKey] = useState<string | null>(null);
  const [availableFeatures, setAvailableFeatures] = useState<FeatureConfig[]>([]);
  
  // ✨ Estado para el giro 3D
  const [isFlipped, setIsFlipped] = useState(false);

  const totals = useMemo(() => {
    const safeData = Array.isArray(dailyData) ? dailyData : [];
    let totalActivities = 0;
    let totalTestsStarted = 0;
    let totalPaperDownloads = 0;
    safeData.forEach((row: any) => {
      totalActivities += Number(row.activities_started || 0);
      totalTestsStarted += Number(row.tests_started || 0);
      totalPaperDownloads += (Number(row.exercises_downloaded || 0) + Number(row.materials_downloaded || 0));
    });
    return { totalActivities, totalTestsStarted, totalPaperDownloads };
  }, [dailyData]);

  useEffect(() => {
    const safeFeatures = Array.isArray(subscriptionFeatures) ? subscriptionFeatures : [];
    const configs: FeatureConfig[] = [];
    
    const hasTestFeature = safeFeatures.some(f => f.includes("test"));
    const hasTestUsage = totals.totalTestsStarted > 0;
    if (hasTestFeature || hasTestUsage) {
      configs.push({
        key: "assessment",
        label: "Evaluación (Assessment)",
        dataKey1: "tests_started",
        dataKey2: "tests_finished",
        label1: "Tests empezados",
        label2: "Tests terminados",
      });
    }
    
    const hasDigitalFeature = safeFeatures.some(f => 
      f.includes("activity") || f.includes("digital") || f.includes("investigacion") || f.includes("testing") || f.includes("proximamente")
    );
    const hasDigitalUsage = totals.totalActivities > 0;
    if (hasDigitalFeature || hasDigitalUsage) {
      configs.push({
        key: "digital",
        label: "Uso Digital (Actividades)",
        dataKey1: "digital_activities",
        label1: "Actividades digitales ejecutadas",
      });
    }
    
    const hasPaperFeature = safeFeatures.some(f => 
      f.includes("paper") || f === "activity_all" || f === "extras_ub" || f === "proximamente" || f === "testing"
    );
    const hasPaperUsage = totals.totalPaperDownloads > 0;
    if (hasPaperFeature || hasPaperUsage) {
      configs.push({
        key: "paper",
        label: "Descargas (Material en Papel)",
        dataKey1: "paper_downloads",
        label1: "Hojas/Ejercicios descargados",
      });
    }
    
    setAvailableFeatures(configs);
    
    if (configs.length > 0) {
      setFeatureConfig(configs[0]);
      setSelectedFeatureKey(configs[0].key);
    } else {
      setFeatureConfig(null);
      setSelectedFeatureKey(null);
    }
  }, [subscriptionFeatures, totals]);

  useEffect(() => {
    const newData = processRealData(dailyData, range);
    setChartData(newData);
  }, [range, dailyData]);

  const handleFeatureChange = (config: FeatureConfig) => {
    setFeatureConfig(config);
    setSelectedFeatureKey(config.key);
    setMetric("features");
  };

  const getChartLines = () => {
    if (metric === "logins") {
      return [{ dataKey: "logins", stroke: "#f59e0b", name: "Inicios de sesión" }];
    }
    if (metric === "sessions") {
      const lines = [];
      if (showAssigned) lines.push({ dataKey: "sessionsAssigned", stroke: "#06b6d4", name: "Sesiones asignadas" });
      if (showStarted) lines.push({ dataKey: "sessionsStarted", stroke: "#3b82f6", name: "Sesiones empezadas" });
      if (showCompleted) lines.push({ dataKey: "sessionsCompleted", stroke: "#8b5cf6", name: "Sesiones completadas" });
      return lines;
    }
    if (metric === "features" && featureConfig) {
      const lines = [{ dataKey: featureConfig.dataKey1, stroke: "#10b981", name: featureConfig.label1 }];
      if (featureConfig.dataKey2) {
        lines.push({
          dataKey: featureConfig.dataKey2,
          stroke: "#f97316",
          name: featureConfig.label2 || "Métrica secundaria",
        });
      }
      return lines;
    }
    return [];
  };

  const lines = getChartLines();

  const RangeButton = ({ value, label }: { value: RangeType; label: string }) => (
    <Button
      variant={range === value ? "default" : "outline"}
      size="sm"
      onClick={() => setRange(value)}
      className="h-7 px-2 text-xs"
    >
      {label}
    </Button>
  );

  const FeatureSelector = () => {
    if (availableFeatures.length === 0) {
      return (
        <Button variant="outline" size="sm" disabled className="gap-1 opacity-50 cursor-not-allowed">
          <Activity className="h-3 w-3" /> Sin módulos activos
        </Button>
      );
    }
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1">
            <Activity className="h-3 w-3" />
            {featureConfig?.label || "Módulos"}
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {availableFeatures.map((cfg) => (
            <DropdownMenuItem
              key={cfg.key}
              onClick={() => handleFeatureChange(cfg)}
              className={selectedFeatureKey === cfg.key ? "bg-accent" : ""}
            >
              {cfg.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  return (
    <div className="relative w-full mt-6 [perspective:1000px] group">
      {/* El contenedor relativo de base le da altura a la cara frontal para no romper la UI, 
          mientras que la cara trasera se superpone con posición absoluta */}
      <div className={`w-full transition-all duration-500 [transform-style:preserve-3d] relative ${isFlipped ? '[transform:rotateY(180deg)]' : ''}`}>
        
        {/* ========================================== */}
        {/* 🎭 CARA FRONTAL: Gráfica Interactiva       */}
        {/* ========================================== */}
        <Card className="w-full [backface-visibility:hidden] overflow-hidden bg-background">
          <CardHeader className="border-b bg-gradient-to-r from-background to-secondary/5 pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                <div>
                  <CardDescription>Análisis de uso</CardDescription>
                  <CardTitle className="text-xl font-semibold">
                    {metric === "logins" && "Inicios de sesión"}
                    {metric === "sessions" && "Sesiones"}
                    {metric === "features" && featureConfig?.label}
                  </CardTitle>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <div className="flex gap-1">
                  <Button variant={metric === "logins" ? "default" : "ghost"} size="sm" onClick={() => setMetric("logins")}>
                    <LogIn className="h-4 w-4 mr-1" /> Logins
                  </Button>
                  <Button variant={metric === "sessions" ? "default" : "ghost"} size="sm" onClick={() => setMetric("sessions")}>
                    <Users className="h-4 w-4 mr-1" /> Sesiones
                  </Button>
                  <FeatureSelector />
                </div>
                <div className="w-px h-6 bg-border mx-1 hidden sm:block" />
                <div className="flex gap-1 items-center">
                  <RangeButton value="7d" label="7d" />
                  <RangeButton value="30d" label="30d" />
                  <RangeButton value="90d" label="90d" />
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7 ml-2 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10" 
                    onClick={() => setIsFlipped(true)}
                    title="Ver cómo interpretar la gráfica"
                  >
                    <Info className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {metric === "sessions" && (
              <div className="flex gap-4 mt-2 pt-1 border-t flex-wrap">
                <label className="flex items-center gap-1 text-xs cursor-pointer">
                  <Checkbox checked={showAssigned} onCheckedChange={(c) => setShowAssigned(!!c)} />
                  <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> Mostrar asignadas</span>
                </label>
                <label className="flex items-center gap-1 text-xs cursor-pointer">
                  <Checkbox checked={showStarted} onCheckedChange={(c) => setShowStarted(!!c)} />
                  <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> Mostrar empezadas</span>
                </label>
                <label className="flex items-center gap-1 text-xs cursor-pointer">
                  <Checkbox checked={showCompleted} onCheckedChange={(c) => setShowCompleted(!!c)} />
                  <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> Mostrar completadas</span>
                </label>
              </div>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <div className="h-[400px] w-full p-4">
              {chartData.length > 0 && lines.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} className="dark:stroke-gray-800" />
                    
                    {range !== "90d" && chartData.map((entry) => 
                      entry.isWeekend ? (
                        <ReferenceArea key={`ref-${entry.name}`} x1={entry.name} x2={entry.name} fill="#cbd5e1" fillOpacity={0.3} />
                      ) : null
                    )}

                    <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => v.toLocaleString()} />
                    
                    <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '4 4' }} />
                    
                    <Legend />
                    {lines.map((line) => (
                      <Area
                        key={line.dataKey}
                        type="monotone"
                        dataKey={line.dataKey}
                        stroke={line.stroke}
                        fill={line.stroke}
                        fillOpacity={0.15}
                        strokeWidth={2}
                        dot={{ r: 3, fill: line.stroke, strokeWidth: 2, stroke: "#fff" }}
                        activeDot={{ r: 5, strokeWidth: 0 }}
                        name={line.name}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2">
                  <div className="text-4xl">📊</div>
                  <p className="text-muted-foreground">
                    {metric === "features" && !featureConfig
                      ? "No hay módulos adicionales activos para este centro."
                      : "No hay datos para mostrar"}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ========================================== */}
        {/* 📖 CARA TRASERA: Guía de la Gráfica        */}
        {/* ========================================== */}
        <Card className="absolute inset-0 w-full h-full [backface-visibility:hidden] [transform:rotateY(180deg)] flex flex-col overflow-hidden bg-accent/20 border-primary/20 shadow-lg">
          <CardHeader className="pb-2 border-b bg-background/50 shrink-0">
            <div className="flex justify-between items-center">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Info className="h-5 w-5 text-primary" /> Cómo interpretar esta gráfica
              </CardTitle>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10" 
                onClick={() => setIsFlipped(false)}
                title="Volver a la gráfica"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto px-6 pb-4 pt-5 space-y-6">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div>
                  <p className="font-semibold text-base flex items-center gap-1.5"><Filter className="h-4 w-4 text-primary"/> Franjas grises y Tiempo</p>
                  <p className="text-muted-foreground text-sm mt-1.5 leading-relaxed">
                    En las vistas de <strong>7d</strong> y <strong>30d</strong>, las franjas verticales sombreadas en gris representan los <strong>fines de semana</strong> (sábado y domingo). Esto te ayuda a entender bajadas naturales de uso. En la vista de <strong>90d</strong>, los datos se agrupan por <strong>semanas completas</strong> para no saturar la vista.
                  </p>
                </div>

                <div>
                  <p className="font-semibold text-base flex items-center gap-1.5"><Users className="h-4 w-4 text-primary"/> Embudo de Sesiones</p>
                  <p className="text-muted-foreground text-sm mt-1.5 leading-relaxed">
                    La pestaña de "Sesiones" te muestra el flujo de trabajo del centro: <br/>
                    1. <span className="font-medium text-cyan-600">Asignadas:</span> Lo que los terapeutas programan.<br/>
                    2. <span className="font-medium text-blue-600">Empezadas:</span> Las que el paciente realmente comienza.<br/>
                    3. <span className="font-medium text-violet-600">Completadas:</span> Las que se finalizan al 100%.
                  </p>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <p className="font-semibold text-base flex items-center gap-1.5"><BarChart3 className="h-4 w-4 text-primary"/> Módulos Extra</p>
                  <p className="text-muted-foreground text-sm mt-1.5 leading-relaxed">
                    El botón "Módulos" analiza el uso de herramientas específicas (Evaluaciones, Actividades Digitales, Material en Papel). <strong>Atención:</strong> Si no aparece una opción en este menú, significa que el centro no la tiene contratada o no la ha usado ni una sola vez en este periodo.
                  </p>
                </div>

                <div className="bg-primary/10 p-4 rounded-lg border border-primary/20 mt-2">
                  <p className="text-sm text-primary font-semibold flex items-center gap-1.5"><Activity className="h-4 w-4"/> ¿Por qué veo ceros?</p>
                  <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                    Si un centro tiene picos muy altos un día y ceros absolutos el resto de la semana, suele indicar que los terapeutas no están usando la plataforma en sesión (uso continuo), sino que entran puntualmente a descargar material o hacer "trabajo de oficina".
                  </p>
                </div>
              </div>
            </div>

          </CardContent>
        </Card>

      </div>
    </div>
  );
}