// components/Dashboards/SubscriptionCard.tsx
"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Calendar, 
  CreditCard, 
  CheckCircle2, 
  ShieldCheck, 
  AlertCircle, 
  Users, 
  Globe, 
  Package, 
  CreditCard as CreditCardIcon,
  Info,
  RotateCcw,
  Zap
} from "lucide-react";

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


  // ==========================================
  // 🐛 CHIVATO DE DEBUG (Cópialo al principio de tu componente)
  // ==========================================
  console.log("🎯 --- DATOS COMPLETOS DE LA SUSCRIPCIÓN ---");
  console.log("Objeto Padre completo:", subscriptionData);
  
  if (subscriptionData) {
    console.log("Propiedades del Padre:", Object.keys(subscriptionData));
  }

  const itemsDeDebug = subscriptionData?.subscription_items || subscriptionData?.items || [];
  console.log(`Hijos (Total: ${itemsDeDebug.length}):`, itemsDeDebug);
  
  if (itemsDeDebug.length > 0) {
    console.log("Propiedades del primer Hijo:", Object.keys(itemsDeDebug[0]));
  }
  console.log("--------------------------------------------");
  // ==========================================




  const [isFlipped, setIsFlipped] = useState(false);

  const status = subscriptionData?.current_state || "—";
  const isForever = subscriptionData?.is_forever;
  const source = subscriptionData?.source?.toLowerCase() || ""; // Extraemos el source (stripe o backend)
  const rawEndDate = subscriptionData?.current_period_end;
  const features: string[] = subscriptionData?.subscription_features || [];
  const items = subscriptionData?.subscription_items || [];

  // Asegurar NUP2GO en productos visuales
  let productItems = [...items];
  const hasNup2go = productItems.some((item: any) => item.product_name === "NUP2GO");
  if (!hasNup2go && nup2goBalance !== undefined) {
    productItems.push({
      product_name: "NUP2GO",
      billing_interval: "month",
      unit_price: 0,
      quantity: 1,
    });
  }

  // Comprobación de estado activo (añadimos 'trial' por si acaso)
  const isActive = status === "active" || status === "trialing" || status === "trial";
  const StatusIcon = isActive ? CheckCircle2 : AlertCircle;

  // ✨ LÓGICA DE FIN DE CICLO ACTUALIZADA
  let endDateDisplay = "—";
  if (isForever) {
    if (source === "backend") {
      endDateDisplay = "Renovación Manual";
    } else {
      // Fallback para "stripe" o por defecto
      endDateDisplay = "Renovación Automática"; 
    }
  } else if (rawEndDate) {
    endDateDisplay = formatDate(rawEndDate);
  }

  const currencyKey = currency?.toLowerCase();
  const currencySymbol = currencySymbols[currencyKey] || "";
  const currencyDisplay = currency && currency !== "—"
    ? `${currencySymbol} (${currency.toUpperCase()})`
    : "—";

  // Mapeo seguro de productos y precios
  const productList = productItems.map((item: any) => {
    if (item.product_name === "NUP2GO") {
      return { 
        name: "NUP2GO", 
        value: nup2goBalance !== undefined ? `${nup2goBalance} créditos` : "—" 
      };
    }

    const price = item.unit_price != null ? item.unit_price : 0;
    const interval = item.billing_interval === "month" ? "mes" : item.billing_interval === "year" ? "año" : item.billing_interval;
    const intervalDisplay = interval ? `/${interval}` : "";
    const quantityDisplay = item.quantity && item.quantity > 1 ? ` (x${item.quantity})` : "";

    return {
      name: item.product_name || "Producto Desconocido",
      value: `${price} ${currencySymbol}${intervalDisplay}${quantityDisplay}`,
    };
  });

  return (
    <div className="relative h-[450px] w-full [perspective:1000px] group">
      <div 
        className={`w-full h-full transition-all duration-500 [transform-style:preserve-3d] ${isFlipped ? '[transform:rotateY(180deg)]' : ''}`}
      >
        
        {/* ========================================== */}
        {/* 🎭 CARA FRONTAL: Datos de Suscripción      */}
        {/* ========================================== */}
        <Card className="absolute inset-0 [backface-visibility:hidden] flex flex-col overflow-hidden transition-all duration-300 hover:shadow-lg hover:bg-accent/30">
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
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={onOpenModal}>
                Gestionar
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10" 
                onClick={() => setIsFlipped(true)}
                title="Ver explicación"
              >
                <Info className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          
          <CardContent className="flex-1 overflow-y-auto px-6 space-y-4 pb-4 min-h-0 pt-2 text-sm">
            {/* Métricas fijas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <div className="space-y-2 pt-4 border-t">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Package className="h-3 w-3" /> Productos de la suscripción
                </p>
                <div className="space-y-1">
                  {productList.map((product, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <CreditCardIcon className="h-3 w-3 text-muted-foreground" />
                        <span className="font-medium">{product.name}</span>
                      </div>
                      <span className="font-semibold text-muted-foreground">{product.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Módulos (Features Generales) */}
            <div className="space-y-2 pt-4 border-t">
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
                  <span className="text-sm text-muted-foreground">Ningún módulo extra detectado.</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ========================================== */}
        {/* 📖 CARA TRASERA: Diccionario de Suscripción*/}
        {/* ========================================== */}
        <Card className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] flex flex-col overflow-hidden bg-accent/20 border-primary/20 shadow-lg">
          <CardHeader className="pb-2 border-b bg-background/50 shrink-0">
            <div className="flex justify-between items-center">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Info className="h-4 w-4 text-primary" /> Detalles de Suscripción
              </CardTitle>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10" 
                onClick={() => setIsFlipped(false)}
                title="Volver a los datos"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto px-4 pb-4 pt-4 space-y-4 text-sm">
            <div>
              <p className="font-semibold flex items-center gap-1"><Calendar className="h-3 w-3"/> Fin del ciclo</p>
              <p className="text-muted-foreground text-xs mt-1">
                La fecha exacta en la que se emitirá la próxima factura en Stripe o caducará el periodo de prueba.
              </p>
            </div>
            
            <div>
              <p className="font-semibold flex items-center gap-1"><Calendar className="h-3 w-3"/> Días suscrito</p>
              <p className="text-muted-foreground text-xs mt-1">
                Total de días históricos que el centro ha estado activo. Es un buen indicador de fidelidad (LTV).
              </p>
            </div>

            <div>
              <p className="font-semibold flex items-center gap-1"><Package className="h-3 w-3"/> Productos vs Módulos</p>
              <p className="text-muted-foreground text-xs mt-1">
                Los <span className="font-medium text-foreground">Productos</span> son los items de facturación de Stripe. Los <span className="font-medium text-foreground">Módulos</span> son simplemente lo que internamente conocemos como <strong>Features</strong> (lo que desbloquea el producto).
              </p>
            </div>

            <div className="bg-primary/10 p-2 rounded border border-primary/20 mt-2">
              <p className="text-xs text-primary font-medium flex items-center gap-1"><Zap className="h-3 w-3"/> Gestión</p>
              <p className="text-xs text-muted-foreground mt-1">
                El botón "Gestionar" se podrá usar más adelante por el respectivo responsable de la suscripción. Actualmente abre una modal en desarrollo.
              </p>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}