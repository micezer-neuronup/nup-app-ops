"use client";

import { useState, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Phone,
  Mail,
  Calendar,
  Users,
  AlertCircle,
  TrendingUp,
  CheckCircle,
  X,
  Sparkles,
  Brain,
  Clock,
  ArrowUp,
} from "lucide-react";
import { Opportunity } from "./CSDashboard"; // Importamos el tipo desde el archivo principal

// ---------- TYPEWRITER ----------
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
        <span className="absolute -right-1 top-0 inline-block w-[2px] h-[1.1em] bg-foreground/70 animate-pulse" />
      )}
    </span>
  );
}

// ---------- ICONO HUBSPOT ----------
const HubSpotIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="6.20856283 .64498824 244.26943717 251.24701176"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="m191.385 85.694v-29.506a22.722 22.722 0 0 0 13.101-20.48v-.677c0-12.549-10.173-22.722-22.721-22.722h-.678c-12.549 0-22.722 10.173-22.722 22.722v.677a22.722 22.722 0 0 0 13.101 20.48v29.506a64.342 64.342 0 0 0 -30.594 13.47l-80.922-63.03c.577-2.083.878-4.225.912-6.375a25.6 25.6 0 1 0 -25.633 25.55 25.323 25.323 0 0 0 12.607-3.43l79.685 62.007c-14.65 22.131-14.258 50.974.987 72.7l-24.236 24.243c-1.96-.626-4-.959-6.057-.987-11.607.01-21.01 9.423-21.007 21.03.003 11.606 9.412 21.014 21.018 21.017 11.607.003 21.02-9.4 21.03-21.007a20.747 20.747 0 0 0 -.988-6.056l23.976-23.985c21.423 16.492 50.846 17.913 73.759 3.562 22.912-14.352 34.475-41.446 28.985-67.918-5.49-26.473-26.873-46.734-53.603-50.792m-9.938 97.044a33.17 33.17 0 1 1 0-66.316c17.85.625 32 15.272 32.01 33.134.008 17.86-14.127 32.522-31.977 33.165"
      fill="#ff7a59"
    />
  </svg>
);

// ---------- HELPERS ----------
const formatDateShort = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString("es", { day: "numeric", month: "short" });
};

// ---------- COMPONENTE MODAL ----------
interface ModalOppProps {
  opp: Opportunity;
  onClose: () => void;
  onReview?: (id: number) => void;
  onUndo?: (id: number) => void;
  onCreateTask?: (opp: Opportunity) => void; // ✅ nueva prop
}

