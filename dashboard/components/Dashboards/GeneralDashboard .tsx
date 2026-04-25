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
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import {
  Building2,
  Mail,
  FileText,
  MapPin,
  Stethoscope,
  Users,
  Briefcase,
  Wallet,
  Calendar,
  CreditCard,
  TrendingUp,
  Activity,
  MousePointerClick,
  Clock,
  Crown,
  BadgeCheck,
  ClipboardCheck,
  Monitor,
  UserPlus,
} from "lucide-react";
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


  //==========================================//
 // Initialization: Metrics names and colors //
//==========================================//  
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

  //=============================//
 // Function: General Dashboard //
//=============================//
export function GeneralDashboard({ data }: { data: any }) {

        //====================================================================//
       // Constants:                                                         // 
      //   - Possible time ranges, set at 7 days value by default           //
     //    - The actual selected metric, set at exercises value by default //
    //     - The metric that is been hovered                              //
   //      - Copied values dictionary                                    //
  //====================================================================//
  const [selectedView, setSelectedView] = useState<"7days" | "30days" | "monthly">("7days");
  const [selectedMetric, setSelectedMetric] = useState<MetricType>("exercises");
  const [hoveredMetric, setHoveredMetric] = useState<MetricType | null>(null);
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({});

    //======================================================//
   // Function: Get the Daily Data Analytics based on view //
  //======================================================//
  const getChartData = () => {
    const dailyData = data?.analytics?.daily || [];
    if (!dailyData.length) return [];

       //===========================================================//
      // - Slice: Takes last n elements of the array of daily data //
     //  - Format: Data is formatted to display in the charts     //
    //===========================================================//
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



           //=====================================================================//
          // - Map: Monthly data map to group data by months                     //
         //     - For each stat, a day is created.                              //
        //      - For each Month, a unique key is created                      //
       //       - Create display format for each month                        //
      //        - If a months key isnt in the map, its defined with 0 values //
     //=====================================================================//
     } else {
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



    //===========================================================//
   // Data: Store all necessary use data that will be displayed //
  //===========================================================//
  const chartData = getChartData();
  const totals = data?.analytics?.totals || {};
  const dailyStats = data?.analytics?.daily || [];

    //===========================================//
   // Function: Render icons for boolean values //
  //===========================================//
  const renderBoolean = (value: any) => {
    return value === true || value === "true" ? "✅" : "❌";
  };

    //===================================================//
   // Function: Allows user to copy values to clipboard //
  //===================================================//
  const handleCopy = async (textToCopy: string, fieldId: string) => {
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedStates((prev) => ({ ...prev, [fieldId]: true }));
      setTimeout(() => setCopiedStates((prev) => ({ ...prev, [fieldId]: false })), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = textToCopy;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopiedStates((prev) => ({ ...prev, [fieldId]: true }));
      setTimeout(() => setCopiedStates((prev) => ({ ...prev, [fieldId]: false })), 2000);
    }
  };


    //==================================================//
   // Component: Button that calls handleCopy function //
  //==================================================//
  const CopyButton = ({ text, fieldId }: { text: string; fieldId: string }) => {
    if (!text || text === "—") return null;
    return (
      <button
        onClick={() => handleCopy(text, fieldId)}
        className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-secondary transition-all duration-200 hover:scale-105"
        title="Copiar"
      >
        {copiedStates[fieldId] ? (
          <Check className="h-4 w-4 text-emerald-500" />
        ) : (
          <Copy className="h-4 w-4 text-muted-foreground" />
        )}
        {copiedStates[fieldId] && (
          <span className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-lg">
            ¡Copiado!
          </span>
        )}
      </button>
    );
  };

    //=================================================//
   // Data: Extract the data response from the server //
  //=================================================//  
  const name = data.properties?.commercial_name || data.properties?.name || "—";
  const centerId = data.properties?.nup_center_id || "—";
  const email = data.properties?.email || "—";
  const cif = data.properties?.cif || "—";
  const region = data.properties?.region_backend || data.properties?.region || "—";
  const specialty = data.properties?.company_specialty__por_definir_ || "—";
  const numPatients = data.properties?.num_patients || "—";
  const numEmployees = data.properties?.num_employees || "—";

  const subscriptionStatus = data.properties?.subscription_status__por_definir_ || "—";
  const subscriptionPlan = data.properties?.subscription_kind__por_definir_ || "—";
  const periodEnd = data.properties?.subscription_current_period_end || "—";
  const totalDays = data.properties?.all_subscription_days || "—";
  const hasAssessment = data.properties?.has_assessment;
  const hasDigitalMaterial = data.properties?.has_digital_material__por_definir_;
  const hasExtraProfessionals = data.properties?.has_extra_professionals;

  const nup2goBalance = data.properties?.nup2go_balance || "—";
  const nup2goPatients = data.properties?.nup2go_patients || "—";
  const lastAssignment = data.properties?.last_nup2go_assigment || "—";
  const lastPayment = data.properties?.last_nup2go_payment_date || "—";

  const totalEvents = totals.total_events || 0;
  const totalSessions = totals.total_sessions || 0;
  const totalLogins = totals.total_logins || 0;
  const totalExercises = totals.total_exercises || 0;

    //============================================//
   // Data: Formatted view of last activity date //
  //============================================//
  const lastActivity = data.properties?.last_company_login
    ? new Date(data.properties.last_company_login).toLocaleDateString("es", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "—";

  const avgDaily = Math.round(totalExercises / Math.max(dailyStats.length, 1));

    //=========================//
   // Function: Formats Dates //
  //=========================//
  const formatDate = (dateStr: string) => {
    if (!dateStr || dateStr === "—") return "—";
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" });
  };

    //========================================================================//
   // Component: Rows that will render in the Metric Cards based on the data //
  //========================================================================// 
  const MetricRow = ({ icon: Icon, label, value, copyField }: any) => {
    const displayValue = value === undefined || value === null ? "—" : value;
    const isBoolean = typeof value === "boolean" || value === "true" || value === "false";
    const boolResult = isBoolean ? renderBoolean(value) : null;
    
    return (
      <div className="flex items-center justify-between py-2 border-b last:border-0 px-2 -mx-2 rounded-md transition-colors hover:bg-secondary/50">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          {isBoolean ? (
            <span className="text-sm font-semibold">{boolResult}</span>
          ) : (
            <>
              <span className="text-sm font-semibold">{displayValue}</span>
              {copyField && displayValue !== "—" && (
                <CopyButton text={String(displayValue)} fieldId={copyField} />
              )}
            </>
          )}
        </div>
      </div>
    );
  };


     //======================================================================//
    // Component: Buttons that will be used to change the data in the chart // 
   //  - Triggers setSelectedMetric and setHoveredMetric                   //
  //======================================================================// 
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

     //=============================================================================================//
    // Component: Buttons that will be used to change the data time granularity/range in the chart // 
   //  - Triggers setSelectedMetric and setHoveredMetric                                          //
  //=============================================================================================// 
  const ViewButton = ({ view, label }: { view: "7days" | "30days" | "monthly"; label: string }) => (
    <Button
      variant={selectedView === view ? "default" : "ghost"}
      size="sm"
      onClick={() => setSelectedView(view)}
      className={`transition-all duration-200 ${selectedView === view ? "shadow-md" : ""}`}
    >
      {label}
    </Button>
  );


    //===========================================================================//
   // Function-Component: Data that displays when hoverign chart specific range // 
  //===========================================================================// 
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
    <div className="space-y-4">
      <h2 className="text-xl font-semibold mb-3 px-1">{name}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: Centro */}
        <Card className="group overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:bg-[linear-gradient(86deg,rgba(0,164,189,0.1)-3.28%,rgba(0,189,165,0.1)97.8%)]">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1 text-xs uppercase tracking-wider">
              <Building2 className="h-3 w-3" /> Información del Centro
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            <MetricRow icon={Building2} label="ID Centro" value={centerId} copyField="centerId" />
            <MetricRow icon={Mail} label="Email" value={email} copyField="email" />
            <MetricRow icon={FileText} label="CIF" value={cif} copyField="cif" />
            <MetricRow icon={MapPin} label="Región" value={region} />
            <MetricRow icon={Stethoscope} label="Especialidad" value={specialty} />
            <MetricRow icon={Users} label="Pacientes" value={numPatients} />
            <MetricRow icon={Briefcase} label="Empleados" value={numEmployees} />
          </CardContent>
        </Card>

        {/* Card 2: Suscripción */}
        <Card className="group overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:bg-[linear-gradient(86deg,rgba(0,164,189,0.1)-3.28%,rgba(0,189,165,0.1)97.8%)]">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1 text-xs uppercase tracking-wider">
              <Crown className="h-3 w-3" /> Suscripción
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            <MetricRow icon={BadgeCheck} label="Estado" value={subscriptionStatus} />
            <MetricRow icon={Crown} label="Plan" value={subscriptionPlan} />
            <MetricRow icon={Calendar} label="Finaliza" value={formatDate(periodEnd)} />
            <MetricRow icon={Clock} label="Días suscrito" value={totalDays} />
            <MetricRow icon={ClipboardCheck} label="Assessment" value={hasAssessment} />
            <MetricRow icon={Monitor} label="Material Digital" value={hasDigitalMaterial} />
            <MetricRow icon={UserPlus} label="Profesionales Extra" value={hasExtraProfessionals} />
          </CardContent>
        </Card>

        {/* Card 3: NUP2GO */}
        <Card className="group overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:bg-[linear-gradient(86deg,rgba(0,164,189,0.1)-3.28%,rgba(0,189,165,0.1)97.8%)]">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1 text-xs uppercase tracking-wider">
              <Wallet className="h-3 w-3" /> NUP2GO
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            <MetricRow icon={Wallet} label="Balance" value={nup2goBalance} />
            <MetricRow icon={Users} label="Pacientes" value={nup2goPatients} />
            <MetricRow icon={Calendar} label="Última tarea" value={formatDate(lastAssignment)} />
            <MetricRow icon={CreditCard} label="Último pago" value={formatDate(lastPayment)} />
          </CardContent>
        </Card>

        {/* Card 4: Datos de uso */}
        <Card className="group overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:bg-[linear-gradient(86deg,rgba(0,164,189,0.1)-3.28%,rgba(0,189,165,0.1)97.8%)]">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1 text-xs uppercase tracking-wider">
              <Activity className="h-3 w-3" /> Datos de uso
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            <MetricRow icon={TrendingUp} label="Eventos totales" value={totalEvents.toLocaleString()} />
            <MetricRow icon={Users} label="Sesiones" value={totalSessions.toLocaleString()} />
            <MetricRow icon={MousePointerClick} label="Logins" value={totalLogins.toLocaleString()} />
            <MetricRow icon={Activity} label="Ejercicios" value={totalExercises.toLocaleString()} />
            <MetricRow icon={Calendar} label="Última actividad" value={lastActivity} />
            <MetricRow icon={TrendingUp} label="Media diaria" value={avgDaily.toLocaleString()} />
          </CardContent>
        </Card>
      </div>

      {/* Chart Section (unchanged) */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-gradient-to-r from-background to-secondary/5 pb-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                {React.createElement(metricConfig[selectedMetric].icon, { className: "h-5 w-5 text-primary" })}
              </div>
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
                  <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => v.toLocaleString()} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Area type="monotone" dataKey={selectedMetric} stroke={metricConfig[selectedMetric].color} strokeWidth={2} fill="url(#metricGradient)" dot={{ r: 4 }} activeDot={{ r: 6 }} name={metricConfig[selectedMetric].name} />
                  <Line type="monotone" dataKey={selectedMetric} stroke={metricConfig[selectedMetric].color} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} name={metricConfig[selectedMetric].name} />
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

      {/* Footer */}
      <Card className="bg-gradient-to-r from-primary/5 to-secondary/5">
        <CardContent className="py-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-xs text-muted-foreground">Datos actualizados desde HubSpot</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-blue-500" />
              <span className="text-xs text-muted-foreground">ID Centro: {centerId}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}