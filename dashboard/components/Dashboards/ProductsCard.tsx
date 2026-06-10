// components/Dashboards/ProductsCard.tsx
"use client";

import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Package, CreditCard } from "lucide-react";

const MetricRow = ({ icon: Icon, label, value, onClick }: any) => (
  <div
    onClick={onClick}
    className="flex items-center justify-between py-2 border-b last:border-0 px-2 -mx-2 rounded-md transition-colors hover:bg-secondary/50 cursor-pointer"
  >
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm font-medium">{label}</span>
    </div>
    <span className="text-sm font-semibold">{value}</span>
  </div>
);

export function ProductsCard({ subscriptionItems, nup2goBalance, onOpenModal }: any) {
  let items = subscriptionItems || [];

  // Asegurar que NUP2GO está presente
  const hasNup2go = items.some((item: any) => item.product_name === "NUP2GO");
  if (!hasNup2go) {
    // Crear un item ficticio para NUP2GO (solo para mostrar en la lista)
    items = [
      ...items,
      {
        product_name: "NUP2GO",
        billing_interval: "month",
        unit_price: 0,
        quantity: 1,
      }
    ];
  }

  return (
    <Card className="group overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:bg-accent/30">
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-1 text-xs uppercase tracking-wider">
          <Package className="h-3 w-3" /> Productos activos
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {items.map((item: any) => {
          let displayValue;
          if (item.product_name === "NUP2GO") {
            displayValue = nup2goBalance !== undefined ? `${nup2goBalance} créditos` : "—";
          } else {
            displayValue = `${item.unit_price} €/${item.billing_interval === "month" ? "mes" : "año"} ${item.quantity > 1 ? `(x${item.quantity})` : ""}`;
          }
          return (
            <MetricRow
              key={item.product_name}
              icon={CreditCard}
              label={item.product_name}
              value={displayValue}
              onClick={onOpenModal}
            />
          );
        })}
        {items.length === 0 && (
          <div className="text-sm text-muted-foreground px-2 py-2">No hay productos activos</div>
        )}
      </CardContent>
    </Card>
  );
}