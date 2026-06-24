// components/Dashboards/CenterInfoCard.tsx
"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import {
  Building2,
  Mail,
  FileText,
  MapPin,
  Stethoscope,
  Users,
  Briefcase,
  Copy,
  Check,
  Globe,
  Activity,
  AlertTriangle,
} from "lucide-react";

interface CenterInfoCardProps {
  centerId?: string | number;
  email?: string;
  cif?: string;
  region?: string;
  specialty?: string;
  numPatients?: string | number;
  numEmployees?: string | number;
  market?: string | number;
  healthScore?: number;
  churnStatus?: "alto" | "medio" | "bajo" | string;
}

const specialtyLabels: Record<string, string> = {
  brain_injury: "Daño Cerebral",
  brain_damage: "Daño Cerebral",
  multiple_sclerosis: "Esclerosis Múltiple",
  cancer: "Cáncer",
  down: "Síndrome de Down",
  cerebral_palsy: "Parálisis Cerebral",
  intellectual_disability: "Discapacidad Intelectual",
  tea: "TEA",
  tdah: "TDAH",
  neurodevelopmental_disorders: "Trastornos del Neurodesarrollo",
  mental_illness: "Enfermedad Mental",
  normal_aging: "Envejecimiento Normal",
};

const MetricRow = ({ icon: Icon, label, value, copyField, color }: any) => {
  const displayValue = value === undefined || value === null || value === "" ? "—" : value;
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!displayValue || displayValue === "—") return;
    try {
      await navigator.clipboard.writeText(String(displayValue));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = String(displayValue);
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const valueClassName = color ? `text-sm font-semibold ${color}` : "text-sm font-semibold";

  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0 px-2 -mx-2 rounded-md transition-colors hover:bg-secondary/50">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium text-muted-foreground shrink-0">{label}</span>
      </div>
      <div className="flex items-center gap-2 max-w-[65%] justify-end">
        <span className={valueClassName}>{displayValue}</span>
        {copyField && displayValue !== "—" && (
          <button
            onClick={handleCopy}
            className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-secondary border transition-all duration-200 hover:scale-105"
            title="Copiar al portapapeles"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-muted-foreground/60" />
            )}
            {copied && (
              <span className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[10px] font-medium text-background shadow-md z-50">
                ¡Copiado!
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  );
};

// ✨ Nuevo componente para fila combinada (Health Score + Churn)
const CombinedRow = ({ healthScore, churnStatus }: { healthScore: number; churnStatus: string }) => {
  const getHealthColor = (score: number) => {
    if (score >= 80) return "text-emerald-600";
    if (score >= 50) return "text-amber-600";
    return "text-rose-600";
  };

  const getChurnColor = (status: string) => {
    const lower = status.toLowerCase();
    if (lower === "bajo" || lower === "low") return "text-emerald-600";
    if (lower === "medio" || lower === "medium") return "text-amber-600";
    return "text-rose-600";
  };

  const formatChurnStatus = (status: string) => {
    if (!status) return "—";
    const map: Record<string, string> = {
      alto: "Alto",
      medio: "Medio",
      bajo: "Bajo",
      low: "Bajo",
      medium: "Medio",
      high: "Alto",
    };
    return map[status.toLowerCase()] || status;
  };

  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0 px-2 -mx-2 rounded-md transition-colors hover:bg-secondary/50">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Activity className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium text-muted-foreground shrink-0">Salud</span>
      </div>
      <div className="flex items-center gap-4 max-w-[65%] justify-end">
        <span className={`text-sm font-semibold ${getHealthColor(healthScore)}`}>
          {healthScore}%
        </span>
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className={`text-sm font-semibold ${getChurnColor(churnStatus)}`}>
            {formatChurnStatus(churnStatus)}
          </span>
        </div>
      </div>
    </div>
  );
};

export function CenterInfoCard({
  centerId,
  email,
  cif,
  region,
  specialty,
  numPatients,
  numEmployees,
  market,
  healthScore = 85,
  churnStatus = "bajo",
}: CenterInfoCardProps) {
  const formattedSpecialty = specialty && specialtyLabels[specialty] 
    ? specialtyLabels[specialty] 
    : specialty;


   // Función para el color del badge de Health Score
  const getHealthBadgeColor = (score: number) => {
    if (score >= 80) return "bg-emerald-100 text-emerald-800 border-emerald-200";
    if (score >= 50) return "bg-amber-100 text-amber-800 border-amber-200";
    return "bg-rose-100 text-rose-800 border-rose-200";
  };

  // Función para el color del badge de Churn
  const getChurnBadgeColor = (status: string) => {
    const lower = status.toLowerCase();
    if (lower === "bajo" || lower === "low") return "bg-emerald-100 text-emerald-800 border-emerald-200";
    if (lower === "medio" || lower === "medium") return "bg-amber-100 text-amber-800 border-amber-200";
    return "bg-rose-100 text-rose-800 border-rose-200";
  };

  const formatChurnStatus = (status: string) => {
    if (!status) return "—";
    const map: Record<string, string> = {
      alto: "Alto",
      medio: "Medio",
      bajo: "Bajo",
      low: "Bajo",
      medium: "Medio",
      high: "Alto",
    };
    return map[status.toLowerCase()] || status;
  };

  return (
    <Card className="group overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:bg-accent/30 h-[500px] flex flex-col">
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-1 text-xs uppercase tracking-wider">
          <Building2 className="h-3 w-3" /> Información del Centro
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        <MetricRow icon={Building2} label="ID Centro" value={centerId} copyField={true} />
        <MetricRow icon={Mail} label="Email" value={email} copyField={true} />
        <MetricRow icon={FileText} label="CIF" value={cif} copyField={true} />
        <MetricRow icon={MapPin} label="Región" value={region} />
        <MetricRow icon={Stethoscope} label="Especialidad" value={formattedSpecialty} />
        <MetricRow icon={Users} label="Pacientes" value={numPatients} />
        <MetricRow icon={Briefcase} label="Empleados" value={numEmployees} />
        <MetricRow icon={Globe} label="Mercado" value={market} />

        {/* ✨ NUEVA FILA COMPARTIDA: Health Score + Churn (Riesgo de Churn) */}
{/* ✨ FILA COMPARTIDA: Health Score + Riesgo Churn (cada uno ocupa la mitad) */}
<div className="flex items-center justify-between py-2 border-b last:border-0 px-2 -mx-2 rounded-md transition-colors hover:bg-secondary/50">
  {/* MITAD IZQUIERDA: Health Score */}
  <div className="flex items-center gap-2 w-1/2">
    <Activity className="h-4 w-4 text-muted-foreground shrink-0" />
    <span className="text-sm font-medium text-muted-foreground shrink-0">Health Score</span>
    <span className={`text-sm font-semibold px-2.5 py-0.5 rounded-full ${getHealthBadgeColor(healthScore)}`}>
      {healthScore}%
    </span>
  </div>

  {/* MITAD DERECHA: Riesgo Churn */}
  <div className="flex items-center gap-2 w-1/2 justify-end">
    <AlertTriangle className="h-4 w-4 text-muted-foreground shrink-0" />
    <span className="text-sm font-medium text-muted-foreground shrink-0">Riesgo Churn</span>
    <span className={`text-sm font-semibold px-2.5 py-0.5 rounded-full ${getChurnBadgeColor(churnStatus)}`}>
      {formatChurnStatus(churnStatus)}
    </span>
  </div>
        </div>
      </CardContent>
    </Card>
  );
}