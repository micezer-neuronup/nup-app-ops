"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "../site-header";
import { ModalOpp } from "./ModalOpp";
import {
  Phone,
  Mail,
  Calendar,
  Users,
  AlertCircle,
  TrendingUp,
  CheckCircle,
  X,
  ArrowRight,
  Copy,
  ArrowUp,
} from "lucide-react";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || "";

// ---------- TIPOS ----------
export interface Detection {
  detected_at: string;
  total_tests_day: number;
}

export interface Opportunity {
  id: number;
  center_id: string;
  product: string;
  status: "pending" | "completed";
  created_at: string;
  total_tests_60d: number;
  active_days_60d: number;
  avg_daily_60d: number;
  ai_justification: string;
  score: number;
  detections: Detection[];
  trigger_details?: any;
  hubspot_company_id?: string;
  hubspot_portal_id?: string;
  hubspot_ui_domain?: string;
  center_name?: string;
  email?: string;
  phone?: string;
  segment?: string;
  market?: string;
  hubspot_task_id?: string | null;
}

// ---------- HELPERS ----------
const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
};

// ---------- COMPONENTE PRINCIPAL ----------
export function CSDashboard() {
  const [allOpportunities, setAllOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);
  const [copiedField, setCopiedField] = useState<{ id: number; field: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [taskSuccess, setTaskSuccess] = useState<{ taskUrl: string; centerName: string } | null>(null);

  // Cargar todas las oportunidades
  const fetchOpportunities = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${SERVER_URL}/api/opportunities`, {
        headers: { "ngrok-skip-browser-warning": "true" },
      });
      if (!res.ok) throw new Error(`Error ${res.status}: ${res.statusText}`);
      const data = await res.json();
      const normalized = data.map((opp: any) => ({
        ...opp,
        center_name: opp.center_name || `Centro ${opp.center_id}`,
        email: opp.email || "-",
        phone: opp.phone || "-",
        segment: opp.segment || "-",
        market: opp.market || "-",
        trigger_details: opp.trigger_details || null,
        hubspot_company_id: opp.hubspot_company_id || null,
        hubspot_portal_id: opp.hubspot_portal_id || null,
        hubspot_ui_domain: opp.hubspot_ui_domain || "app.hubspot.com",
        hubspot_task_id: opp.hubspot_task_id || null,
        avg_daily_60d: typeof opp.avg_daily_60d === "number" ? opp.avg_daily_60d : 0,
        score: typeof opp.score === "number" ? opp.score : 0,
        total_tests_60d: typeof opp.total_tests_60d === "number" ? opp.total_tests_60d : 0,
        active_days_60d: typeof opp.active_days_60d === "number" ? opp.active_days_60d : 0,
        detections: Array.isArray(opp.detections) ? opp.detections : [],
      }));
      setAllOpportunities(normalized);
    } catch (error: any) {
      console.error("Error fetching opportunities:", error);
      setError(error.message || "Error al cargar oportunidades");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOpportunities();
  }, []);

  // Búsqueda local
  const filteredOpportunities = useMemo(() => {
    if (!searchTerm.trim()) return allOpportunities;
    const term = searchTerm.toLowerCase().trim();
    return allOpportunities.filter((opp) => {
      const nameMatch = opp.center_name?.toLowerCase().includes(term);
      const idMatch = String(opp.center_id).includes(term);
      return nameMatch || idMatch;
    });
  }, [allOpportunities, searchTerm]);

  const sorted = useMemo(() => {
    return [...filteredOpportunities].sort((a, b) => (b.score || 0) - (a.score || 0));
  }, [filteredOpportunities]);

  const pending = useMemo(() => sorted.filter((o) => o.status === "pending"), [sorted]);
  const completed = useMemo(() => sorted.filter((o) => o.status === "completed"), [sorted]);

  // Actualizar estado
  const updateStatus = async (id: number, newStatus: "pending" | "completed") => {
    try {
      const res = await fetch(`${SERVER_URL}/api/commercial-opportunities/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Error ${res.status}: ${errorText}`);
      }
      const updated = await res.json();
      setAllOpportunities((prev) =>
        prev.map((opp) => (opp.id === id ? { ...opp, status: updated.status } : opp))
      );
    } catch (error: any) {
      console.error("Error updating opportunity status:", error);
      setError(error.message || "Error al actualizar el estado");
    }
  };

  const handleMarkAsReviewed = (id: number) => updateStatus(id, "completed");
  const handleMarkAsPending = (id: number) => updateStatus(id, "pending");

  const handleCopy = (id: number, field: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField({ id, field });
    setTimeout(() => setCopiedField(null), 2000);
  };

  const totalPending = pending.length;
  const totalCompleted = completed.length;

  // Crear tarea directamente
  const handleCreateTask = async (opp: Opportunity) => {
  try {
    const res = await fetch(`${SERVER_URL}/api/commercial-opportunities/${opp.id}/create-task`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: `Assessment - ${opp.center_name || `Centro ${opp.center_id}`}`,
        body: opp.ai_justification || 'Contactar para ofrecer Assessment.',
      }),
    });
    
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Error creating task');
    }
    
    const data = await res.json();
    
    // Actualizar oportunidad local (taskId y status completado)
    setAllOpportunities(prev =>
      prev.map(o =>
        o.id === opp.id 
          ? { ...o, hubspot_task_id: data.taskId, status: 'completed' } 
          : o
      )
    );
    
    // Mostrar modal de éxito con la nueva URL
    setTaskSuccess({
      taskUrl: data.taskUrl, // ✅ Nueva URL
      centerName: opp.center_name || `Centro ${opp.center_id}`,
    });
    
  } catch (error: any) {
    console.error('Error creating task:', error);
    alert(error.message || 'Error al crear la tarea');
  }
};

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Cargando oportunidades...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      {/* HEADER */}
      <div className="border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-4">
              <h1 className="text-lg font-bold">📋 Oportunidades de Upsell</h1>
              <input
                ref={inputRef}
                type="text"
                placeholder="Buscar centro (nombre o ID)..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="h-8 rounded-md border border-border/40 bg-background/50 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 w-40 md:w-64"
              />
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 bg-muted/30 rounded-lg px-3 py-1">
                <span className="text-xs text-muted-foreground">Pendientes</span>
                <span className="text-sm font-semibold text-foreground">{totalPending}</span>
              </div>
              <div className="flex items-center gap-1 bg-muted/30 rounded-lg px-3 py-1">
                <span className="text-xs text-muted-foreground">Completadas</span>
                <span className="text-sm font-semibold text-foreground">{totalCompleted}</span>
              </div>
              <SiteHeader />
            </div>
          </div>
        </div>
      </div>

      {/* CONTENIDO */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 md:px-6 py-4">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-500 p-3 rounded-lg mb-4">
            ❌ {error}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Pendientes */}
          <div className="max-h-[600px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-muted/30 scrollbar-track-transparent">
            <h2 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2 sticky top-0 bg-background/80 backdrop-blur-sm py-1 z-10">
              <span className="inline-block w-2 h-2 rounded-full bg-yellow-400" />
              Pendientes ({pending.length})
            </h2>
            <div className="space-y-2">
              {pending.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No hay oportunidades pendientes
                </p>
              ) : (
                pending.map((opp) => (
                  <OpportunityCard
                    key={opp.id}
                    opp={opp}
                    onMarkReviewed={handleMarkAsReviewed}
                    onMarkPending={handleMarkAsPending}
                    onClick={() => setSelectedOpp(opp)}
                    onCopy={handleCopy}
                    copiedField={copiedField}
                    onCreateTask={handleCreateTask}
                  />
                ))
              )}
            </div>
          </div>

          {/* Completadas */}
          <div className="max-h-[600px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-muted/30 scrollbar-track-transparent">
            <h2 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2 sticky top-0 bg-background/80 backdrop-blur-sm py-1 z-10">
              <span className="inline-block w-2 h-2 rounded-full bg-green-400" />
              Completadas ({completed.length})
            </h2>
            <div className="space-y-2">
              {completed.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No hay oportunidades completadas
                </p>
              ) : (
                completed.map((opp) => (
                  <OpportunityCard
                    key={opp.id}
                    opp={opp}
                    onMarkReviewed={handleMarkAsReviewed}
                    onMarkPending={handleMarkAsPending}
                    onClick={() => setSelectedOpp(opp)}
                    onCopy={handleCopy}
                    copiedField={copiedField}
                    onCreateTask={handleCreateTask}
                    isReviewed
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {selectedOpp && (
        <ModalOpp
          opp={selectedOpp}
          onClose={() => setSelectedOpp(null)}
          onReview={handleMarkAsReviewed}
          onUndo={handleMarkAsPending}
          onCreateTask={handleCreateTask}
        />
      )}

      {/* Modal de éxito de tarea */}
      {taskSuccess && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setTaskSuccess(null)}
        >
          <div
            className="bg-background border border-border rounded-xl shadow-2xl p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center">
              <div className="text-4xl mb-2">✅</div>
              <h3 className="text-lg font-bold mb-1">Tarea creada</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Se ha creado la tarea para {taskSuccess.centerName}.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setTaskSuccess(null)}
                >
                  Cerrar
                </Button>
                <Button
                  className="flex-1 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border-orange-500/20"
                  onClick={() => {
                    window.open(taskSuccess.taskUrl, "_blank");
                    setTaskSuccess(null);
                  }}
                >
                  Ir a tarea
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- TARJETA ----------
function OpportunityCard({
  opp,
  onMarkReviewed,
  onMarkPending,
  onClick,
  onCopy,
  copiedField,
  onCreateTask,
  isReviewed = false,
}: {
  opp: Opportunity;
  onMarkReviewed: (id: number) => void;
  onMarkPending?: (id: number) => void;
  onClick: () => void;
  onCopy: (id: number, field: string, value: string) => void;
  copiedField: { id: number; field: string } | null;
  onCreateTask: (opp: Opportunity) => void;
  isReviewed?: boolean;
}) {
  const isEmailCopied = copiedField?.id === opp.id && copiedField?.field === "email";
  const isPhoneCopied = copiedField?.id === opp.id && copiedField?.field === "phone";

  const scoreColor =
    (opp.score || 0) >= 80
      ? "text-green-500 border-green-500"
      : (opp.score || 0) >= 60
      ? "text-yellow-500 border-yellow-500"
      : "text-red-500 border-red-500";

  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - ((opp.score || 0) / 100) * circumference;

  const totalDetections = opp.detections?.length || 0;

  return (
    <Card
      className={`cursor-pointer hover:bg-muted/20 transition-colors border ${
        isReviewed ? "border-muted/30 bg-muted/10" : "border-border bg-card"
      } rounded-lg`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 relative w-14 h-14">
            <svg className="w-14 h-14 transform -rotate-90">
              <circle
                cx="28"
                cy="28"
                r={radius}
                stroke="currentColor"
                strokeWidth="3"
                fill="none"
                className="text-muted/30"
              />
              <circle
                cx="28"
                cy="28"
                r={radius}
                stroke="currentColor"
                strokeWidth="3"
                fill="none"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                className={`${scoreColor} transition-all duration-500`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-sm font-bold ${scoreColor}`}>{opp.score || 0}%</span>
            </div>
          </div>

          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-foreground truncate">
                {opp.center_name || `Centro ${opp.center_id}`}
              </p>
              <Badge variant="outline" className="text-xs font-normal text-muted-foreground border-muted-foreground/20">
                {opp.product}
              </Badge>
              <Badge
                className={`text-[10px] font-medium border ${
                  isReviewed
                    ? "bg-muted/30 text-muted-foreground border-muted"
                    : "bg-primary/10 text-primary border-primary/20"
                }`}
              >
                {isReviewed ? "Revisada" : "Pendiente"}
              </Badge>
              {!isReviewed && totalDetections > 0 && (
                <Badge className="text-[10px] font-medium border-green-500/30 bg-green-500/10 text-green-500 animate-pulse flex items-center gap-1">
                  <ArrowUp className="h-3 w-3" />
                  +{totalDetections} nuevos usos
                </Badge>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <div className="flex items-center gap-1 bg-muted/30 rounded-md px-2 py-0.5 text-sm text-foreground/80">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="truncate max-w-[120px]">{opp.email || "-"}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 rounded-full hover:bg-primary/10 text-muted-foreground hover:text-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (opp.email) onCopy(opp.id, "email", opp.email);
                  }}
                  title="Copiar email"
                >
                  {isEmailCopied ? (
                    <CheckCircle className="h-3 w-3 text-green-500" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </div>

              <div className="flex items-center gap-1 bg-muted/30 rounded-md px-2 py-0.5 text-sm text-foreground/80">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="truncate max-w-[120px]">{opp.phone || "-"}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 rounded-full hover:bg-primary/10 text-muted-foreground hover:text-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (opp.phone) onCopy(opp.id, "phone", opp.phone);
                  }}
                  title="Copiar teléfono"
                >
                  {isPhoneCopied ? (
                    <CheckCircle className="h-3 w-3 text-green-500" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1 font-medium text-foreground/80">
                <TrendingUp className="h-3.5 w-3.5" />
                <span className="text-base font-bold text-foreground">{opp.total_tests_60d}</span> tests (60d)
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {formatDate(opp.created_at)}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 ml-2 shrink-0">
            {/* Botón HubSpot */}
            <Button
              variant="ghost"
              size="sm"
              className="h-9 px-3 rounded-md text-orange-400 hover:text-orange-300 hover:bg-orange-400/10 gap-1.5 text-xs font-medium"
              onClick={(e) => {
                e.stopPropagation();
                const companyId = opp.hubspot_company_id;
                const portalId = opp.hubspot_portal_id || "143501970";
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
              title="Ver en HubSpot"
            >
              <HubSpotIcon className="h-4 w-4" />
              HubSpot
            </Button>

            {/* Botón de tarea */}
           {opp.hubspot_task_id ? (
  <Button
    variant="ghost"
    size="sm"
    className="h-9 px-3 rounded-md text-blue-400 hover:text-blue-300 hover:bg-blue-400/10 gap-1.5 text-xs font-medium"
    onClick={(e) => {
      e.stopPropagation();
      const portalId = opp.hubspot_portal_id || '148915792';
      const taskUrl = `https://app-eu1.hubspot.com/contacts/${portalId}/objects/0-27/views/all/list?taskId=${opp.hubspot_task_id}`;
      window.open(taskUrl, '_blank');
    }}
  >
    <CheckCircle className="h-4 w-4" />
    Ir a tareas
  </Button>
) : (
  <Button
    variant="ghost"
    size="sm"
    className="h-9 px-3 rounded-md text-orange-400 hover:text-orange-300 hover:bg-orange-400/10 gap-1.5 text-xs font-medium"
    onClick={(e) => {
      e.stopPropagation();
      onCreateTask(opp);
    }}
  >
    <Calendar className="h-4 w-4" />
    Crear tarea
  </Button>
)}

            {/* Botón Revisar / Deshacer */}
            {!isReviewed ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 px-3 rounded-md text-green-500 hover:text-green-400 hover:bg-green-500/10 gap-1.5 text-xs font-medium"
                onClick={(e) => {
                  e.stopPropagation();
                  onMarkReviewed(opp.id);
                }}
                title="Marcar como revisado"
              >
                <CheckCircle className="h-4 w-4" />
                Revisar
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 px-3 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 gap-1.5 text-xs font-medium"
                onClick={(e) => {
                  e.stopPropagation();
                  onMarkPending?.(opp.id);
                }}
                title="Volver a pendiente"
              >
                <X className="h-4 w-4" />
                Deshacer
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              className="h-9 px-3 rounded-md text-green-500 hover:text-green-400 hover:bg-green-500/10 gap-1.5 text-xs font-medium animate-pulse"
              onClick={(e) => {
                e.stopPropagation();
                onClick();
              }}
              title="Abrir detalles"
            >
              <ArrowRight className="h-4 w-4" />
              Detalles
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
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