"use client";

import * as React from "react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import {
  BadgeCheck,
  Crown,
  Calendar,
  Clock,
  ClipboardCheck,
  Monitor,
  UserPlus,
  AlertCircle,
  TrendingUp,
} from "lucide-react";

const getStatusColor = (status: string) => {
  if (!status) return "from-gray-500 to-gray-600";
  const statusLower = status.toLowerCase();
  if (statusLower.includes("active")) return "from-emerald-500 to-teal-600";
  if (statusLower.includes("cancel")) return "from-rose-500 to-pink-600";
  if (statusLower.includes("trial")) return "from-amber-500 to-orange-600";
  return "from-slate-500 to-gray-600";
};

const getStatusIcon = (status: string) => {
  if (!status) return BadgeCheck;
  const statusLower = status.toLowerCase();
  if (statusLower.includes("active")) return BadgeCheck;
  if (statusLower.includes("cancel")) return AlertCircle;
  if (statusLower.includes("trial")) return TrendingUp;
  return BadgeCheck;
};

const formatDate = (dateStr: string) => {
  if (!dateStr || dateStr === "—") return "—";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString("es", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

const renderBooleanValue = (value?: boolean | string) => {
  if (value === true || value === "true") {
    return { text: "Sí", icon: "✅", color: "text-emerald-500" };
  }
  return { text: "No", icon: "❌", color: "text-rose-500" };
};

const MetricCard = ({
  icon: Icon,
  label,
  value,
  color = "from-slate-500 to-gray-600",
  subtitle,
  isDate = false,
  isStatus = false,
}: {
  icon: any;
  label: string;
  value: any;
  color?: string;
  subtitle?: string;
  isDate?: boolean;
  isStatus?: boolean;
}) => {
  const displayValue = value || "—";
  const StatusIcon = isStatus ? getStatusIcon(displayValue) : Icon;
  const finalColor = isStatus ? getStatusColor(displayValue) : color;

  return (
    <Card className="group relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
      <div
        className={`absolute inset-0 bg-gradient-to-br ${finalColor} opacity-0 group-hover:opacity-5 transition-opacity duration-300`}
      />
      <CardHeader className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <div
                className={`p-1.5 rounded-lg bg-gradient-to-br ${finalColor} text-white shadow-md`}
              >
                <StatusIcon className="h-3 w-3" />
              </div>
              <CardDescription className="text-xs uppercase tracking-wider font-semibold">
                {label}
              </CardDescription>
            </div>
            <div className="mt-1">
              <CardTitle
                className={`text-lg font-semibold ${
                  isStatus ? "capitalize" : ""
                }`}
              >
                {isDate ? formatDate(displayValue) : displayValue}
              </CardTitle>
              {subtitle && (
                <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
    </Card>
  );
};

const BooleanCard = ({
  label,
  value,
  color = "from-violet-500 to-purple-600",
  icon: Icon,
}: {
  label: string;
  value: any;
  color?: string;
  icon: any;
}) => {
  const boolResult = renderBooleanValue(value);

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
            <div className="flex items-center gap-2 mt-1">
              <span className="text-2xl font-bold">{boolResult.icon}</span>
              <span className={`text-sm font-medium ${boolResult.color}`}>
                {boolResult.text}
              </span>
            </div>
          </div>
        </div>
      </CardHeader>
    </Card>
  );
};

export function Subscription_dashboard({ data }: { data: any }) {
  const subscriptionStatus = data.properties?.subscription_status__por_definir_;
  const subscriptionPlan = data.properties?.subscription_kind__por_definir_;
  const periodEnd = data.properties?.subscription_current_period_end;
  const totalDays = data.properties?.all_subscription_days;
  const hasAssessment = data.properties?.has_assessment;
  const hasDigitalMaterial = data.properties?.has_digital_material__por_definir_;
  const hasExtraProfessionals = data.properties?.has_extra_professionals;

  return (
    <div className="space-y-6">
      {/* Estado y Plan */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1 rounded-md bg-primary/10">
            <Crown className="h-4 w-4 text-primary" />
          </div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Información del Plan
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2">
          <MetricCard
            icon={BadgeCheck}
            label="Estado"
            value={subscriptionStatus}
            isStatus={true}
            subtitle="Estado actual de la suscripción"
          />
          <MetricCard
            icon={Crown}
            label="Plan"
            value={subscriptionPlan}
            color="from-amber-500 to-orange-600"
            subtitle="Tipo de suscripción"
          />
        </div>
      </div>

      {/* Fechas y Duración */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1 rounded-md bg-primary/10">
            <Calendar className="h-4 w-4 text-primary" />
          </div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Plazos y Duración
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2">
          <MetricCard
            icon={Calendar}
            label="Finaliza"
            value={periodEnd}
            isDate={true}
            color="from-rose-500 to-pink-600"
            subtitle="Fin del período actual"
          />
          <MetricCard
            icon={Clock}
            label="Total días suscrito"
            value={totalDays}
            color="from-cyan-500 to-blue-600"
            subtitle="Días totales de suscripción"
          />
        </div>
      </div>

      {/* Servicios Incluidos */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1 rounded-md bg-primary/10">
            <ClipboardCheck className="h-4 w-4 text-primary" />
          </div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Servicios Incluidos
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <BooleanCard
            icon={ClipboardCheck}
            label="Assessment"
            value={hasAssessment}
            color="from-emerald-500 to-teal-600"
          />
          <BooleanCard
            icon={Monitor}
            label="Material Digital"
            value={hasDigitalMaterial}
            color="from-sky-500 to-blue-600"
          />
          <BooleanCard
            icon={UserPlus}
            label="Profesionales Extra"
            value={hasExtraProfessionals}
            color="from-violet-500 to-purple-600"
          />
        </div>
      </div>

      {/* Footer */}
      <Card className="bg-gradient-to-r from-primary/5 to-secondary/5">
        <CardContent className="py-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="flex items-center gap-2">
              <div
                className={`h-2 w-2 rounded-full ${
                  subscriptionStatus?.toLowerCase().includes("active")
                    ? "bg-emerald-500"
                    : "bg-rose-500"
                }`}
              />
              <span className="text-xs text-muted-foreground">
                Estado: {subscriptionStatus || "No disponible"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-amber-500" />
              <span className="text-xs text-muted-foreground">
                Plan: {subscriptionPlan || "No disponible"}
              </span>
            </div>
            {totalDays && totalDays !== "—" && (
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-cyan-500" />
                <span className="text-xs text-muted-foreground">
                  {totalDays} días de antigüedad
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}