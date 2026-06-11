// components/Dashboards/FeatureRequestsCard.tsx
"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar, MessageSquare } from "lucide-react";

const featureLabels: Record<string, string> = {
  // --- Mapeos Anteriores ---
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

  activity: "Actividades (General)",
  activity_digital: "Actividades digitales",
  activity_paper: "Actividades en papel",
  employee: "Gestión de profesionales",
  employee_excess: "Ampliación de profesionales (Límite superado)", 
  test: "Evaluaciones",
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  return date.toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" });
};

interface FeatureRequestsCardProps {
  requests?: any[];
}

export function FeatureRequestsCard({ requests = [] }: FeatureRequestsCardProps) {
  const [localRequests, setLocalRequests] = useState(requests);

  useEffect(() => {
    setLocalRequests(requests);
  }, [requests]);

  const handleCheckboxChange = async (id: number, checked: boolean) => {
    const newStatus = checked ? "completed" : "pending";
    
    // 1. Guardamos el estado previo para el rollback
    const previousRequests = [...localRequests];

    // 2. Actualización optimista de la UI
    setLocalRequests((prev) =>
      prev.map((req) => (req.id === id ? { ...req, status: newStatus } : req))
    );

    try {
      const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || "";
      
      const response = await fetch(`${SERVER_URL}/api/feature-requests/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Error del backend:", response.status, errorData);
        throw new Error(`Error ${response.status}: ${JSON.stringify(errorData)}`);
      }
    } catch (error) {
      console.error("❌ Falló la actualización en la BD. Revertiendo cambios:", error);
      // 4. Rollback si falla
      setLocalRequests(previousRequests);
    }
  };

  return (
    <Card className="group overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:bg-accent/30 flex flex-col h-[450px]">
      <CardHeader className="pb-2 shrink-0">
        <CardDescription className="flex items-center gap-1 text-xs uppercase tracking-wider">
          <MessageSquare className="h-3 w-3" /> Features solicitadas
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col overflow-hidden p-0">
        <div className="flex-1 overflow-y-auto px-6 space-y-3 pb-4 min-h-0">
          {localRequests.map((req) => {
            const readableName = featureLabels[req.feature_name] || req.feature_name;
            const isCompleted = req.status === "completed";

            return (
              <div key={req.id} className={`flex items-start justify-between gap-4 py-2 border-b last:border-0 transition-opacity ${isCompleted ? 'opacity-50' : 'opacity-100'}`}>
                <div className="flex-1">
                  <div className="flex flex-wrap items-baseline gap-1">
                    <span className={`text-sm font-medium ${isCompleted ? 'line-through text-muted-foreground' : ''}`}>
                      {readableName}
                    </span>
                    <span className="text-xs text-muted-foreground">({req.feature_name})</span>
                  </div>
                  <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    <span>{formatDate(req.requested_at)}</span>
                  </div>
                </div>
                <Checkbox
                  checked={isCompleted}
                  onCheckedChange={(checked) => handleCheckboxChange(req.id, checked === true)}
                />
              </div>
            );
          })}
          
          {localRequests.length === 0 && (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground text-center py-4">
              No hay features solicitadas
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}