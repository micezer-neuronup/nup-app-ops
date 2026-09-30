// components/Dashboards/FeatureRequestsCard.tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Calendar,
  MessageSquare,
  Info,
  RotateCcw,
  CheckSquare,
  BellRing,
  ArrowUp,
  TrendingUp,
  TrendingDown,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Brain,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ---------- HELPERS ----------
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

// ---------- TYPEWRITER CON CURSOR MEJORADO ----------
function TypewriterText({
  text,
  speed = 15,
  isCompleted = false,
  isActive = true,
}: {
  text: string;
  speed?: number;
  isCompleted?: boolean;
  isActive?: boolean;
}) {
  const [currentIndex, setCurrentIndex] = useState(isCompleted ? text.length : 0);
  const hasTyped = useRef(isCompleted);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isActive) {
      if (!isCompleted) {
        setCurrentIndex(text.length);
        hasTyped.current = true;
      }
      return;
    }

    if (isCompleted) {
      setCurrentIndex(text.length);
      hasTyped.current = true;
      return;
    }

    setCurrentIndex(0);
    hasTyped.current = false;
    let current = 0;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (current < text.length) {
        current++;
        setCurrentIndex(current);
      } else {
        hasTyped.current = true;
        if (timerRef.current) clearInterval(timerRef.current);
      }
    }, speed);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, isCompleted, text, speed]);

  const isFinished = currentIndex === text.length;

  return (
    <span className="relative">
      {text.slice(0, currentIndex)}
      {!isCompleted && !isFinished && isActive && (
        <span className="absolute -right-1 top-0 inline-block w-[2px] h-[1.1em] bg-primary/70 animate-pulse" />
      )}
    </span>
  );
}

// ---------- COMPONENTE PRINCIPAL ----------
interface FeatureRequestsCardProps {
  requests?: any[];
  upsellOpportunities?: any[];
}

