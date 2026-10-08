"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Phone,
  Mail,
  Calendar,
  Users,
  AlertCircle,
  CheckCircle,
  X,
  Sparkles,
  Brain,
  Clock,
  Copy,
  Target,
  Activity,
  Hash,
  TrendingUp,
  Percent,
  BarChart3,
  CalendarClock,
} from "lucide-react";
import { TypewriterText } from "./shared/TypewriterText";
import { HubSpotIcon } from "./shared/HubSpotIcon";
import type { Opportunity } from "./types";

// ---------- HELPERS ----------
const formatDateShort = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString("es", { day: "numeric", month: "short" });
};

const formatDateLong = (dateStr?: string | null) => {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString("es", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

type TriggerPair = { label: string; value: string; icon?: any };

const buildTriggerPairs = (trigger: any): TriggerPair[] => {
  if (!trigger) return [];

  let data: Record<string, any> = trigger;
  if (typeof trigger === "string") {
    try {
      data = JSON.parse(trigger);
    } catch {
      return [{ label: "Trigger", value: trigger }];
    }
  }

  const labelMap: Record<string, { label: string; icon?: any; suffix?: string }> = {
    avg_daily: { label: "Media diaria", icon: TrendingUp },
    avg_usage: { label: "Uso medio", icon: Activity },
    p85_value: { label: "P85", icon: BarChart3 },
    percentile: { label: "Percentil", icon: Percent, suffix: "%" },
    active_days: { label: "Días activos", icon: CalendarClock },
    total_tests: { label: "Tests totales", icon: Hash },
    window_days: { label: "Ventana", icon: Clock, suffix: " días" },
    p85_threshold: { label: "Umbral P85", icon: BarChart3 },
  };

  return Object.entries(data).map(([key, value]) => {
    const meta = labelMap[key];
    const label = meta?.label || key;
    const suffix = meta?.suffix || "";
    return {
      label,
      value: `${value}${suffix}`,
      icon: meta?.icon,
    };
  });
};

// ---------- COMPONENTE MODAL ----------
interface ModalOppProps {
  opp: Opportunity;
  onClose: () => void;
  onReview?: (id: number) => void;
  onUndo?: (id: number) => void;
  onAssignUpsell?: (opp: Opportunity) => void;
}

export function ModalOpp({
  opp,
  onClose,
  onReview,
  onUndo,
  onAssignUpsell,
}: ModalOppProps) {
  const [isTypingActive, setIsTypingActive] = useState(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    setIsTypingActive(true);
  }, [opp.id]);

  const handleCopy = (key: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

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

  const testsPerActiveDay =
    opp.active_days_60d > 0
      ? (opp.total_tests_60d / opp.active_days_60d).toFixed(1)
      : "0.0";

  const triggerPairs = buildTriggerPairs(opp.trigger_details);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative max-w-6xl w-full max-h-[92vh] bg-background border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* CABECERA */}
        <div className="relative bg-background px-5 py-3 border-b border-border/60 shrink-0">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 inline-flex items-center justify-center h-8 w-8 rounded-full hover:bg-muted text-foreground/70 hover:text-foreground transition-colors"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-3 flex-wrap pr-10">
            <h2 className="text-lg font-bold text-foreground leading-tight">
              {opp.center_name || `Centro ${opp.center_id}`}
            </h2>

            <button
              type="button"
              onClick={() => handleCopy("nup_id", String(opp.center_id))}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#00a4c2]/10 hover:bg-[#00a4c2]/20 border border-[#00a4c2]/25 px-2.5 py-1 text-xs font-medium text-foreground transition-colors"
              title="Copiar nup_id"
            >
              <span className="text-[#00a4c2]">nup_id:</span>
              <span className="font-bold">{opp.center_id}</span>
              {copiedKey === "nup_id" ? (
                <CheckCircle className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-[#00a4c2]" />
              )}
            </button>

            {opp.opportunity_kind === "review" && (
              <Badge className="bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30 text-[11px]">
                ⚠️ Revisar
              </Badge>
            )}
            {(opp.opportunity_kind as string) === "test_all" && (
              <Badge className="bg-[#00a4c2]/10 text-[#00a4c2] border-[#00a4c2]/30 text-[11px]">
                🧪 Test previo
              </Badge>
            )}

            <Badge
              variant="outline"
              className="text-[11px] font-normal border-border text-foreground/70"
            >
              {opp.product || "Sin producto"}
            </Badge>

            {opp.upsell_object && (
              <Badge className="text-[11px] border-[#00a4c2]/30 bg-[#00a4c2]/10 text-[#00a4c2]">
                🎯 {opp.upsell_object}
                {opp.upsell_owner_name && ` · ${opp.upsell_owner_name}`}
              </Badge>
            )}

            <span className="text-xs text-foreground/60">
              Creada el {formatDateLong(opp.created_at)}
            </span>
          </div>
        </div>

        {/* CUERPO CON SCROLL SI HACE FALTA */}
        <div className="flex-1 min-h-0 p-4 overflow-y-auto scrollbar-thin scrollbar-thumb-[#00a4c2]/30 scrollbar-track-transparent">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* COLUMNA IZQUIERDA */}
            <div className="md:col-span-2 flex flex-col gap-3">
              {/* INFO DEL CENTRO */}
              <div className="bg-card rounded-lg p-3 border border-border/60 shadow-sm">
                <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                  <button
                    type="button"
                    onClick={() => opp.email && handleCopy("email", opp.email)}
                    className="flex items-center gap-2 text-foreground hover:bg-[#00a4c2]/10 rounded-md px-2 py-1.5 transition-colors text-left group"
                  >
                    <Mail className="h-4 w-4 text-[#00a4c2] shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-foreground/60 uppercase">Email</p>
                      <p className="text-sm font-medium truncate">{opp.email || "-"}</p>
                    </div>
                    {copiedKey === "email" ? (
                      <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 text-foreground/40 group-hover:text-[#00a4c2] shrink-0" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => opp.phone && handleCopy("phone", opp.phone)}
                    className="flex items-center gap-2 text-foreground hover:bg-[#00a4c2]/10 rounded-md px-2 py-1.5 transition-colors text-left group"
                  >
                    <Phone className="h-4 w-4 text-[#00a4c2] shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-foreground/60 uppercase">Teléfono</p>
                      <p className="text-sm font-medium truncate">{opp.phone || "-"}</p>
                    </div>
                    {copiedKey === "phone" ? (
                      <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 text-foreground/40 group-hover:text-[#00a4c2] shrink-0" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => opp.segment && handleCopy("segment", opp.segment)}
                    className="flex items-center gap-2 text-foreground hover:bg-[#00a4c2]/10 rounded-md px-2 py-1.5 transition-colors text-left group"
                  >
                    <Users className="h-4 w-4 text-[#00a4c2] shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-foreground/60 uppercase">Segmento</p>
                      <p className="text-sm font-medium truncate">{opp.segment || "-"}</p>
                    </div>
                    {copiedKey === "segment" ? (
                      <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 text-foreground/40 group-hover:text-[#00a4c2] shrink-0" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => opp.market && handleCopy("market", opp.market)}
                    className="flex items-center gap-2 text-foreground hover:bg-[#00a4c2]/10 rounded-md px-2 py-1.5 transition-colors text-left group"
                  >
                    <AlertCircle className="h-4 w-4 text-[#00a4c2] shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-foreground/60 uppercase">Mercado</p>
                      <p className="text-sm font-medium truncate">{opp.market || "-"}</p>
                    </div>
                    {copiedKey === "market" ? (
                      <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 text-foreground/40 group-hover:text-[#00a4c2] shrink-0" />
                    )}
                  </button>

                  <div className="flex items-center gap-2 px-2 py-1.5">
                    <Target className="h-4 w-4 text-[#00a4c2] shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-foreground/60 uppercase">Tipo</p>
                      <p className="text-sm font-medium capitalize truncate">
                        {opp.opportunity_kind || "-"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 px-2 py-1.5">
                    <Hash className="h-4 w-4 text-[#00a4c2] shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-foreground/60 uppercase">ID interno</p>
                      <p className="text-sm font-medium truncate">{opp.id}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 px-2 py-1.5">
                    <Activity className="h-4 w-4 text-[#00a4c2] shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-foreground/60 uppercase">Media tests/día</p>
                      <p className="text-sm font-medium">{opp.avg_daily_60d ?? "-"}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 px-2 py-1.5">
                    <Hash className="h-4 w-4 text-[#00a4c2] shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-foreground/60 uppercase">HubSpot Task</p>
                      <p className="text-sm font-medium truncate">
                        {opp.hubspot_task_id || "-"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* TRIGGER */}
              {triggerPairs.length > 0 && (
                <div className="bg-card rounded-lg p-3 border border-border/60 shadow-sm">
                  <div className="flex items-center gap-2 text-xs font-medium text-foreground/70 mb-2">
                    <AlertCircle className="h-3.5 w-3.5 text-[#00a4c2]" />
                    <span>Trigger</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {triggerPairs.map((pair, idx) => {
                      const Icon = pair.icon;
                      return (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1.5 rounded-md bg-[#00a4c2]/8 border border-[#00a4c2]/25 px-2 py-1 text-xs"
                        >
                          {Icon && <Icon className="h-3 w-3 text-[#00a4c2]" />}
                          <span className="text-foreground/70">{pair.label}:</span>
                          <span className="font-semibold text-foreground">{pair.value}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* JUSTIFICACIÓN IA — altura natural con max-h y scroll interno */}
              <div className="bg-card rounded-lg p-3 border border-border/60 shadow-sm">
                <div className="flex items-center gap-2 text-xs font-medium text-foreground/70">
                  <Brain className="h-3.5 w-3.5 text-[#00a4c2]" />
                  <span>Justificación IA</span>
                </div>
                <div className="mt-1.5 text-sm leading-relaxed text-foreground max-h-[220px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-[#00a4c2]/30 scrollbar-track-transparent">
                  <TypewriterText
                    text={opp.ai_justification || "No hay justificación disponible."}
                    isCompleted={false}
                    isActive={isTypingActive}
                    speed={20}
                  />
                  <Sparkles className="inline-block h-3 w-3 text-[#00a4c2]/50 ml-1" />
                </div>
              </div>
            </div>

            {/* COLUMNA DERECHA */}
            <div className="flex flex-col gap-3">
              {/* MÉTRICAS */}
              <div className="bg-card rounded-lg p-3 border border-border/60 shadow-sm space-y-2">
                <h3 className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                  Métricas clave
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-muted/40 rounded p-1.5 text-center border border-border/50">
                    <p className="text-[10px] text-foreground/60 uppercase">Score</p>
                    <p
                      className={`text-lg font-bold ${
                        (opp.score || 0) >= 80
                          ? "text-green-600 dark:text-green-400"
                          : (opp.score || 0) >= 60
                          ? "text-yellow-600 dark:text-yellow-400"
                          : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {opp.score || 0}%
                    </p>
                  </div>
                  <div className="bg-muted/40 rounded p-1.5 text-center border border-border/50">
                    <p className="text-[10px] text-foreground/60 uppercase">Tests</p>
                    <p className="text-lg font-bold text-foreground">
                      {opp.total_tests_60d}
                    </p>
                  </div>
                  <div className="bg-muted/40 rounded p-1.5 text-center border border-border/50">
                    <p className="text-[10px] text-foreground/60 uppercase">Días act.</p>
                    <p className="text-lg font-bold text-foreground">
                      {opp.active_days_60d}
                    </p>
                  </div>
                  <div className="bg-muted/40 rounded p-1.5 text-center border border-border/50">
                    <p className="text-[10px] text-foreground/60 uppercase">Tests/día</p>
                    <p className="text-lg font-bold text-foreground">
                      {testsPerActiveDay}
                    </p>
                  </div>
                </div>
              </div>

              {/* NUEVOS USOS — altura natural con max-h y scroll interno */}
              <div className="bg-card rounded-lg p-3 border border-green-500/40 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-400">
                  <Clock className="h-4 w-4" />
                  <span>Nuevos usos ({totalDetections})</span>
                </div>
                {totalDetections > 0 && lastDetection && (
                  <p className="text-[10px] text-foreground/60 mt-0.5">
                    Último: {formatDateShort(lastDetection.detected_at)} (
                    {lastDetection.total_tests_day} tests)
                  </p>
                )}
                {totalDetections > 0 ? (
                  <div className="mt-2 max-h-[320px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-[#00a4c2]/30 scrollbar-track-transparent space-y-3">
                    {Object.entries(groupedDetections).map(([monthKey, dets]) => {
                      const [year, month] = monthKey.split("-");
                      const monthName = monthNames[month] || month;
                      return (
                        <div key={monthKey}>
                          <p className="text-[10px] font-semibold text-foreground/70 uppercase tracking-wide mb-1.5">
                            {monthName} {year}
                          </p>
                          <div className="grid grid-cols-3 gap-1.5">
                            {dets.map((det, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between bg-muted/50 border border-border rounded-md px-2 py-1"
                              >
                                <span className="text-xs font-medium text-foreground">
                                  {formatDateShort(det.detected_at)}
                                </span>
                                <span className="text-xs font-bold text-green-600 dark:text-green-400">
                                  {det.total_tests_day}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-foreground/60 text-center py-3">
                    No hay actividad reciente
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* PIE CON BOTONES — siempre fijo */}
        <div className="border-t border-border/60 bg-background/95 px-4 py-3 flex items-center gap-2 shrink-0">
          <Button
            className="flex-1 bg-orange-500/15 hover:bg-orange-500/25 text-orange-600 dark:text-orange-400 border border-orange-500/30 text-sm h-9"
            onClick={() => {
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
          >
            <HubSpotIcon className="h-4 w-4 mr-2" />
            Abrir en HubSpot
          </Button>

          <Button
            className="flex-1 bg-orange-500/15 hover:bg-orange-500/25 text-orange-600 dark:text-orange-400 border border-orange-500/30 text-sm h-9"
            onClick={() => onAssignUpsell?.(opp)}
          >
            <Calendar className="h-4 w-4 mr-2" />
            {opp.upsell_object ? "Editar asignación" : "Asignar oportunidad"}
          </Button>

          <Button
            variant="outline"
            className={`flex-1 text-sm h-9 ${
              opp.status === "pending"
                ? "bg-green-500/10 hover:bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30"
                : "text-foreground/70 hover:text-red-500 hover:bg-red-500/10 border-border"
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
        </div>
      </div>
    </div>
  );
}