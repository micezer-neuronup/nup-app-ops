"use client";

import { X, Edit } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck } from "lucide-react";

// Diccionario para traducir los IDs a nombres legibles
const featureLabels: Record<string, string> = {
  activity_all: "Uso Digital",
  test_all: "Evaluaciones",
  kids_paper: "Papel Infantil",
  adults_paper: "Papel Adultos",
};

// Formateador de fechas
function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  return date.toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" });
}

export function SubscriptionModal({ open, onOpenChange, subscriptionData }: any) {
  if (!open) return null;

  const sub = subscriptionData;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative bg-background rounded-lg shadow-lg w-full max-w-7xl h-[90vh] flex flex-col">
        {/* Header fijo */}
        <div className="sticky top-0 bg-background border-b p-4 flex items-center justify-between rounded-t-lg">
          <h2 className="text-xl font-semibold">Detalles de Suscripción</h2>
          <div className="flex items-center gap-2">
            <button
              disabled
              className="inline-flex items-center gap-1 rounded-md border border-input bg-secondary/50 px-3 py-1 text-sm font-medium opacity-50 cursor-not-allowed"
            >
              <Edit className="h-4 w-4" /> Modificar
            </button>
            <button onClick={() => onOpenChange(false)} className="p-1 rounded-full hover:bg-accent">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Contenido con dos columnas: 2/3 - 1/3 y scroll independiente */}
        <div className="flex flex-1 overflow-hidden p-6 gap-6">
          {/* Columna izquierda (2/3) - Datos generales */}
          <div className="flex-[2] flex flex-col overflow-hidden">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2 sticky top-0 bg-background pb-1">
              Datos generales
            </h3>
            <Card className="border shadow-sm">
              <CardContent className="p-4">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div className="flex justify-between items-baseline"><span className="text-muted-foreground">Arquetipo:</span> <span className="font-medium">{sub.archetype || "—"}</span></div>
                  <div className="flex justify-between items-baseline"><span className="text-muted-foreground">Paga propio:</span> <span className="font-medium">{sub.manages_own_payment ? "Sí" : "No"}</span></div>
                  <div className="flex justify-between items-baseline"><span className="text-muted-foreground">Centro:</span> <span className="font-medium">{sub.center_name || "—"}</span></div>
                  <div className="flex justify-between items-baseline"><span className="text-muted-foreground">Mercado:</span> <span className="font-medium">{sub.market || "—"}</span></div>
                  <div className="flex justify-between items-baseline"><span className="text-muted-foreground">Inicio:</span> <span className="font-medium">{formatDate(sub.start_date)}</span></div>
                  <div className="flex justify-between items-baseline"><span className="text-muted-foreground">Fin período:</span> <span className="font-medium">{formatDate(sub.current_period_end)}</span></div>
                  <div className="flex justify-between items-baseline"><span className="text-muted-foreground">Precancelación:</span> <span className="font-medium">{formatDate(sub.precancelled_date)}</span></div>
                  <div className="flex justify-between items-baseline"><span className="text-muted-foreground">Cancelación:</span> <span className="font-medium">{formatDate(sub.cancellation_date)}</span></div>
                  <div className="flex justify-between items-baseline"><span className="text-muted-foreground">Revocación acceso:</span> <span className="font-medium">{formatDate(sub.revoked_access_date)}</span></div>
                  <div className="flex justify-between items-baseline"><span className="text-muted-foreground">Estado actual:</span> <span className="font-medium capitalize">{sub.current_state}</span></div>
                  <div className="flex justify-between items-baseline"><span className="text-muted-foreground">Origen:</span> <span className="font-medium">{sub.creation_source || "—"}</span></div>
                  <div className="flex justify-between items-baseline"><span className="text-muted-foreground">Método pago:</span> <span className="font-medium">{sub.payment_method_type || "—"}</span></div>
                  <div className="flex justify-between items-baseline"><span className="text-muted-foreground">Estado última factura:</span> <span className="font-medium">{sub.last_invoice_status || "—"}</span></div>
                  <div className="flex justify-between items-baseline"><span className="text-muted-foreground">Monto última factura:</span> <span className="font-medium">{sub.last_invoice_amount != null ? `${sub.last_invoice_amount} €` : "—"}</span></div>
                  <div className="flex justify-between items-baseline"><span className="text-muted-foreground">Fecha última factura:</span> <span className="font-medium">{formatDate(sub.last_invoice_date)}</span></div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Columna derecha (1/3) - Items con scroll independiente */}
          <div className="flex-[1] flex flex-col overflow-hidden">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2 sticky top-0 bg-background pb-1">
              Items de suscripción
            </h3>
            <div className="overflow-y-auto pr-1 space-y-3 flex-1">
              {sub.subscription_items && sub.subscription_items.length > 0 ? (
                sub.subscription_items.map((item: any, idx: number) => (
                  <Card key={idx} className="border shadow-sm">
                    <CardHeader className="pb-2 pt-3 px-4">
                      <CardTitle className="text-base">{item.product_name}</CardTitle>
                      <CardDescription className="text-xs">
                        {item.billing_interval === "month" ? "Mensual" : "Anual"} · {item.unit_price} € · Cantidad: {item.quantity}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pb-3 pt-0 px-4 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Renovaciones:</span>
                        <span className="font-medium">{item.number_of_renovations ?? 0}</span>
                      </div>
                      
                      {/* Lógica NUP2GO */}
                      {item.product_name === "NUP2GO" && (
                        <>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Balance:</span>
                            <span className="font-medium">85 créditos</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Pacientes:</span>
                            <span className="font-medium">3</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Última tarea:</span>
                            <span className="font-medium">15/05/2026</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Último pago:</span>
                            <span className="font-medium">01/05/2026</span>
                          </div>
                        </>
                      )}

                      {/* FEATURES con el mismo estilo que la tarjeta principal */}
                      <div>
                        <span className="text-muted-foreground text-sm">Módulos habilitados:</span>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {item.features && item.features.length > 0 ? (
                            item.features.map((f: string, fIdx: number) => (
                              <Badge key={fIdx} variant="secondary" className="font-normal bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                                <ShieldCheck className="h-3 w-3 mr-1" />
                                {featureLabels[f] || f}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">Ningún módulo extra</span>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No hay items en esta suscripción.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}