export function ModalOpp({
  opp,
  onClose,
  onReview,
  onUndo,
  onCreateTask , // ✅ Recibir prop
}: ModalOppProps) {
  const [isTypingActive, setIsTypingActive] = useState(true);

  useEffect(() => {
    setIsTypingActive(true);
  }, [opp.id]);

  const sortedDetections = [...(opp.detections || [])].sort(
    (a, b) => new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime()
  );

  const totalDetections = opp.detections?.length || 0;
  const lastDetection = totalDetections > 0 ? sortedDetections[0] : null;

  const groupedDetections = sortedDetections.reduce((acc, det) => {
    const date = new Date(det.detected_at);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    if (!acc[monthKey]) acc[monthKey] = [];
    acc[monthKey].push(det);
    return acc;
  }, {} as Record<string, typeof sortedDetections>);

  const monthNames: Record<string, string> = {
    "01": "Enero",
    "02": "Febrero",
    "03": "Marzo",
    "04": "Abril",
    "05": "Mayo",
    "06": "Junio",
    "07": "Julio",
    "08": "Agosto",
    "09": "Septiembre",
    "10": "Octubre",
    "11": "Noviembre",
    "12": "Diciembre",
  };

  const handleAction = () => {
    if (opp.status === "pending" && onReview) {
      onReview(opp.id);
      onClose();
    } else if (opp.status === "completed" && onUndo) {
      onUndo(opp.id);
      onClose();
    }
  };

  const getTaskCreationUrl = () => {
    const portalId = opp.hubspot_portal_id || "148915792";
    const companyId = opp.hubspot_company_id || opp.center_id;
    const subject = encodeURIComponent(`Assessment - Centro ${opp.center_id}`);
    const body = encodeURIComponent(
      opp.ai_justification || "Contactar para ofrecer Assessment."
    );
    return `https://app.hubspot.com/contacts/${portalId}/task/create?taskType=TODO&subject=${subject}&body=${body}&associatedCompanyId=${companyId}`;
  };

  const testsPerActiveDay =
    opp.active_days_60d > 0
      ? (opp.total_tests_60d / opp.active_days_60d).toFixed(1)
      : "0.0";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-w-5xl w-full max-h-[95vh] overflow-y-auto bg-background border border-border rounded-xl shadow-2xl p-5 m-4"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
        >
          <span className="sr-only">Cerrar</span>
          <X className="h-5 w-5" />
        </button>

        <div className="space-y-4">
          {/* Título */}
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-bold">
              {opp.center_name || `Centro ${opp.center_id}`}
            </h2>
            <Badge
              variant="outline"
              className="text-xs font-normal border-primary/20 bg-primary/5 text-primary"
            >
              {opp.product}
            </Badge>
            <span className="text-sm text-muted-foreground">ID: {opp.center_id}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Columna izquierda (2/3) */}
            <div className="md:col-span-2 space-y-4">
              {/* Datos de contacto */}
              <div className="grid grid-cols-2 gap-2 text-sm bg-card rounded-lg p-3 border border-border shadow-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  <span>{opp.email || "-"}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-4 w-4" />
                  <span>{opp.phone || "-"}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span>{opp.segment || "-"}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <AlertCircle className="h-4 w-4" />
                  <span>{opp.market || "-"}</span>
                </div>
              </div>

              {/* Justificación IA */}
              <div className="bg-card rounded-lg p-3 border border-border shadow-sm">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Brain className="h-3.5 w-3.5 text-primary" />
                  <span>Justificación IA</span>
                </div>
                <p className="mt-1 text-sm leading-relaxed">
                  <TypewriterText
                    text={opp.ai_justification || "No hay justificación disponible."}
                    isCompleted={false}
                    isActive={isTypingActive}
                    speed={20}
                  />
                  <Sparkles className="inline-block h-3 w-3 text-primary/40 ml-1" />
                </p>
              </div>

              {/* Nuevos usos detectados */}
              <div className="bg-card rounded-lg p-3 border border-green-500/30 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-400">
                  <Clock className="h-4 w-4" />
                  <span>Nuevo uso detectado ({totalDetections} días)</span>
                  {totalDetections > 0 && lastDetection && (
                    <span className="text-xs font-normal text-muted-foreground ml-auto">
                      Último: {formatDateShort(lastDetection.detected_at)} (
                      {lastDetection.total_tests_day} tests)
                    </span>
                  )}
                </div>
                {totalDetections > 0 ? (
                  <div className="mt-2 space-y-2 max-h-32 overflow-y-auto">
                    {Object.entries(groupedDetections).map(([monthKey, dets]) => {
                      const [year, month] = monthKey.split("-");
                      const monthName = monthNames[month] || month;
                      return (
                        <div key={monthKey}>
                          <p className="text-xs font-medium text-muted-foreground">
                            {monthName} {year}
                          </p>
                          <div className="grid grid-cols-2 gap-2 mt-1">
                            {dets.map((det, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-center gap-1.5 bg-muted/50 border border-border rounded-md px-2.5 py-1.5 shadow-sm"
                              >
                                <span className="text-sm font-medium text-foreground">
                                  {formatDateShort(det.detected_at)}
                                </span>
                                <span className="text-muted-foreground">-</span>
                                <span className="text-sm font-bold text-foreground">
                                  {det.total_tests_day} tests
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    No hay actividad reciente
                  </p>
                )}
              </div>
            </div>

            {/* Columna derecha (1/3) */}
            <div className="space-y-4">
              {/* Métricas clave */}
              <div className="bg-card rounded-lg p-3 border border-border shadow-sm space-y-2">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Métricas clave
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-muted/40 rounded p-2 text-center border border-border/50">
                    <p className="text-[10px] text-muted-foreground">Score</p>
                    <p
                      className={`text-lg font-bold ${
                        opp.score >= 80
                          ? "text-green-600 dark:text-green-400"
                          : opp.score >= 60
                          ? "text-yellow-600 dark:text-yellow-400"
                          : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {opp.score}%
                    </p>
                  </div>
                  <div className="bg-muted/40 rounded p-2 text-center border border-border/50">
                    <p className="text-[10px] text-muted-foreground">Tests totales</p>
                    <p className="text-lg font-bold text-foreground">
                      {opp.total_tests_60d}
                    </p>
                  </div>
                  <div className="bg-muted/40 rounded p-2 text-center border border-border/50">
                    <p className="text-[10px] text-muted-foreground">Días activos</p>
                    <p className="text-lg font-bold text-foreground">
                      {opp.active_days_60d}
                    </p>
                  </div>
                  <div className="bg-muted/40 rounded p-2 text-center border border-border/50">
                    <p className="text-[10px] text-muted-foreground">Tests/día activo</p>
                    <p className="text-lg font-bold text-foreground">
                      {testsPerActiveDay}
                    </p>
                  </div>
                </div>
                {totalDetections > 0 && (
                  <div className="bg-green-500/10 rounded p-2 text-center border border-green-500/30">
                    <p className="text-[10px] text-muted-foreground">Nuevos usos (total)</p>
                    <p className="text-lg font-bold text-green-600 dark:text-green-400">
                      {totalDetections} días
                    </p>
                  </div>
                )}
              </div>

              {/* Botones de acción */}
             // Solo muestro la parte de los botones, el resto del modal es igual

{/* Botones de acción */}
<div className="space-y-2">
  {/* Botón Revisar / Deshacer */}
  <Button
    variant="outline"
    className={`w-full text-sm h-9 ${
      opp.status === "pending"
        ? "bg-green-500/10 hover:bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30"
        : "text-muted-foreground hover:text-red-500 hover:bg-red-500/10 border-border"
    }`}
    onClick={handleAction}
  >
    {opp.status === "pending" ? (
      <>
        <CheckCircle className="h-4 w-4 mr-2" />
        Revisar
      </>
    ) : (
      <>
        <X className="h-4 w-4 mr-2" />
        Deshacer
      </>
    )}
  </Button>

  {/* Botón de tarea (dinámico) */}
    {opp.hubspot_task_id ? (
  <Button
    className="w-full bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border-blue-500/30 text-sm h-9"
    onClick={() => {
      const portalId = opp.hubspot_portal_id || '148915792';
      const taskUrl = `https://app-eu1.hubspot.com/contacts/${portalId}/objects/0-27/views/all/list?taskId=${opp.hubspot_task_id}`;
      window.open(taskUrl, '_blank');
    }}
  >
    <CheckCircle className="h-4 w-4 mr-2" />
    Ir a tareas
  </Button>
) : (
  <Button
    className="w-full bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border-orange-500/30 text-sm h-9"
    onClick={() => onCreateTask?.(opp)}
  >
    <Calendar className="h-4 w-4 mr-2" />
    Crear tarea en HubSpot
  </Button>
)}



  {/* Botón HubSpot */}
  <Button
    className="w-full bg-orange-500/20 hover:bg-orange-500/30 text-orange-600 dark:text-orange-400 border-orange-500/30 text-sm h-9"
    onClick={() => {
      const companyId = opp.hubspot_company_id;
      const portalId = opp.hubspot_portal_id || "148915792";
      const uiDomain = "app-eu1.hubspot.com";
      if (companyId) {
        window.open(
          `https://${uiDomain}/contacts/${portalId}/record/0-2/${companyId}/`,
          "_blank"
        );
      } else {
        alert("No se encontró el ID de HubSpot para este centro.");
      }
    }}
  >
    <HubSpotIcon className="h-4 w-4 mr-2" />
    Abrir en HubSpot
  </Button>
</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}