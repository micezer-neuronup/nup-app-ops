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
} from "lucide-react";

interface CenterInfoCardProps {
  centerId?: string | number;
  email?: string;
  cif?: string;
  region?: string;
  specialty?: string;
  numPatients?: string | number;
  numEmployees?: string | number;
}

// 🗺️ Diccionario para mapear las especialidades de la BD a texto limpio
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

// MetricRow con tu sistema de copia e iframe fallback integrado
const MetricRow = ({ icon: Icon, label, value, copyField }: any) => {
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

  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0 px-2 -mx-2 rounded-md transition-colors hover:bg-secondary/50">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium text-muted-foreground shrink-0">{label}</span>
      </div>
      <div className="flex items-center gap-2 max-w-[65%] justify-end">
        <span className="text-sm font-semibold truncate">{displayValue}</span>
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

export function CenterInfoCard({
  centerId,
  email,
  cif,
  region,
  specialty,
  numPatients,
  numEmployees,
}: CenterInfoCardProps) {
  
  // Si la especialidad existe en nuestro diccionario, la traducimos. Si no, dejamos lo que venga.
  const formattedSpecialty = specialty && specialtyLabels[specialty] 
    ? specialtyLabels[specialty] 
    : specialty;

  return (
    <Card className="group overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:bg-accent/30 h-[450px] flex flex-col">
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
        
        {/* Pasamos la especialidad ya formateada */}
        <MetricRow icon={Stethoscope} label="Especialidad" value={formattedSpecialty} />
        
        <MetricRow icon={Users} label="Pacientes" value={numPatients} />
        <MetricRow icon={Briefcase} label="Empleados" value={numEmployees} />
      </CardContent>
    </Card>
  );
}