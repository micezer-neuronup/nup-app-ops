// components/Dashboards/GeneralDashboard.tsx
"use client";

import { useState } from "react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardContent,
} from "@/components/ui/card";
import {
  Building2,
  Mail,
  FileText,
  MapPin,
  Stethoscope,
  Users,
  Briefcase,
} from "lucide-react";

import { SubscriptionCard } from "./SubscriptionCard";
import { ProductsCard } from "./ProductsCard";
import { UsageDataCard } from "./UsageDataCard";
import { SubscriptionModal } from "./SubscriptionModal";
import { UsageChart } from "./ UsageChart";

const MetricRow = ({ icon: Icon, label, value }: any) => {
  const displayValue = value === undefined || value === null || value === "" ? "—" : value;
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0 px-2 -mx-2 rounded-md transition-colors hover:bg-secondary/50">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <span className="text-sm font-semibold">{displayValue}</span>
    </div>
  );
};

export function GeneralDashboard({ data }: { data?: any }) {
  const [subscriptionModalOpen, setSubscriptionModalOpen] = useState(false);

  // --- DATOS REALES DEL CENTRO ---
  const props = data?.properties || {};
  const name = props.commercial_name || props.name || "—";
  const centerId = props.nup_center_id || "—";
  const email = props.email || "—";
  const cif = props.cif || "—";
  const region = props.region_backend || "—";
  const specialty = props.company_specialty__por_definir_ || "—";
  const numPatients = props.num_patients || "—";
  const numEmployees = props.num_employees || "—";

  // --- DATOS REALES DE ANALYTICS ---
  const analytics = data?.analytics || { totals: {}, daily: [] };

  // --- DATOS REALES DE SUSCRIPCIÓN ---
  const sub = data?.subscription || {};
  
  // ... (tu código anterior)
  
  // 🧹 LIMPIEZA DE FEATURES GENERALES
  const rawFeatures = sub.features || [];
  const normalizedFeatures = rawFeatures
    .flatMap((f: string) => (typeof f === "string" ? f.split(",") : [])) 
    .map((f: string) => f.trim()) 
    .filter((f: string) => f.length > 0);

  // 🧹 LIMPIEZA DE FEATURES POR PRODUCTO (NUEVO)
  const cleanSubscriptionItems = (sub.items || []).map((item: any) => {
    const itemRawFeatures = item.features || [];
    const itemNormalizedFeatures = itemRawFeatures
      .flatMap((f: string) => (typeof f === "string" ? f.split(",") : []))
      .map((f: string) => f.trim())
      .filter((f: string) => f.length > 0);
      
    return {
      ...item,
      features: Array.from(new Set(itemNormalizedFeatures)) // Guardamos las features limpias en el item
    };
  });

  // Mapeamos los datos
  const subscriptionData = {
    status: sub.current_state || "—",
    current_state: sub.current_state || "—",
    is_forever: sub.is_forever || false,
    precancelled_date: sub.precancelled_date || null,
    current_period_end: sub.items?.[0]?.current_period_end || null,
    subscription_features: Array.from(new Set(normalizedFeatures)), 
    subscription_items: cleanSubscriptionItems, // <-- Pasamos los items ya limpios
    hasFeatureRequest: { active: false, featureName: "" }
  };

  const nup2goBalance = "—"; // Pendiente si tienes saldo en otra tabla

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold mb-3 px-1">{name}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        
        {/* Card 1: Centro */}
        <Card className="group overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:bg-accent/30">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1 text-xs uppercase tracking-wider">
              <Building2 className="h-3 w-3" /> Información del Centro
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            <MetricRow icon={Building2} label="ID Centro" value={centerId} />
            <MetricRow icon={Mail} label="Email" value={email} />
            <MetricRow icon={FileText} label="CIF" value={cif} />
            <MetricRow icon={MapPin} label="Región" value={region} />
            <MetricRow icon={Stethoscope} label="Especialidad" value={specialty} />
            <MetricRow icon={Users} label="Pacientes" value={numPatients} />
            <MetricRow icon={Briefcase} label="Empleados" value={numEmployees} />
          </CardContent>
        </Card>

        {/* Card 2: Suscripción */}
        <SubscriptionCard
          subscriptionData={subscriptionData}
          onOpenModal={() => setSubscriptionModalOpen(true)}
        />

        {/* Card 3: Productos */}
        <ProductsCard
          subscriptionItems={subscriptionData.subscription_items}
          nup2goBalance={nup2goBalance}
          onOpenModal={() => setSubscriptionModalOpen(true)}
        />

        {/* Card 4: Datos de uso */}
        <UsageDataCard analytics={analytics} numEmployees={numEmployees} />

      </div>

      <SubscriptionModal
        open={subscriptionModalOpen}
        onOpenChange={setSubscriptionModalOpen}
        subscriptionData={subscriptionData}
      />

      {/* Gráfica */}
      <UsageChart 
        subscriptionFeatures={subscriptionData.subscription_features} 
        dailyData={analytics.daily} 
      />
    </div>
  );
}