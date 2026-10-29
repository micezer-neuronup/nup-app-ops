"use client";

import { useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Phone,
  Mail,
  Calendar,
  Users,
  Globe,
  CheckCircle,
  X,
  Copy,
  Target,
  AlertTriangle,
  FlaskConical,
  Package,
  ChevronRight,
  Undo2,
  Sparkles,
  Gauge,
} from "lucide-react";
import { HubSpotIcon } from "./shared/HubSpotIcon";
import { PriorityBadge, getTrack, checkReasons, REASON_META } from "./shared/PriorityBadge";
import { Tag } from "./shared/Tag";
import { UsageChart } from "./shared/UsageChart";
import { trendOf, TrendCell } from "./OpportunityList";
import { OPP_MODULES } from "./modules";
import type { Opportunity } from "./types";

// Logo del módulo Assessment para la etiqueta de producto
const ASSESSMENT_IMAGE = OPP_MODULES.find((m) => m.key === "assessment")?.image;

// ---------- HELPERS ----------
const formatDateShort = (dateStr?: string | null) => {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
};

const parseTrigger = (trigger: any): Record<string, any> | null => {
  if (!trigger) return null;
  if (typeof trigger === "string") {
    try {
      return JSON.parse(trigger);
    } catch {
      return null;
    }
  }
  return trigger;
};

const num = (v: any): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

// Partes del score (scoring.py): peso y explicación de cada una
const SCORE_PARTS = [
  {
    key: "score_volume",
    label: "Volumen",
    weight: 50,
    hint: "Percentil de tests en 60 días frente al resto de centros sin test_all",
  },
  {
    key: "score_consistency",
    label: "Constancia",
    weight: 30,
    hint: "Días con tests sobre los 60 días de la ventana",
  },
  {
    key: "score_trend",
    label: "Tendencia",
    weight: 20,
    hint: "Últimos 30 días frente a los 30 anteriores (50 = estable, 100 = el doble o más)",
  },
] as const;

// Umbrales del detector: iguales para todos los centros, por eso van plegados en "Detalles técnicos"
const THRESHOLD_LABELS: Record<string, { label: string; format?: (v: any) => string }> = {
  window_days: { label: "Ventana", format: (v) => `${v} días` },
  min_tests: { label: "Mínimo de tests" },
  min_active_days: { label: "Mínimo de días activos" },
  high_percentile: {
    label: "Prioridad alta desde el percentil",
    format: (v) => (typeof v === "number" && v <= 1 ? `${Math.round(v * 100)}` : `${v}`),
  },
  cooldown_days: { label: "Enfriamiento tras revisar", format: (v) => `${v} días` },
};

// Claves ya mostradas en el bloque principal (no se repiten en Detalles técnicos)
const SHOWN_KEYS = new Set([
  "priority",
  "track_reason",
  "total_tests",
  "active_days",
  "avg_daily",
  "tests_recent",
  "tests_previous",
  "percentile",
  "score_volume",
  "score_consistency",
  "score_trend",
]);

// ---------- PIEZAS ----------
const sectionTitle = "text-xs font-semibold uppercase tracking-wider text-foreground/60";

function Section({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`bg-card rounded-lg p-4 border border-border/60 shadow-sm ${className}`}>
      <h3 className={`${sectionTitle} mb-3`}>{title}</h3>
      {children}
    </section>
  );
}

function Kpi({
  label,
  value,
  sub,
  title,
  popover,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  title?: string;
  // Contenido que aparece al pasar el ratón (o al enfocar con teclado)
  popover?: ReactNode;
}) {
  return (
    <div
      className={`group/kpi relative rounded-md border border-border/60 bg-muted/30 px-3 py-2.5 min-w-0 ${
        popover ? "cursor-help hover:border-[#00a4c2]/60 focus:border-[#00a4c2]/60 outline-none transition-colors" : ""
      }`}
      title={popover ? undefined : title}
      tabIndex={popover ? 0 : undefined}
    >
      <p className="text-xs text-foreground/60">{label}</p>
      <p className="text-2xl font-bold tabular-nums text-foreground leading-tight mt-0.5">{value}</p>
      {sub && <p className="text-xs text-foreground/60 mt-0.5">{sub}</p>}
      {popover && (
        <div
          role="tooltip"
          className="invisible opacity-0 group-hover/kpi:visible group-hover/kpi:opacity-100 group-focus/kpi:visible group-focus/kpi:opacity-100 transition-opacity absolute left-0 top-full mt-2 z-20 w-72 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg"
        >
          {popover}
        </div>
      )}
    </div>
  );
}

