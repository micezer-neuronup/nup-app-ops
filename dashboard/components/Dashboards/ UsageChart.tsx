// components/Dashboards/UsageChart.tsx
"use client";

import { useState, useEffect } from "react";
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
import { Activity, Users, LogIn, ChevronDown, Eye, EyeOff } from "lucide-react";

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

// Tooltip Personalizado
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

// Helper para procesar y agrupar los datos
function processRealData(dailyData: any[] | undefined, range: RangeType) {
  const safeData = Array.isArray(dailyData) ? dailyData : [];
  
  const today = new Date();
  today.setDate(today.getDate() - 1); // Ancla en "Ayer"

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

  // Lógica inteligente de activación de Módulos para las analíticas
  useEffect(() => {
    const safeFeatures = Array.isArray(subscriptionFeatures) ? subscriptionFeatures : [];
    const configs: FeatureConfig[] = [];
    
    // 1. Evaluación (Assessment): Cualquier feature que contenga 'test'
    if (safeFeatures.some(f => f.includes("test"))) {
      configs.push({
        key: "assessment",
        label: "Evaluación (Assessment)",
        dataKey1: "tests_started",
        dataKey2: "tests_finished",
        label1: "Tests empezados",
        label2: "Tests terminados",
      });
    }
    
    // 2. Uso Digital: activity_all, digital, investigacion, testing, etc. (Excepto las puramente de papel)
    const hasDigital = safeFeatures.some(f => 
      f.includes("activity") || 
      f.includes("digital") || 
      f.includes("investigacion") || 
      f.includes("testing") || 
      f.includes("proximamente")
    );
    if (hasDigital) {
      configs.push({
        key: "digital",
        label: "Uso Digital (Actividades)",
        dataKey1: "digital_activities",
        label1: "Actividades digitales ejecutadas",
      });
    }
    
    // 3. Descargas Papel: kids_paper, adults_paper, activity_all (que tiene "Ambos")
    const hasPaper = safeFeatures.some(f => 
      f.includes("paper") || 
      f === "activity_all" || 
      f === "extras_ub" || 
      f === "proximamente" ||
      f === "testing"
    );
    if (hasPaper) {
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
  }, [subscriptionFeatures]);

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
    <Card className="overflow-hidden mt-6">
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
              <Button
                variant={metric === "logins" ? "default" : "ghost"}
                size="sm"
                onClick={() => setMetric("logins")}
              >
                <LogIn className="h-4 w-4 mr-1" /> Logins
              </Button>
              <Button
                variant={metric === "sessions" ? "default" : "ghost"}
                size="sm"
                onClick={() => setMetric("sessions")}
              >
                <Users className="h-4 w-4 mr-1" /> Sesiones
              </Button>
              <FeatureSelector />
            </div>
            <div className="w-px h-6 bg-border mx-1 hidden sm:block" />
            <div className="flex gap-1">
              <RangeButton value="7d" label="7d" />
              <RangeButton value="30d" label="30d" />
              <RangeButton value="90d" label="90d" />
            </div>
          </div>
        </div>

        {metric === "sessions" && (
          <div className="flex gap-4 mt-2 pt-1 border-t flex-wrap">
            <label className="flex items-center gap-1 text-xs">
              <Checkbox
                checked={showAssigned}
                onCheckedChange={(c) => setShowAssigned(!!c)}
              />
              <span className="flex items-center gap-1">
                <Eye className="h-3 w-3" /> Mostrar asignadas
              </span>
            </label>
            <label className="flex items-center gap-1 text-xs">
              <Checkbox
                checked={showStarted}
                onCheckedChange={(c) => setShowStarted(!!c)}
              />
              <span className="flex items-center gap-1">
                <Eye className="h-3 w-3" /> Mostrar empezadas
              </span>
            </label>
            <label className="flex items-center gap-1 text-xs">
              <Checkbox
                checked={showCompleted}
                onCheckedChange={(c) => setShowCompleted(!!c)}
              />
              <span className="flex items-center gap-1">
                <Eye className="h-3 w-3" /> Mostrar completadas
              </span>
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
                    <ReferenceArea 
                      key={`ref-${entry.name}`} 
                      x1={entry.name} 
                      x2={entry.name} 
                      fill="#cbd5e1" 
                      fillOpacity={0.3} 
                    />
                  ) : null
                )}

                <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => v.toLocaleString()} />
                
                <Tooltip 
                  content={<CustomTooltip />} 
                  cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '4 4' }} 
                />
                
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
  );
}