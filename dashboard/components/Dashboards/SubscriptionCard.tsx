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
import { Calendar, CreditCard, CheckCircle2, ShieldCheck, AlertCircle } from "lucide-react";

// Diccionario completo con las descripciones exactas de base de datos
const featureLabels: Record<string, string> = {
  // Features generales
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
  
  // Features específicas y de investigación
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

// Formateador de fechas
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

  // Lógica de estado visual
  const isActive = status === "active" || status === "trialing";
  const StatusIcon = isActive ? CheckCircle2 : AlertCircle;

  // Lógica de la fecha de finalización
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
            <CreditCard className="h-3 w-3" /> Suscripción Activa
          </CardDescription>
          <CardTitle className="text-xl font-semibold mt-1 flex items-center gap-2">
            Plan Básico
            <Badge variant={isActive ? "default" : "destructive"} className="ml-2 uppercase text-[10px]">
              <StatusIcon className="h-3 w-3 mr-1" /> {status}
            </Badge>
          </CardTitle>
        </div>
        <Button variant="outline" size="sm" onClick={onOpenModal}>
          Gestionar
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Fechas */}
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-8 mt-2">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Fin del ciclo
            </p>
            <p className="text-sm font-medium">
              {endDateDisplay}
            </p>
          </div>
        </div>

        {/* Módulos (Features) */}
        <div className="space-y-2 pt-2 border-t">
          <p className="text-xs text-muted-foreground">Módulos habilitados:</p>
          <div className="flex flex-wrap gap-2">
            {features.length > 0 ? (
              features.map((featureKey: string, idx: number) => (
                <Badge key={idx} variant="secondary" className="font-normal bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                  <ShieldCheck className="h-3 w-3 mr-1" />
                  {/* Si no la encuentra en el diccionario, usa el ID original por seguridad */}
                  {featureLabels[featureKey] || featureKey}
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