// Desglose del score (volumen, constancia, tendencia) para el popover del KPI
function ScoreBreakdown({ parts }: { parts: { key: string; label: string; weight: number; hint: string; value: number | null }[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-xs font-semibold text-foreground/70">Cómo se calcula el score</p>
      <ul className="flex flex-col gap-2.5">
        {parts.map((p) => {
          const value = Math.max(0, Math.min(100, p.value as number));
          const points = Math.round((value * p.weight) / 100);
          return (
            <li key={p.key} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-foreground">
                  {p.label} <span className="text-foreground/50 text-xs">{p.weight}%</span>
                </span>
                <span className="tabular-nums text-foreground/60">
                  <span className="font-semibold text-foreground">{points}</span> / {p.weight} pts
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden" aria-hidden>
                <div className="h-full rounded-full bg-[#00a4c2]" style={{ width: `${value}%` }} />
              </div>
              <p className="text-xs text-foreground/60">{p.hint}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CopyField({
  icon: Icon,
  label,
  value,
  copied,
  onCopy,
}: {
  icon: any;
  label: string;
  value?: string | null;
  copied?: boolean;
  onCopy?: () => void;
}) {
  const empty = !value || value === "-";
  const content = (
    <>
      <Icon className="h-4 w-4 text-foreground/50 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-foreground/60">{label}</p>
        <p className="text-sm font-medium text-foreground truncate">{empty ? "—" : value}</p>
      </div>
    </>
  );

  if (!onCopy || empty) {
    return <div className="flex items-center gap-2.5 px-2 py-1.5 min-w-0">{content}</div>;
  }
  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={`Copiar ${label.toLowerCase()}: ${value}`}
      className="group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left min-w-0 hover:bg-muted transition-colors"
    >
      {content}
      {copied ? (
        <CheckCircle className="h-4 w-4 text-green-500 shrink-0" aria-hidden />
      ) : (
        <Copy className="h-4 w-4 text-foreground/40 group-hover:text-[#00a4c2] shrink-0" aria-hidden />
      )}
    </button>
  );
}

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
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = `opp-modal-title-${opp.id}`;

  // onClose suele llegar como función nueva en cada render: se guarda en un ref para no re-ejecutar el efecto
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Foco al diálogo al abrir, Escape cierra y el foco vuelve a donde estaba al cerrar
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      // Solo si el foco está dentro (con el modal de asignar abierto encima, Escape cierra solo ese)
      if (e.key === "Escape" && dialogRef.current?.contains(document.activeElement)) onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, []);

  const handleCopy = (key: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
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

  const openHubSpot = () => {
    const companyId = opp.hubspot_company_id;
    const portalId = opp.hubspot_portal_id || "143501970";
    const uiDomain = "app-eu1.hubspot.com";
    if (companyId) {
      window.open(`https://${uiDomain}/contacts/${portalId}/record/0-2/${companyId}/`, "_blank");
    } else {
      alert("No se encontró el ID de HubSpot para este centro.");
    }
  };

  const td = parseTrigger(opp.trigger_details);
  const trackReason = getTrack(opp.trigger_details).reason;
  const trend = trendOf(opp);

  const percentile = num(td?.percentile);
  const topPct = percentile !== null ? Math.max(1, Math.ceil(100 - percentile)) : null;
  const windowDays = num(td?.window_days) ?? 60;
  const testsPerActiveDay =
    opp.active_days_60d > 0 ? (opp.total_tests_60d / opp.active_days_60d).toFixed(1) : "0.0";
  const recent = num(td?.tests_recent);
  const previous = num(td?.tests_previous);

  const parts = SCORE_PARTS.map((p) => ({ ...p, value: num(td?.[p.key]) }));
  const hasParts = parts.every((p) => p.value !== null);

  // Umbrales conocidos + cualquier clave desconocida, para no perder nada
  const technical = td
    ? Object.entries(td)
        .filter(([key]) => !SHOWN_KEYS.has(key))
        .map(([key, value]) => {
          const meta = THRESHOLD_LABELS[key];
          return { key, label: meta?.label || key, value: meta?.format ? meta.format(value) : String(value) };
        })
    : [];

  const pending = opp.status === "pending";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative max-w-5xl w-full max-h-[92vh] bg-background border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* CABECERA */}
        <div className="relative bg-background px-5 py-3.5 border-b border-border/60 shrink-0">
          <button
            onClick={onClose}
            className="absolute top-3.5 right-3.5 inline-flex items-center justify-center h-9 w-9 rounded-full hover:bg-muted text-foreground/70 hover:text-foreground transition-colors"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>

          <div className="flex items-center gap-3 flex-wrap pr-12">
            <h2 id={titleId} className="text-xl font-semibold text-foreground leading-tight">
              {opp.center_name || `Centro ${opp.center_id}`}
            </h2>
            <button
              type="button"
              onClick={() => handleCopy("nup_id", String(opp.center_id))}
              aria-label={`Copiar nup_id ${opp.center_id}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 hover:border-[#00a4c2]/60 px-2.5 h-8 text-sm tabular-nums text-foreground transition-colors"
            >
              <span className="text-foreground/60">nup_id</span>
              <span className="font-semibold">{opp.center_id}</span>
              {copiedKey === "nup_id" ? (
                <CheckCircle className="h-4 w-4 text-green-500" aria-hidden />
              ) : (
                <Copy className="h-4 w-4 text-foreground/50" aria-hidden />
              )}
            </button>
            <PriorityBadge trigger={opp.trigger_details} />
            {checkReasons(opp).map((reason) => (
              <Tag
                key={reason}
                tone="orange"
                icon={REASON_META[reason].icon}
                label={REASON_META[reason].label}
                title={REASON_META[reason].description}
              />
            ))}
            {opp.opportunity_kind === "expansion" && (
              <Tag
                tone="cyan"
                icon={Gauge}
                label="Uso alto con Assessment"
                title="Ya tiene test_all y está en el top de uso: contactar para conocer sus necesidades"
              />
            )}
            {(opp.opportunity_kind as string) === "test_all" && (
              <Tag tone="cyan" icon={FlaskConical} label="Test previo" />
            )}
            <Tag
              tone="neutral"
              icon={Package}
              image={opp.product?.toLowerCase().includes("assess") ? ASSESSMENT_IMAGE : undefined}
              label={opp.product || "Sin producto"}
            />
            {opp.upsell_object && (
              <Tag
                tone="cyan"
                icon={Target}
                label={`Asignada · ${opp.upsell_object}${opp.upsell_owner_name ? ` · ${opp.upsell_owner_name}` : ""}`}
              />
            )}
            <span className="text-sm text-foreground/60">Detectada el {formatDateShort(opp.created_at)}</span>
          </div>
        </div>

        {/* CUERPO CON SCROLL SI HACE FALTA */}
        <div className="flex-1 min-h-0 p-4 overflow-y-auto scrollbar-thin scrollbar-thumb-[#00a4c2]/30 scrollbar-track-transparent">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* COLUMNA IZQUIERDA */}
            <div className="md:col-span-7 flex flex-col gap-4 min-w-0">
              {/* POR QUÉ ESTÁ AQUÍ */}
              <Section title="¿Por qué está aquí?">
                {trackReason && <p className="text-base font-medium text-foreground mb-3">{trackReason}</p>}

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  <Kpi
                    label="Score"
                    value={opp.score ?? 0}
                    sub={topPct !== null ? `Top ${topPct}%` : undefined}
                    title="Puntuación de 0 a 100"
                    popover={hasParts ? <ScoreBreakdown parts={parts} /> : undefined}
                  />
                  <Kpi label={`Tests ${windowDays}d`} value={opp.total_tests_60d} sub={`${testsPerActiveDay} por día activo`} />
                  <Kpi
                    label="Días activos"
                    value={
                      <>
                        {opp.active_days_60d}
                        <span className="text-base font-medium text-foreground/50"> / {windowDays}</span>
                      </>
                    }
                    sub="con algún test"
                  />
                  <Kpi
                    label="Tendencia"
                    value={
                      <span className="text-lg">
                        <TrendCell trend={trend} />
                      </span>
                    }
                    sub={recent !== null && previous !== null ? `${recent} vs ${previous} tests` : undefined}
                    title="Tests de los últimos 30 días frente a los 30 anteriores"
                  />
                </div>

                {/* Detalles técnicos: umbrales del detector, plegados en una fila compacta */}
                {technical.length > 0 && (
                  <details className="group mt-3">
                    <summary className="inline-flex items-center gap-1.5 cursor-pointer list-none rounded-md px-1.5 py-0.5 -ml-1.5 text-xs text-foreground/60 hover:text-foreground hover:bg-muted/60 transition-colors [&::-webkit-details-marker]:hidden">
                      <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" aria-hidden />
                      Detalles técnicos
                    </summary>
                    <dl
                      className="mt-2 flex flex-wrap items-center gap-1.5 text-xs"
                      title="Umbrales del detector, iguales para todos los centros"
                    >
                      {technical.map((t) => (
                        <div key={t.key} className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-2 py-1">
                          <dt className="text-foreground/60">{t.label}</dt>
                          <dd className="tabular-nums font-semibold text-foreground">{t.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                )}
              </Section>

              {/* ACTIVIDAD — crece para que su borde inferior coincida con el de Contacto */}
              <Section title={`Actividad · últimos ${windowDays} días`} className="flex-1 flex flex-col">
                <div className="flex-1 min-h-0 flex flex-col">
                  <UsageChart opportunityId={opp.id} detectedAt={opp.created_at} />
                </div>
              </Section>
            </div>

            {/* COLUMNA DERECHA */}
            <div className="md:col-span-5 flex flex-col gap-4 min-w-0">
              {/* SUGERENCIA DE ENFOQUE (IA) — solo si el job semanal la ha generado */}
              {opp.ai_brief?.summary && (
                <section className="bg-card rounded-lg p-4 border border-border/60 shadow-sm">
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <h3 className={sectionTitle}>Sugerencia de enfoque</h3>
                    <Tag tone="cyan" icon={Sparkles} label="IA" title="Generada automáticamente con los datos de uso del centro" />
                  </div>
                  <p className="text-sm text-foreground leading-relaxed">{opp.ai_brief.summary}</p>
                  {opp.ai_brief.points?.length > 0 && (
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {opp.ai_brief.points.map((point, i) => (
                        <li key={i} className="flex gap-2 text-sm text-foreground leading-relaxed">
                          <span className="text-[#00a4c2] shrink-0" aria-hidden>
                            •
                          </span>
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {opp.ai_brief_at && (
                    <p className="mt-2.5 text-xs text-foreground/50">Generada el {formatDateShort(opp.ai_brief_at)}</p>
                  )}
                </section>
              )}

              <Section title="Contacto" className="flex-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 xl:grid-cols-2 gap-1">
                  <CopyField
                    icon={Mail}
                    label="Email"
                    value={opp.email}
                    copied={copiedKey === "email"}
                    onCopy={() => opp.email && handleCopy("email", opp.email)}
                  />
                  <CopyField
                    icon={Phone}
                    label="Teléfono"
                    value={opp.phone}
                    copied={copiedKey === "phone"}
                    onCopy={() => opp.phone && handleCopy("phone", opp.phone)}
                  />
                  <CopyField icon={Users} label="Segmento" value={opp.segment} />
                  <CopyField icon={Globe} label="Mercado" value={opp.market} />
                </div>
              </Section>

            </div>
          </div>
        </div>

        {/* PIE CON BOTONES — siempre fijo */}
        <div className="border-t border-border/60 bg-background/95 px-4 py-3 flex flex-wrap items-center gap-2 shrink-0">
          <Button variant="outline" className="h-10 text-sm" onClick={openHubSpot}>
            <HubSpotIcon className="h-4 w-4 mr-2 text-orange-400" />
            Abrir en HubSpot
          </Button>

          <Button variant="outline" className="h-10 text-sm" onClick={() => onAssignUpsell?.(opp)}>
            <Calendar className="h-4 w-4 mr-2" aria-hidden />
            {opp.upsell_object ? "Editar asignación" : "Asignar oportunidad"}
          </Button>

          <div className="flex-1" />

          {pending ? (
            <Button className="h-10 text-sm bg-green-600 hover:bg-green-700 text-white" onClick={handleAction}>
              <CheckCircle className="h-4 w-4 mr-2" aria-hidden />
              Marcar como revisada
            </Button>
          ) : opp.status === "completed" ? (
            <Button
              variant="outline"
              className="h-10 text-sm hover:text-red-500 hover:border-red-500/40"
              onClick={handleAction}
            >
              <Undo2 className="h-4 w-4 mr-2" aria-hidden />
              Deshacer revisión
            </Button>
          ) : null}
        </div>

        {/* Aviso para lectores de pantalla al copiar */}
        <span className="sr-only" aria-live="polite">
          {copiedKey ? "Copiado" : ""}
        </span>
      </div>
    </div>
  );
}
