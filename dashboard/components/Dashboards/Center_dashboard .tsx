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
import {
  Copy,
  Check,
  Building2,
  Mail,
  FileText,
  MapPin,
  Stethoscope,
  Users,
  Briefcase,
  ClipboardCheck,
  UserPlus,
  Monitor,
  BadgeInfo,
} from "lucide-react";

export function Center_dashboard({ data }: { data: any }) {
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({});

  const renderBooleanValue = (value?: boolean | string) => {
    if (value === true || value === "true") {
      return { text: "Sí", icon: "✅", color: "text-emerald-500" };
    }
    return { text: "No", icon: "❌", color: "text-rose-500" };
  };

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

  const MetricCard = ({
    icon: Icon,
    label,
    value,
    copyField,
    color = "from-slate-500 to-gray-600",
    badge,
  }: {
    icon: any;
    label: string;
    value: any;
    copyField?: string;
    color?: string;
    badge?: string;
  }) => {
    const displayValue = value || "—";
    const isBoolean = typeof value === "boolean" || value === "true" || value === "false";
    const boolResult = isBoolean ? renderBooleanValue(value) : null;

    return (
      <Card className="group relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
        <div
          className={`absolute inset-0 bg-gradient-to-br ${color} opacity-0 group-hover:opacity-5 transition-opacity duration-300`}
        />
        <CardHeader className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <div
                  className={`p-1.5 rounded-lg bg-gradient-to-br ${color} text-white shadow-md`}
                >
                  <Icon className="h-3 w-3" />
                </div>
                <CardDescription className="text-xs uppercase tracking-wider font-semibold">
                  {label}
                </CardDescription>
              </div>
              <div className="flex items-center justify-between gap-2">
                {isBoolean ? (
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold">{boolResult?.icon}</span>
                    <span className={`text-sm font-medium ${boolResult?.color}`}>
                      {boolResult?.text}
                    </span>
                  </div>
                ) : (
                  <CardTitle className="text-lg font-semibold break-words">
                    {displayValue}
                  </CardTitle>
                )}
                {copyField && displayValue !== "—" && !isBoolean && (
                  <CopyButton text={displayValue} fieldId={copyField} />
                )}
              </div>
              {badge && (
                <div className="mt-2">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                    {badge}
                  </span>
                </div>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>
    );
  };

  const centerName = data.properties?.commercial_name || data.properties?.name;
  const region = data.properties?.region_backend || data.properties?.region;
  const specialty = data.properties?.company_specialty__por_definir_;
  const hasAssessment = data.properties?.has_assessment;
  const hasExtraProfessionals = data.properties?.has_extra_professionals;
  const hasDigitalMaterial = data.properties?.has_digital_material__por_definir_;

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          {centerName && centerName !== "—" && (
            <h2 className="text-muted-foreground">
              <span className="font-medium text-foreground">{centerName}</span>
            </h2>
          )}
        </div>
      </div>

      {/* Información General */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1 rounded-md bg-primary/10">
            <Building2 className="h-4 w-4 text-primary" />
          </div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Información General
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <MetricCard
            icon={Building2}
            label="ID Centro"
            value={data.properties?.nup_center_id}
            copyField="nup_center_id"
            color="from-indigo-500 to-purple-600"
          />
          <MetricCard
            icon={Mail}
            label="Email"
            value={data.properties?.email}
            copyField="email"
            color="from-sky-500 to-blue-600"
          />
          <MetricCard
            icon={FileText}
            label="CIF"
            value={data.properties?.cif}
            copyField="cif"
            color="from-amber-500 to-orange-600"
          />
          <MetricCard
            icon={MapPin}
            label="Región"
            value={region}
            color="from-emerald-500 to-teal-600"
          />
        </div>
      </div>

      {/* Datos Profesionales */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1 rounded-md bg-primary/10">
            <Stethoscope className="h-4 w-4 text-primary" />
          </div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Datos Profesionales
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <MetricCard
            icon={BadgeInfo}
            label="Especialidad"
            value={specialty}
            color="from-violet-500 to-purple-600"
          />
          <MetricCard
            icon={Users}
            label="Número de pacientes"
            value={data.properties?.num_patients}
            color="from-rose-500 to-pink-600"
          />
          <MetricCard
            icon={Briefcase}
            label="Número de empleados"
            value={data.properties?.num_employees}
            color="from-cyan-500 to-blue-600"
          />
        </div>
      </div>

      {/* Servicios y Características */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1 rounded-md bg-primary/10">
            <ClipboardCheck className="h-4 w-4 text-primary" />
          </div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Servicios y Características
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard
            icon={ClipboardCheck}
            label="Assessment"
            value={hasAssessment}
            color="from-emerald-500 to-green-600"
            badge="Evaluación"
          />
          <MetricCard
            icon={UserPlus}
            label="Profesionales Extra"
            value={hasExtraProfessionals}
            color="from-orange-500 to-amber-600"
            badge="Recursos adicionales"
          />
          <MetricCard
            icon={Monitor}
            label="Material Digital"
            value={hasDigitalMaterial}
            color="from-teal-500 to-cyan-600"
            badge="Recursos digitales"
          />
        </div>
      </div>

      {/* Footer con información de la API */}
      <Card className="bg-gradient-to-r from-primary/5 to-secondary/5">
        <CardContent className="py-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-xs text-muted-foreground">
                Datos actualizados desde HubSpot
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-blue-500" />
              <span className="text-xs text-muted-foreground">
                ID: {data.properties?.nup_center_id || "—"}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}