"use client";

import * as React from "react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Wallet, Users, Calendar, CreditCard, TrendingUp, Clock } from "lucide-react";

const MetricCard = ({
  icon: Icon,
  label,
  value,
  color = "from-slate-500 to-gray-600",
  subtitle,
  trend,
}: {
  icon: any;
  label: string;
  value: any;
  color?: string;
  subtitle?: string;
  trend?: { value: number; positive: boolean };
}) => {
  const displayValue = value || "—";
  const isDate = displayValue !== "—" && /^\d{4}-\d{2}-\d{2}/.test(displayValue);

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
            <div className="mt-1">
              <CardTitle className="text-2xl font-bold">
                {isDate ? formatDate(displayValue) : displayValue}
              </CardTitle>
              {subtitle && (
                <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
              )}
              {trend && (
                <div
                  className={`flex items-center gap-1 mt-2 text-xs ${
                    trend.positive ? "text-emerald-500" : "text-rose-500"
                  }`}
                >
                  <TrendingUp
                    className={`h-3 w-3 ${trend.positive ? "" : "rotate-180"}`}
                  />
                  <span>{trend.value}% respecto al mes anterior</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
    </Card>
  );
};

export function Nup2go_dashboard({ data }: { data: any }) {
  const balance = data.properties?.nup2go_balance;
  const patients = data.properties?.nup2go_patients;
  const lastAssignment = data.properties?.last_nup2go_assigment;
  const lastPayment = data.properties?.last_nup2go_payment_date;

  return (
    <div className="space-y-6">
      {/* Resumen Financiero */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1 rounded-md bg-primary/10">
            <Wallet className="h-4 w-4 text-primary" />
          </div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Resumen Financiero
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2">
          <MetricCard
            icon={Wallet}
            label="Balance NUP2GO"
            value={balance}
            color="from-emerald-500 to-teal-600"
            subtitle="Créditos disponibles"
          />
          <MetricCard
            icon={Users}
            label="Pacientes NUP2GO"
            value={patients}
            color="from-sky-500 to-blue-600"
            subtitle="Pacientes asignados"
          />
        </div>
      </div>

      {/* Actividad Reciente */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1 rounded-md bg-primary/10">
            <Clock className="h-4 w-4 text-primary" />
          </div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Actividad Reciente
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2">
          <MetricCard
            icon={Calendar}
            label="Última Tarea"
            value={lastAssignment}
            color="from-orange-500 to-amber-600"
            subtitle="Última asignación realizada"
          />
          <MetricCard
            icon={CreditCard}
            label="Último Pago"
            value={lastPayment}
            color="from-purple-500 to-indigo-600"
            subtitle="Última transacción registrada"
          />
        </div>
      </div>

      {/* Footer con información */}
      <Card className="bg-gradient-to-r from-primary/5 to-secondary/5">
        <CardContent className="py-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-xs text-muted-foreground">
                Sistema de créditos NUP2GO
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-blue-500" />
              <span className="text-xs text-muted-foreground">
                Balance:{" "}
                {balance !== undefined && balance !== "—"
                  ? `${balance} créditos`
                  : "No disponible"}
              </span>
            </div>
            {patients && patients !== "—" && (
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-purple-500" />
                <span className="text-xs text-muted-foreground">
                  {patients} pacientes asignados
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}