export function FeatureRequestsCard({
  requests = [], // 👈 Cambio: ahora por defecto vacío
  upsellOpportunities = [], // 👈 Cambio: ahora por defecto vacío
}: FeatureRequestsCardProps) {
  const [localRequests, setLocalRequests] = useState(requests);
  const [localOpportunities, setLocalOpportunities] = useState(upsellOpportunities);
  const [isFlipped, setIsFlipped] = useState(false);
  const [currentPage, setCurrentPage] = useState<"upsells" | "features">("upsells");

  const hasUpsells = localOpportunities.length > 0;
  const hasFeatures = localRequests.length > 0;

  // Decidir página inicial
  useEffect(() => {
    if (hasUpsells && !hasFeatures) {
      setCurrentPage("upsells");
    } else if (!hasUpsells && hasFeatures) {
      setCurrentPage("features");
    } else {
      setCurrentPage("upsells");
    }
  }, [hasUpsells, hasFeatures]);

  // Sincronizar con props
  useEffect(() => setLocalRequests(requests), [requests]);
  useEffect(() => setLocalOpportunities(upsellOpportunities), [upsellOpportunities]);

  // Handlers
  const handleCheckboxChange = async (id: number, checked: boolean) => {
    const newStatus = checked ? "completed" : "pending";
    const prev = [...localRequests];
    setLocalRequests((prev) =>
      prev.map((req) => (req.id === id ? { ...req, status: newStatus } : req))
    );
    try {
      const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || "";
      const res = await fetch(`${SERVER_URL}/api/feature-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
    } catch (error) {
      console.error("❌ Falló la actualización en la BD. Revertiendo:", error);
      setLocalRequests(prev);
    }
  };

  const handleOpportunityCheckboxChange = async (index: number, checked: boolean) => {
    const newStatus = checked ? "completed" : "pending";
    const prev = [...localOpportunities];
    setLocalOpportunities((prev) =>
      prev.map((opp, idx) => (idx === index ? { ...opp, status: newStatus } : opp))
    );
    try {
      const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || "";
      const opp = localOpportunities[index];
      const res = await fetch(`${SERVER_URL}/api/commercial-opportunities/${opp.id || index}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
    } catch (error) {
      console.error("❌ Falló la actualización de la oportunidad. Revertiendo:", error);
      setLocalOpportunities(prev);
    }
  };

  const goToPage = (page: "upsells" | "features") => {
    setCurrentPage(page);
  };

  // ---------- RENDER ----------
  return (
    <div className="relative h-[500px] w-full [perspective:1000px] group">
      <div
        className={`w-full h-full transition-all duration-700 [transform-style:preserve-3d] ${
          isFlipped ? "[transform:rotateY(180deg)]" : ""
        }`}
      >
        {/* ===== CARA FRONTAL ===== */}
        <Card className="absolute inset-0 [backface-visibility:hidden] flex flex-col overflow-hidden transition-all duration-300 hover:shadow-xl hover:border-primary/20">
          <CardHeader className="pb-2 shrink-0">
            <div className="flex justify-between items-center">
              <CardDescription className="flex items-center gap-2 text-xs uppercase tracking-wider font-medium text-muted-foreground">
                <MessageSquare className="h-4 w-4 text-primary" />
                {currentPage === "upsells" ? "Oportunidades de venta" : "Solicitudes de features"}
                <span className="ml-1 text-xs font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  {currentPage === "upsells" ? localOpportunities.length : localRequests.length}
                </span>
              </CardDescription>

              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10"
                  onClick={() => goToPage(currentPage === "upsells" ? "features" : "upsells")}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10"
                  onClick={() => goToPage(currentPage === "upsells" ? "features" : "upsells")}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                  onClick={() => setIsFlipped(true)}
                  title="Ver explicación"
                >
                  <Info className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="flex-1 flex flex-col overflow-y-auto px-5 pb-2 pt-3 text-sm min-h-0 relative scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700">
            <div className="flex-1">
              {currentPage === "upsells" && (
                <div className="space-y-4">
                  {localOpportunities.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-muted-foreground text-center py-8">
                      <div className="space-y-1">
                        <TrendingUp className="h-8 w-8 mx-auto text-muted-foreground/30" />
                        <p>No hay oportunidades de venta en este momento</p>
                      </div>
                    </div>
                  ) : (
                    localOpportunities.map((opp, idx) => {
                      const isCompleted = opp.status === "completed";
                      const isActive = opp.status === "pending";
                      const isUpsell = opp.type?.toLowerCase() === "upsell";

                      return (
                        <div
                          key={opp.id || idx}
                          className={`relative transition-all duration-300 ${
                            isCompleted ? "opacity-50" : "opacity-100"
                          } ${idx > 0 ? "pt-4 border-t border-gray-200/60 dark:border-gray-800/60" : ""}`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="pt-1 shrink-0">
                              {isActive ? (
                                <div className="relative">
                                  <ArrowUp
                                    className={`h-5 w-5 ${
                                      isUpsell ? "text-emerald-500" : "text-blue-500"
                                    }`}
                                    style={{ animation: "pulse 0.8s cubic-bezier(0.4, 0, 0.6, 1) infinite" }}
                                  />
                                  <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                                </div>
                              ) : (
                                <CheckSquare className="h-5 w-5 text-green-600 dark:text-green-400" />
                              )}
                            </div>

                            <div className="flex-1 space-y-2 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                                    isUpsell
                                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                      : "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300"
                                  }`}
                                >
                                  {isUpsell ? (
                                    <TrendingUp className="h-3 w-3" />
                                  ) : (
                                    <TrendingDown className="h-3 w-3" />
                                  )}
                                  {opp.type || "oportunidad"}
                                </span>
                                <span className="text-sm font-bold text-gray-800 dark:text-gray-200">
                                  {opp.product}
                                </span>
                              </div>

                              {opp.ai_justification && (
                                <div className="relative bg-gradient-to-r from-primary/5 to-transparent pl-3 pr-2 py-1.5 rounded-md border-l-2 border-primary/40 shadow-sm">
                                  <div className="absolute top-1 right-1 flex items-center gap-1 text-[9px] font-medium text-primary/60 bg-primary/5 px-1.5 py-0.5 rounded-full border border-primary/10">
                                    <Brain className="h-3 w-3" />
                                    IA
                                  </div>
                                  <p className="text-sm text-gray-900 dark:text-gray-100 font-medium leading-relaxed pr-12">
                                    <TypewriterText
                                      text={opp.ai_justification}
                                      isCompleted={isCompleted}
                                      isActive={currentPage === "upsells"}
                                    />
                                  </p>
                                  <Sparkles className="absolute bottom-1 right-1 h-3 w-3 text-primary/20" />
                                </div>
                              )}
                            </div>

                            <div className="flex flex-col items-end gap-1 shrink-0 pt-1">
                              <Checkbox
                                className="border-2 border-amber-500/60 dark:border-amber-400/60 data-[state=checked]:border-amber-600 data-[state=checked]:bg-amber-600 h-5 w-5 transition-colors"
                                checked={isCompleted}
                                onCheckedChange={(checked) =>
                                  handleOpportunityCheckboxChange(idx, checked === true)
                                }
                              />
                              <span className="text-[10px] font-medium text-muted-foreground">
                                {isCompleted ? "Completada" : "Pendiente"}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {currentPage === "features" && (
                <div className="space-y-2">
                  {localRequests.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-muted-foreground text-center py-8">
                      <div className="space-y-1">
                        <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground/30" />
                        <p>No hay solicitudes de features pendientes</p>
                      </div>
                    </div>
                  ) : (
                    localRequests.map((req) => {
                      const readableName = featureLabels[req.feature_name] || req.feature_name;
                      const isCompleted = req.status === "completed";

                      return (
                        <div
                          key={req.id}
                          className={`flex items-center justify-between gap-3 py-2 px-1 rounded-md transition-colors hover:bg-gray-50/70 dark:hover:bg-gray-800/30 ${
                            isCompleted ? "opacity-60" : ""
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2">
                              <span
                                className={`text-sm font-medium truncate ${
                                  isCompleted
                                    ? "line-through text-muted-foreground"
                                    : "text-gray-800 dark:text-gray-200"
                                }`}
                              >
                                {readableName}
                              </span>
                              <span className="text-xs text-muted-foreground font-mono bg-muted/50 px-1.5 py-0.5 rounded">
                                {req.feature_name}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              <span>{formatDate(req.requested_at)}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Checkbox
                              className="border-2 border-gray-400 dark:border-gray-600 h-5 w-5 transition-colors"
                              checked={isCompleted}
                              onCheckedChange={(checked) =>
                                handleCheckboxChange(req.id, checked === true)
                              }
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </CardContent>

          <div className="flex items-center justify-center gap-4 p-2 border-t border-gray-100 dark:border-gray-800 text-xs font-medium shrink-0">
            <span
              className={`flex items-center gap-1 cursor-pointer hover:text-primary transition-colors ${
                currentPage === "upsells" ? "text-primary font-bold" : "text-muted-foreground"
              }`}
              onClick={() => goToPage("upsells")}
            >
              <span className="inline-block w-2 h-2 rounded-full bg-current" />
              Oportunidades: {localOpportunities.length}
            </span>
            <span className="text-muted-foreground/30">|</span>
            <span
              className={`flex items-center gap-1 cursor-pointer hover:text-primary transition-colors ${
                currentPage === "features" ? "text-primary font-bold" : "text-muted-foreground"
              }`}
              onClick={() => goToPage("features")}
            >
              <span className="inline-block w-2 h-2 rounded-full bg-current" />
              Solicitudes: {localRequests.length}
            </span>
          </div>
        </Card>

        {/* ===== CARA TRASERA (Info) ===== */}
        <Card className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] flex flex-col overflow-hidden bg-accent/20 border-primary/20 shadow-xl">
          <CardHeader className="pb-2 border-b bg-background/60 backdrop-blur-sm">
            <div className="flex justify-between items-center">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-primary">
                <Info className="h-4 w-4" /> Información de Features
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
          <CardContent className="flex-1 overflow-y-auto px-5 pb-5 pt-4 space-y-5 text-sm">
            <div className="bg-white/60 dark:bg-gray-900/50 rounded-lg p-4 shadow-sm border border-gray-100 dark:border-gray-800">
              <p className="font-semibold flex items-center gap-2 text-gray-800 dark:text-gray-200">
                <MessageSquare className="h-4 w-4 text-primary" /> ¿Qué es esto?
              </p>
              <p className="text-muted-foreground text-xs mt-1 leading-relaxed">
                Registra las <strong>alertas inteligentes de venta</strong> generadas por IA y las
                solicitudes de módulos bloqueados. Ayuda a identificar oportunidades de
                <span className="text-emerald-600 font-medium"> upsell </span> y
                <span className="text-blue-600 font-medium"> crossell</span>.
              </p>
            </div>

            <div className="bg-white/60 dark:bg-gray-900/50 rounded-lg p-4 shadow-sm border border-gray-100 dark:border-gray-800">
              <p className="font-semibold flex items-center gap-2 text-gray-800 dark:text-gray-200">
                <CheckSquare className="h-4 w-4 text-primary" /> ¿Para qué sirve el checkbox?
              </p>
              <p className="text-muted-foreground text-xs mt-1 leading-relaxed">
                Al marcar una petición u oportunidad, se guarda en base de datos como
                <span className="font-medium text-green-600"> “Completada”</span>. Sirve para hacer
                seguimiento de las gestiones ya tratadas por el equipo de Customer Success.
              </p>
            </div>

            <div className="bg-white/60 dark:bg-gray-900/50 rounded-lg p-4 shadow-sm border border-gray-100 dark:border-gray-800">
              <p className="font-semibold flex items-center gap-2 text-gray-800 dark:text-gray-200">
                <Sparkles className="h-4 w-4 text-primary" /> Generación con IA
              </p>
              <p className="text-muted-foreground text-xs mt-1 leading-relaxed">
                Los textos explicativos son generados por un modelo de lenguaje analizando el uso
                real del centro. La justificación se muestra con un efecto <strong>typewriter</strong>{" "}
                y un badge identificativo.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}