// components/Dashboards/SubscriptionCard.tsx
"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, CreditCard, CheckCircle2, ShieldCheck, AlertCircle, Users, Globe } from "lucide-react";

// Diccionario con descripciones formateadas
const featureLabels: Record<string, string> = {
  activity_all: "Acceso a todas las actividades",
  adults_digital: "Actividades digitales para adultos",
  adults_kids_digital: "Actividades digitales para adultos y niños",
  adults_kids_paper: "Actividades en papel para adultos y niños",
  adults_paper: "Actividades en papel para adultos",
  kids_digital: "Actividades digitales para niños",
  kids_paper: "Actividades en papel para niños",
  test_all: "Acceso a todos los tests y evaluaciones",
  employee_4: "Hasta 4 profesionales por centro",
  extra_employee: "Profesionales adicionales",
  nup2go: "Acceso a NUP2GO",
  extra_barranquilla: "Actividades extra Barranquilla",
  extra_grupo5: "Actividades extra Grupo5",
  extras_biodonostia: "Actividades extra Biodonostia",
  extras_ub: "Actividades extra UB",
  investigacion_biocruces: "Investigación Biocruces",
  investigacion_demo: "Investigación demo",
  investigacion_loyola: "Investigación Loyola",
  proximamente: "Próximamente",
  testing: "Testing (uso interno)",
};

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  return date.toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" });
};

export function SubscriptionCard({
  subscriptionData,
  onOpenModal,
}: {
  subscriptionData: any;
  onOpenModal?: () => void;
}) {
  const status = subscriptionData?.current_state || "—";
  const isForever = subscriptionData?.is_forever;
  const rawEndDate = subscriptionData?.current_period_end;
  const features = subscriptionData?.subscription_features || [];
  const archetype = subscriptionData?.archetype || "—";
  const currency = subscriptionData?.currency || "EUR";

  // Calcular total días suscrito (suma de renovaciones * 30)
  const totalDays = (subscriptionData?.subscription_items || []).reduce(
    (acc: number, item: any) => acc + (item.number_of_renovations * 30),
    0
  );

  const isActive = status === "active" || status === "trialing";
  const StatusIcon = isActive ? CheckCircle2 : AlertCircle;

  let endDateDisplay = "—";
  if (isForever) {
    endDateDisplay = "Renovación Automática";
  } else if (rawEndDate) {
    endDateDisplay = formatDate(rawEndDate);
  }

  return (
    <Card className="group overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:bg-accent/30">
      <CardHeader className="pb-2 flex flex-row items-start justify-between">
        <div>
          <CardDescription className="flex items-center gap-1 text-xs uppercase tracking-wider">
            <CreditCard className="h-3 w-3" /> Suscripción
          </CardDescription>
          <CardTitle className="text-xl font-semibold mt-1 flex items-center gap-2">
            <Badge variant={isActive ? "default" : "destructive"} className="uppercase text-[10px]">
              <StatusIcon className="h-3 w-3 mr-1" /> {status}
            </Badge>
          </CardTitle>
        </div>
        <Button variant="outline" size="sm" onClick={onOpenModal}>
          Gestionar
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Fechas y datos adicionales */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Fin del ciclo
            </p>
            <p className="text-sm font-medium">{endDateDisplay}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Users className="h-3 w-3" /> Segmento
            </p>
            <p className="text-sm font-medium">{archetype}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Días suscrito
            </p>
            <p className="text-sm font-medium">{totalDays > 0 ? `${totalDays} días` : "—"}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Globe className="h-3 w-3" /> Moneda
            </p>
            <p className="text-sm font-medium">{currency}</p>
          </div>
        </div>

        {/* Módulos (Features) con nombre formateado + clave original */}
        <div className="space-y-2 pt-2 border-t">
          <p className="text-xs text-muted-foreground">Módulos habilitados:</p>
          <div className="flex flex-wrap gap-2">
            {features.length > 0 ? (
              features.map((featureKey: string, idx: number) => (
                <Badge key={idx} variant="secondary" className="font-normal bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                  <ShieldCheck className="h-3 w-3 mr-1" />
                  {featureLabels[featureKey] || featureKey}
                  <span className="ml-1 text-[10px] opacity-70">({featureKey})</span>
                </Badge>
              ))
            ) : (
              <span className="text-sm text-muted-foreground">Ningún módulo extra</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}