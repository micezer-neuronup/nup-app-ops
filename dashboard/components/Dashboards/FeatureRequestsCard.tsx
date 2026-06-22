// components/Dashboards/FeatureRequestsCard.tsx
"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar, MessageSquare, Info, RotateCcw, CheckSquare, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";

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

  // --- Nuevos Mapeos ---
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
  const [isFlipped, setIsFlipped] = useState(false); // ✨ Estado para el giro 3D

  useEffect(() => {
    setLocalRequests(requests);
  }, [requests]);

  const handleCheckboxChange = async (id: number, checked: boolean) => {
    const newStatus = checked ? "completed" : "pending";
    const previousRequests = [...localRequests];

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
      setLocalRequests(previousRequests);
    }
  };

  return (
    // 1. Contenedor principal con perspectiva 3D
    <div className="relative h-[500px] w-full [perspective:1000px] group">
      
      <div 
        className={`w-full h-full transition-all duration-500 [transform-style:preserve-3d] ${isFlipped ? '[transform:rotateY(180deg)]' : ''}`}
      >

        {/* ========================================== */}
        {/* 🎭 CARA FRONTAL: Features Solicitadas      */}
        {/* ========================================== */}
        <Card className="absolute inset-0 [backface-visibility:hidden] flex flex-col overflow-hidden transition-all duration-300 hover:shadow-lg hover:bg-accent/30">
          <CardHeader className="pb-2 shrink-0">
            <div className="flex justify-between items-center">
              <CardDescription className="flex items-center gap-1 text-xs uppercase tracking-wider">
                <MessageSquare className="h-3 w-3" /> Features solicitadas
              </CardDescription>
              {/* Botón Info */}
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10" 
                onClick={() => setIsFlipped(true)}
                title="Ver explicación"
              >
                <Info className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto px-4 pb-4 pt-1 space-y-4 text-sm">            <div className="flex-1 overflow-y-auto px-6 space-y-3 pb-4 min-h-0">
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

        {/* ========================================== */}
        {/* 📖 CARA TRASERA: Explicación y Ayuda       */}
        {/* ========================================== */}
        <Card className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] flex flex-col overflow-hidden bg-accent/20 border-primary/20 shadow-lg">
          <CardHeader className="pb-2 border-b bg-background/50">
            <div className="flex justify-between items-center">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Info className="h-4 w-4 text-primary" /> Información de Features
              </CardTitle>
              {/* Botón para volver */}
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
          <CardContent className="flex-1 overflow-y-auto px-4 pb-4 pt-2 space-y-4 text-sm">
            <div>
              <p className="font-semibold flex items-center gap-1"><MessageSquare className="h-3 w-3"/> ¿Qué es esto?</p>
              <p className="text-muted-foreground text-xs mt-1">
                Registra las veces que un usuario del centro ha intentado acceder a un módulo bloqueado en la aplicación, mostrando interés en adquirirlo.
              </p>
            </div>
            
            <div>
              <p className="font-semibold flex items-center gap-1"><CheckSquare className="h-3 w-3"/> ¿Para qué sirve el checkbox?</p>
              <p className="text-muted-foreground text-xs mt-1">
                Al marcar una petición, se guarda en base de datos como "Completada". Sirve para que Customer Success pueda hacer seguimiento de las features que ya han sido gestionadas, habilitadas o descartadas.
              </p>
            </div>

            <div className="bg-primary/10 p-2 rounded border border-primary/20 mt-2">
              <p className="text-xs text-primary font-medium flex items-center gap-1"><BellRing className="h-3 w-3"/> Oportunidad de Upsell</p>
              <p className="text-xs text-muted-foreground mt-1">
                Atención especial al evento <span className="font-semibold text-primary">"Ampliación de profesionales"</span>. Significa que el centro ha llegado a su límite de terapeutas e intentó añadir a uno más sin éxito.
              </p>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}