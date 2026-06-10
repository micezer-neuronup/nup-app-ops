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
import { CenterInfoCard } from "./CenterInfoCard";


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


  // Filtra y asegura que solo pasen strings limpios a la gráfica
const safeFeatures = Array.isArray(subscriptionData?.subscription_features)
  ? subscriptionData.subscription_features.filter((f): f is string => typeof f === 'string')
  : [];

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold mb-3 px-1">{name}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        
        {/* Card 1: Centro */}
        <CenterInfoCard 
          centerId={centerId}
          email={email}
          cif={cif}
          region={region}
          specialty={specialty}
          numPatients={numPatients}
          numEmployees={numEmployees}
          />
        
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
  subscriptionFeatures={safeFeatures} 
  dailyData={analytics.daily} 
      />
    </div>
  );
}