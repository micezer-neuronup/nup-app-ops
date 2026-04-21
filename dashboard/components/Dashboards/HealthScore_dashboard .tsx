"use client";

import * as React from "react";
import { useState } from "react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { TrendingUp, Users, Calendar, Activity, MousePointerClick, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  ComposedChart,
  Legend,
} from "recharts";

type MetricType = "exercises" | "sessions" | "logins";

const metricConfig = {
  exercises: {
    name: "Ejercicios",
    color: "#8b5cf6",
    icon: Activity,
    label: "Ejercicios Completados",
  },
  sessions: {
    name: "Sesiones",
    color: "#06b6d4",
    icon: Users,
    label: "Sesiones Realizadas",
  },
  logins: {
    name: "Logins",
    color: "#f59e0b",
    icon: MousePointerClick,
    label: "Inicios de Sesión",
  },
};

export function HealthScore_dashboard({ data }: { data: any }) {
  const [selectedView, setSelectedView] = useState<"7days" | "30days" | "monthly">("7days");
  const [selectedMetric, setSelectedMetric] = useState<MetricType>("exercises");
  const [hoveredMetric, setHoveredMetric] = useState<MetricType | null>(null);

  // Process chart data directly from data.analytics
  const getChartData = () => {
    const dailyData = data?.analytics?.daily || [];
    if (!dailyData.length) return [];

    if (selectedView === "7days") {
      return dailyData.slice(-7).map((item: any) => ({
        name: new Date(item.date).toLocaleDateString("es", { day: "numeric", month: "short" }),
        exercises: item.exercises || 0,
        sessions: item.sessions || 0,
        logins: item.logins || 0,
      }));
    } else if (selectedView === "30days") {
      return dailyData.slice(-30).map((item: any) => ({
        name: new Date(item.date).toLocaleDateString("es", { day: "numeric", month: "short" }),
        exercises: item.exercises || 0,
        sessions: item.sessions || 0,
        logins: item.logins || 0,
      }));
    } else {
      // monthly grouping
      const monthlyMap = new Map();
      dailyData.forEach((item: any) => {
        const date = new Date(item.date);
        const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
        const monthName = date.toLocaleString("es", { month: "short", year: "numeric" });
        if (!monthlyMap.has(monthKey)) {
          monthlyMap.set(monthKey, { name: monthName, exercises: 0, sessions: 0, logins: 0 });
        }
        const monthData = monthlyMap.get(monthKey);
        monthData.exercises += item.exercises || 0;
        monthData.sessions += item.sessions || 0;
        monthData.logins += item.logins || 0;
      });
      return Array.from(monthlyMap.values());
    }
  };

  const chartData = getChartData();
  const totals = data?.analytics?.totals || {};
  const dailyStats = data?.analytics?.daily || [];

  const metricsCards = [
    { key: "total_events", label: "Eventos Totales", value: totals.total_events || 0, icon: TrendingUp, color: "from-purple-500 to-indigo-600", description: "Total de eventos registrados" },
    { key: "total_sessions", label: "Sesiones", value: totals.total_sessions || 0, icon: Users, color: "from-cyan-500 to-blue-600", description: "Sesiones completadas" },
    { key: "total_logins", label: "Logins", value: totals.total_logins || 0, icon: MousePointerClick, color: "from-amber-500 to-orange-600", description: "Inicios de sesión" },
    { key: "total_exercises", label: "Ejercicios", value: totals.total_exercises || 0, icon: Activity, color: "from-emerald-500 to-teal-600", description: "Ejercicios completados" },
    { key: "last_activity", label: "Última Actividad", value: data.properties?.last_company_login ? new Date(data.properties.last_company_login).toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" }) : "—", icon: Calendar, color: "from-rose-500 to-pink-600", description: "Último inicio de sesión" },
    { key: "avg_daily", label: "Media Diaria", value: Math.round((totals.total_exercises || 0) / Math.max(dailyStats.length, 1)), icon: TrendingUp, color: "from-violet-500 to-purple-600", description: "Ejercicios por día" },
  ];

  const MetricButton = ({ metric, label }: { metric: MetricType; label: string }) => {
    const Icon = metricConfig[metric].icon;
    const isActive = selectedMetric === metric;
    const isHovered = hoveredMetric === metric;
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setSelectedMetric(metric)}
        onMouseEnter={() => setHoveredMetric(metric)}
        onMouseLeave={() => setHoveredMetric(null)}
        className={`relative transition-all duration-300 gap-2 ${
          isActive ? "bg-primary text-primary-foreground shadow-md scale-105" : "hover:bg-secondary/80"
        } ${isHovered && !isActive ? "scale-102" : ""}`}
      >
        <Icon className={`h-4 w-4 transition-all ${isActive ? "animate-pulse" : ""}`} />
        {label}
        {isActive && <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-1 h-1 rounded-full bg-primary-foreground/50" />}
      </Button>
    );
  };

  const ViewButton = ({ view, label }: { view: "7days" | "30days" | "monthly"; label: string }) => (
    <Button variant={selectedView === view ? "default" : "ghost"} size="sm" onClick={() => setSelectedView(view)} className={`transition-all duration-200 ${selectedView === view ? "shadow-md" : ""}`}>
      {label}
    </Button>
  );

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload?.length) {
      const Icon = metricConfig[selectedMetric].icon;
      return (
        <div className="bg-background/95 backdrop-blur-sm border rounded-lg shadow-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
          </div>
          <p className="text-lg font-bold" style={{ color: metricConfig[selectedMetric].color }}>
            {payload[0].value.toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{metricConfig[selectedMetric].label}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <p className="text-muted-foreground text-sm">
          Centro: <span className="font-medium text-foreground">{data.properties?.name || data.properties?.nup_center_id || "—"}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {metricsCards.map((metric) => {
          const Icon = metric.icon;
          return (
            <Card key={metric.key} className="group relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
              <div className={`absolute inset-0 bg-gradient-to-br ${metric.color} opacity-0 group-hover:opacity-5 transition-opacity duration-300`} />
              <CardHeader className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <CardDescription className="text-xs uppercase tracking-wider font-semibold">{metric.label}</CardDescription>
                    <CardTitle className="text-2xl font-bold mt-1">{typeof metric.value === "number" ? metric.value.toLocaleString() : metric.value}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-2 opacity-0 group-hover:opacity-100 transition-opacity">{metric.description}</p>
                  </div>
                  <div className={`p-2 rounded-lg bg-gradient-to-br ${metric.color} text-white shadow-lg`}>
                    <Icon className="h-4 w-4" />
                  </div>
                </div>
              </CardHeader>
            </Card>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-gradient-to-r from-background to-secondary/5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">{React.createElement(metricConfig[selectedMetric].icon, { className: "h-5 w-5 text-primary" })}</div>
              <div>
                <CardDescription>Tendencia de Métricas</CardDescription>
                <CardTitle className="text-xl font-semibold">{metricConfig[selectedMetric].label}</CardTitle>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="flex gap-1">
                <MetricButton metric="exercises" label="Ejercicios" />
                <MetricButton metric="sessions" label="Sesiones" />
                <MetricButton metric="logins" label="Logins" />
              </div>
              <div className="w-px h-8 bg-border mx-2 hidden lg:block" />
              <div className="flex gap-1">
                <ViewButton view="7days" label="7 Días" />
                <ViewButton view="30days" label="30 Días" />
                <ViewButton view="monthly" label="Mensual" />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="h-[400px] w-full p-4">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <defs>
                    <linearGradient id="metricGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={metricConfig[selectedMetric].color} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={metricConfig[selectedMetric].color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-gray-800" />
                  <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => value.toLocaleString()} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Area type="monotone" dataKey={selectedMetric} stroke={metricConfig[selectedMetric].color} strokeWidth={2} fill="url(#metricGradient)" dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6, strokeWidth: 2 }} name={metricConfig[selectedMetric].name} />
                  <Line type="monotone" dataKey={selectedMetric} stroke={metricConfig[selectedMetric].color} strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6, strokeWidth: 2 }} name={metricConfig[selectedMetric].name} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2">
                <div className="text-4xl">📈</div>
                <p className="text-muted-foreground">No hay datos para mostrar</p>
                <p className="text-xs text-muted-foreground">Selecciona un período de tiempo diferente</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {dailyStats.length > 0 && (
        <Card className="bg-gradient-to-r from-primary/5 to-secondary/5">
          <CardContent className="py-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Período analizado:</span>
                <span className="font-medium">
                  {new Date(dailyStats[0]?.date).toLocaleDateString()} - {new Date(dailyStats[dailyStats.length - 1]?.date).toLocaleDateString()}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                  <div className="h-2 w-2 rounded-full bg-purple-500" />
                  <span className="text-xs text-muted-foreground">Total días: {dailyStats.length}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="text-xs text-muted-foreground">Promedio: {Math.round((totals.total_exercises || 0) / dailyStats.length)} ejercicios/día</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}