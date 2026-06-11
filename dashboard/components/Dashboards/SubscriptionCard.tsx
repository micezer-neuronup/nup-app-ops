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
import { Calendar, CreditCard, CheckCircle2, ShieldCheck, AlertCircle, Users, Globe, Package, CreditCard as CreditCardIcon } from "lucide-react";

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

const currencySymbols: Record<string, string> = {
  eur: "€",
  usd: "$",
  gbp: "£",
  brl: "R$",
  mxn: "$",
  aud: "$",
  inr: "₹",
};

export function SubscriptionCard({
  subscriptionData,
  currency,
  segment,
  allSubscriptionDays,
  nup2goBalance,
  onOpenModal,
}: {
  subscriptionData: any;
  currency: string;
  segment: string;
  allSubscriptionDays: number;
  nup2goBalance?: number;
  onOpenModal?: () => void;
}) {
  const status = subscriptionData?.current_state || "—";
  const isForever = subscriptionData?.is_forever;
  const rawEndDate = subscriptionData?.current_period_end;
  const features: string[] = subscriptionData?.subscription_features || [];
  const items = subscriptionData?.subscription_items || [];

  // Asegurar NUP2GO en productos
  let productItems = [...items];
  const hasNup2go = productItems.some(item => item.product_name === "NUP2GO");
  if (!hasNup2go && nup2goBalance !== undefined) {
    productItems.push({
      product_name: "NUP2GO",
      billing_interval: "month",
      unit_price: 0,
      quantity: 1,
    });
  }

  const isActive = status === "active" || status === "trialing";
  const StatusIcon = isActive ? CheckCircle2 : AlertCircle;

  let endDateDisplay = "—";
  if (isForever) {
    endDateDisplay = "Renovación Automática";
  } else if (rawEndDate) {
    endDateDisplay = formatDate(rawEndDate);
  }

  const currencyKey = currency?.toLowerCase();
  const currencySymbol = currencySymbols[currencyKey] || "";
  const currencyDisplay = currency && currency !== "—"
    ? `${currencySymbol} (${currency.toUpperCase()})`
    : "—";

  const productList = productItems.map((item: any) => {
    if (item.product_name === "NUP2GO") {
      return { name: "NUP2GO", value: nup2goBalance !== undefined ? `${nup2goBalance} créditos` : "—" };
    }
    return {
      name: item.product_name,
      value: `${item.unit_price} €/${item.billing_interval === "month" ? "mes" : "año"} ${item.quantity > 1 ? `(x${item.quantity})` : ""}`,
    };
  });

  return (
    <Card className="group overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:bg-accent/30 flex flex-col h-[450px] flex flex-col">
      <CardHeader className="pb-2 flex flex-row items-start justify-between shrink-0">
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
      <CardContent className="flex-1 flex flex-col overflow-hidden p-0">
        <div className="flex-1 overflow-y-auto px-6 space-y-4 pb-4 min-h-0">
          {/* Métricas fijas */}
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
              <p className="text-sm font-medium">{segment}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Días suscrito
              </p>
              <p className="text-sm font-medium">{allSubscriptionDays > 0 ? `${allSubscriptionDays} días` : "—"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Globe className="h-3 w-3" /> Moneda
              </p>
              <p className="text-sm font-medium">{currencyDisplay}</p>
            </div>
          </div>

          {/* Productos activos */}
          {productList.length > 0 && (
            <div className="space-y-2 pt-2 border-t">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Package className="h-3 w-3" /> Productos activos
              </p>
              <div className="space-y-1">
                {productList.map((product, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <CreditCardIcon className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">{product.name}</span>
                    </div>
                    <span className="font-semibold">{product.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Módulos (Features) */}
          <div className="space-y-2 pt-2 border-t">
            <p className="text-xs text-muted-foreground">Módulos habilitados:</p>
            <div className="flex flex-wrap gap-2 pb-2">
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
        </div>
      </CardContent>
    </Card>
  );
}