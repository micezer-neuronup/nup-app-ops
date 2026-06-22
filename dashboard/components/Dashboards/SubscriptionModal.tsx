"use client";

import { useState, useEffect } from "react";
import { X, Edit, ShieldCheck, Calendar, CreditCard } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" });
  } catch (e) {
    return "—";
  }
}

function normalizeFeatures(rawFeatures: any): string[] {
  if (!rawFeatures) return [];
  const featureArray = Array.isArray(rawFeatures) ? rawFeatures : typeof rawFeatures === 'string' ? rawFeatures.split(',') : [];
  return Array.from(
    new Set(
      featureArray
        .flatMap((f: any) => typeof f === "string" ? f.split(",") : [])
        .map((f: string) => f.trim())
        .filter((f: string) => f.length > 0)
    )
  );
}

const currencySymbols: Record<string, string> = {
  eur: "€",
  usd: "$",
  gbp: "£",
  brl: "R$",
  mxn: "$",
  aud: "$",
  inr: "₹",
};

export function SubscriptionModal({ 
  open, 
  onOpenChange, 
  currency,
  subscriptionData,
  nup2goBalance,
  nup2goPatients,
  lastNup2goAssignment,
  lastNup2goPaymentDate,
  market
}: any) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (open) {
      setSelectedIndex(0);
    }
  }, [open, subscriptionData]);

  if (!open) return null;

  const history = subscriptionData?.history || [subscriptionData || {}];
  const activeSub = history[selectedIndex] || {};

  let items = activeSub.subscription_items || activeSub.items || [];
  if (!Array.isArray(items)) items = [];

  const currencyKey = currency?.toLowerCase();
  const currencySymbol = currencySymbols[currencyKey] || "";
  const currencyDisplay = currency && currency !== "—"
    ? `${currencySymbol} (${currency.toUpperCase()})`
    : "—";

  const isActiveSubscription = selectedIndex === 0;
  const hasNup2go = items.some((item: any) => item.product_name === "NUP2GO");
  
  if (isActiveSubscription && !hasNup2go) {
    items = [
      ...items,
      {
        product_name: "NUP2GO",
        billing_interval: "month",
        unit_price: 0,
        quantity: 1,
        number_of_renovations: 0,
        features: [],
        status: activeSub.current_state || "active",
      }
    ];
  }

  const globalModalFeatures = Array.from(
    new Set<string>(
      items.flatMap((item: any) => normalizeFeatures(item.features))
    )
  );

  const getSourceLabel = (source: string) => {
    if (!source) return "—";
    const lower = source.toLowerCase();
    if (lower === "backend") {
      return "Manual";
    }
    return source;
  };

  const generalFields = [
    { label: "Suscripción ID", value: activeSub.subscription_id || "—" },
    { label: "Centro", value: activeSub.center_name || "—" },
    { label: "Mercado", value: market || "—" },
    { label: "Inicio", value: formatDate(activeSub.start_date) },
    { label: "Cancelación", value: formatDate(activeSub.cancelation_date || activeSub.cancellation_date) },
    { label: "Precancelación", value: formatDate(activeSub.precancelled_date) },
    { label: "Estado actual", value: activeSub.current_state || "—" },
    { label: "Origen", value: getSourceLabel(activeSub.creation_source || activeSub.source) },
    { label: "Método pago", value: activeSub.payment_method_type || "—" },
    { label: "Moneda", value: (currencyDisplay || "—").toUpperCase() },
    { label: "Vitalicia", value: activeSub.is_forever ? "Sí" : "No" },
    { label: "Última actualización", value: formatDate(activeSub.updated_at) },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative bg-background rounded-lg shadow-lg w-full max-w-7xl h-[90vh] flex flex-col">
        
        <div className="sticky top-0 bg-background border-b p-4 flex items-center justify-between rounded-t-lg shrink-0">
          <h2 className="text-xl font-semibold">Historial y Detalles de Suscripción</h2>
          <div className="flex items-center gap-2">
            <button
              disabled
              className="inline-flex items-center gap-1 rounded-md border border-input bg-secondary/50 px-3 py-1 text-sm font-medium opacity-50 cursor-not-allowed"
            >
              <Edit className="h-4 w-4" /> Modificar
            </button>
            <button onClick={() => onOpenChange(false)} className="p-1 rounded-full hover:bg-accent transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          
          <div className="w-80 border-r bg-muted/10 overflow-y-auto p-4 space-y-3 shrink-0">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-1">
              Historial ({history.length})
            </h3>
            {history.map((histSub: any, idx: number) => {
              const isSelected = selectedIndex === idx;
              const state = histSub.current_state || "—";
              const isActiveState = ['active', 'trial', 'trialing', 'past_due'].includes(state.toLowerCase());
              
              return (
                <button 
                  key={idx}
                  onClick={() => setSelectedIndex(idx)}
                  className={`w-full text-left p-3 rounded-lg border transition-all duration-200 ${
                    isSelected 
                      ? 'bg-primary/5 border-primary shadow-sm' 
                      : 'bg-background hover:bg-accent border-border/50 hover:border-border'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-medium text-sm flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      {formatDate(histSub.start_date || histSub.updated_at)}
                    </span>
                    <Badge 
                      variant={isActiveState ? "default" : "destructive"} 
                      className={`uppercase text-[9px] ${isActiveState ? 'bg-green-600 hover:bg-green-700 text-white border-transparent' : ''}`}
                    >
                      {state}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <CreditCard className="h-3 w-3" />
                      <span className="capitalize">{getSourceLabel(histSub.source || histSub.creation_source)}</span>
                    </span>
                    <span>
                      {(histSub.subscription_items || histSub.items || []).length} items
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex-1 flex overflow-hidden p-6 gap-6 bg-background">
            
            <div className="flex-[2] flex flex-col overflow-hidden space-y-4">
              <div className="flex flex-col overflow-hidden flex-1">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 sticky top-0 bg-background pb-1 shrink-0">
                  Datos generales
                </h3>
                <div className="overflow-y-auto pr-2 pb-2">
                  <Card className="border shadow-sm">
                    <CardContent className="p-4">
                      {/* Reducimos el espaciado entre filas (space-y-0.5) */}
                      <div className="space-y-0.5">
                        {generalFields.map((field, idx) => (
                          <div 
                            key={idx} 
                            /* Reducimos el padding vertical (py-1) */
                            className={`flex justify-between items-center py-1 px-2 rounded-sm ${idx % 2 === 0 ? 'bg-muted/5' : ''}`}
                          >
                            <span className="text-muted-foreground text-xs font-medium">{field.label}</span>
                            {/* Achicamos un poco el texto a text-xs para que quede más integrado */}
                            <span className="text-xs font-medium text-right">{field.value}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              <div className="shrink-0 pb-2">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Módulos habilitados en esta suscripción
                </h3>
                <Card className="border shadow-sm bg-muted/5">
                  <CardContent className="p-4">
                    <div className="flex flex-wrap gap-2">
                      {globalModalFeatures.length > 0 ? (
                        globalModalFeatures.map((f: string, fIdx: number) => (
                          <Badge key={fIdx} variant="secondary" className="font-normal text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 py-1 px-2.5">
                            <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
                            {/* Mostramos la etiqueta mapeada y la clave original entre paréntesis */}
                            {featureLabels[f] || f} <span className="ml-1 text-[10px] opacity-70">({f})</span>
                          </Badge>
                        ))
                      ) : (
                        <span className="text-sm text-muted-foreground">Ningún módulo extra detectado.</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="flex-[1] flex flex-col overflow-hidden">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 sticky top-0 bg-background pb-1 shrink-0">
                Items ({items.length})
              </h3>
              <div className="overflow-y-auto pr-2 pb-4 space-y-4">
                {items.map((item: any, idx: number) => {
                  const isActiveItem = item.status?.toLowerCase() === 'active';
                  
                  return (
                    <Card key={idx} className="border shadow-sm relative overflow-hidden">
                      <CardHeader className="pb-4 pt-4 px-5">
                        <div className="flex justify-between items-start">
                          <CardTitle className="text-base font-medium">{item.product_name || "Producto"}</CardTitle>
                          {item.status && (
                            <Badge 
                              variant={isActiveItem ? "default" : "destructive"} 
                              className={`uppercase text-[9px] ${isActiveItem ? 'bg-green-600 hover:bg-green-700 text-white border-transparent' : ''}`}
                            >
                              {item.status}
                            </Badge>
                          )}
                        </div>
                        {item.product_name !== "NUP2GO" && (
                          <CardDescription className="text-xs mt-1">
                            {item.billing_interval === "month" ? "Mensual" : item.billing_interval === "year" ? "Anual" : (item.billing_interval || "—")} · {item.unit_price ?? 0} {activeSub.currency || "€"} · Cantidad: {item.quantity ?? 1}
                          </CardDescription>
                        )}
                      </CardHeader>
                      <CardContent className="pb-4 pt-0 px-5 space-y-2">
                        {item.product_name !== "NUP2GO" ? (
                          <>
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Fin período:</span>
                              <span className="font-medium">{formatDate(item.current_period_end)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Renovaciones:</span>
                              <span className="font-medium">{item.number_of_renovations ?? 0}</span>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Balance:</span>
                              <span className="font-medium">{nup2goBalance !== undefined ? `${nup2goBalance} créditos` : "—"}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Pacientes:</span>
                              <span className="font-medium">{nup2goPatients ?? "—"}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Última tarea:</span>
                              <span className="font-medium">{formatDate(lastNup2goAssignment)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Último pago:</span>
                              <span className="font-medium">{formatDate(lastNup2goPaymentDate)}</span>
                            </div>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}