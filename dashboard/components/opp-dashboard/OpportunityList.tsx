"use client";

import {
  ArrowDown, ArrowUp, CheckCircle, Copy, AlertTriangle, TrendingUp, TrendingDown, MoveRight, Sparkles,
  UserPlus, UserCheck, Undo2,
} from "lucide-react";
import { PriorityBadge, checkReasons, REASON_META } from "./shared/PriorityBadge";
import { HubSpotIcon } from "./shared/HubSpotIcon";
import { Tag } from "./shared/Tag";
import type { Opportunity } from "./types";

export type SortKey = "score" | "tests" | "trend" | "created";
export type SortDir = "desc" | "asc";

// Días en los que una oportunidad se marca como "Nueva"
export const NEW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export const isRecent = (opp: Opportunity) =>
  !!opp.created_at && Date.now() - new Date(opp.created_at).getTime() <= NEW_DAYS * DAY_MS;

const fmtDate = (d: string) => new Date(d).toLocaleDateString("es", { day: "numeric", month: "short" });

// ---------- TENDENCIA: últimos 30 días frente a los 30 anteriores ----------
// Sale de trigger_details (tests_recent / tests_previous); las oportunidades anteriores a v2 no lo tienen
export interface Trend {
  kind: "up" | "down" | "flat" | "new" | "none";
  pct: number | null;
}

export function trendOf(opp: Opportunity): Trend {
  let td = opp.trigger_details;
  if (typeof td === "string") {
    try {
      td = JSON.parse(td);
    } catch {
      td = null;
    }
  }
  const recent = typeof td?.tests_recent === "number" ? td.tests_recent : null;
  const previous = typeof td?.tests_previous === "number" ? td.tests_previous : null;
  if (recent === null || previous === null) return { kind: "none", pct: null };
  if (previous === 0) return recent > 0 ? { kind: "new", pct: null } : { kind: "none", pct: null };
  const pct = Math.round(((recent - previous) / previous) * 100);
  return { kind: pct >= 10 ? "up" : pct <= -10 ? "down" : "flat", pct };
}

// Valor numérico para ordenar por tendencia ("sin uso previo" arriba, sin datos abajo)
export const trendSortValue = (t: Trend) =>
  t.kind === "new" ? Number.MAX_SAFE_INTEGER : t.kind === "none" ? Number.MIN_SAFE_INTEGER : (t.pct as number);

export function TrendCell({ trend }: { trend: Trend }) {
  if (trend.kind === "none") return <span className="text-foreground/40">—</span>;
  if (trend.kind === "new")
    return (
      <span className="inline-flex items-center gap-1.5 text-foreground/80" title="Sin uso en los 30 días anteriores">
        <Sparkles className="h-4 w-4 text-green-500" />
        Nuevo uso
      </span>
    );
  const Icon = trend.kind === "up" ? TrendingUp : trend.kind === "down" ? TrendingDown : MoveRight;
  const color = trend.kind === "up" ? "text-green-500" : trend.kind === "down" ? "text-red-500" : "text-foreground/40";
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums text-foreground/80">
      <Icon className={`h-4 w-4 ${color}`} />
      {trend.pct! > 0 ? "+" : ""}
      {trend.pct}%
    </span>
  );
}

const openHubSpot = (opp: Opportunity) => {
  const companyId = opp.hubspot_company_id;
  const portalId = opp.hubspot_portal_id || "143501970";
  const uiDomain = "app-eu1.hubspot.com";
  if (companyId) {
    window.open(`https://${uiDomain}/contacts/${portalId}/record/0-2/${companyId}/`, "_blank");
  } else {
    alert("No se encontró el ID de HubSpot para este centro.");
  }
};

// Botón de acción con icono: no abre el modal (stopPropagation)
function ActionButton({
  title, onClick, className, children,
}: {
  title: string;
  onClick: () => void;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`inline-flex items-center justify-center h-8 w-8 rounded-md border border-border bg-muted/30 transition-colors ${className}`}
    >
      {children}
    </button>
  );
}

// Plantilla de columnas compartida por la cabecera y las filas (md+)
const COLS =
  "md:grid md:grid-cols-[40px_minmax(0,2.4fr)_120px_minmax(150px,1fr)_130px_96px_110px_96px_124px] md:items-center";

function SortHeader({
  label, k, sort, onSort,
}: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; dir: SortDir };
  onSort: (k: SortKey) => void;
}) {
  const active = sort.key === k;
  const Arrow = sort.dir === "desc" ? ArrowDown : ArrowUp;
  return (
    <button
      type="button"
      onClick={() => onSort(k)}
      className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-foreground transition-colors ${active ? "text-foreground" : ""}`}
    >
      {label}
      {active && <Arrow className="h-3.5 w-3.5" />}
    </button>
  );
}

interface Props {
  opportunities: Opportunity[];
  emptyText: string;
  sort: { key: SortKey; dir: SortDir };
  onSort: (k: SortKey) => void;
  onOpen: (opp: Opportunity) => void;
  onCopy: (id: number, field: string, value: string) => void;
  copiedField: { id: number; field: string } | null;
  onReview: (id: number) => void;
  onUndo: (id: number) => void;
  onAssign: (opp: Opportunity) => void;
}

export function OpportunityList({
  opportunities, emptyText, sort, onSort, onOpen, onCopy, copiedField, onReview, onUndo, onAssign,
}: Props) {
  return (
    <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-border/60 bg-card overflow-hidden">
      {/* Cabecera de columnas (fija al hacer scroll) */}
      <div
        className={`hidden ${COLS} gap-4 px-4 h-11 border-b border-border/60 bg-muted/30 text-xs font-semibold text-foreground/55 shrink-0`}
      >
        <span className="uppercase tracking-wider">#</span>
        <span className="uppercase tracking-wider">Centro</span>
        <span className="uppercase tracking-wider">nup_id</span>
        <span className="uppercase tracking-wider">Prioridad</span>
        <SortHeader label="Score" k="score" sort={sort} onSort={onSort} />
        <SortHeader label="Tests 60d" k="tests" sort={sort} onSort={onSort} />
        <SortHeader label="Tendencia" k="trend" sort={sort} onSort={onSort} />
        <SortHeader label="Detectada" k="created" sort={sort} onSort={onSort} />
        <span className="uppercase tracking-wider text-right">Acciones</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin scrollbar-thumb-[#00a4c2]/40 scrollbar-track-transparent">
        {opportunities.length === 0 ? (
          <p className="text-base text-foreground/60 text-center py-16">{emptyText}</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {opportunities.map((opp, i) => {
              const copied = copiedField?.id === opp.id && copiedField?.field === "nup_id";
              const score = opp.score || 0;
              const recent = isRecent(opp);
              const completed = opp.status === "completed";
              return (
                <li
                  key={opp.id}
                  onClick={() => onOpen(opp)}
                  className={`${COLS} gap-4 px-4 py-2.5 md:py-0 md:h-[52px] cursor-pointer hover:bg-muted/40 transition-colors flex flex-wrap items-center gap-y-2`}
                >
                  {/* # */}
                  <span className="hidden md:block text-sm tabular-nums text-foreground/45">{i + 1}</span>

                  {/* Centro (+ marca "Nueva" si entró en los últimos NEW_DAYS días) */}
                  <div className="min-w-0 basis-full md:basis-auto flex items-center justify-between gap-3 md:block">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="text-base font-semibold text-foreground truncate">
                          {opp.center_name || `Centro ${opp.center_id}`}
                        </p>
                        {recent && (
                          <span
                            className="shrink-0 inline-flex items-center gap-1 h-5 px-1.5 rounded border border-[#00a4c2]/40 text-[11px] font-semibold uppercase tracking-wide text-[#0091ad] dark:text-[#00a4c2]"
                            title={`Detectada en los últimos ${NEW_DAYS} días`}
                          >
                            Nueva
                          </span>
                        )}
                      </div>
                      {opp.upsell_object && (
                        <p className="text-xs text-foreground/55 truncate">
                          Asignada · {opp.upsell_object}
                          {opp.upsell_owner_name ? ` · ${opp.upsell_owner_name}` : ""}
                        </p>
                      )}
                    </div>
                    {/* Score visible a la derecha del nombre solo en móvil */}
                    <span className="md:hidden text-lg font-bold tabular-nums">{score}</span>
                  </div>

                  {/* nup_id (copiar sin abrir el modal) */}
                  <span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCopy(opp.id, "nup_id", String(opp.center_id));
                      }}
                      className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md border border-border bg-muted/40 hover:border-[#00a4c2]/60 text-sm font-medium tabular-nums text-foreground transition-colors"
                      title="Copiar nup_id"
                    >
                      {opp.center_id}
                      {copied ? (
                        <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 text-foreground/50" />
                      )}
                    </button>
                  </span>

                  {/* Prioridad (+ un icono por motivo de revisión, sin texto) */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    <PriorityBadge trigger={opp.trigger_details} compact />
                    {checkReasons(opp).map((reason) => {
                      const meta = REASON_META[reason];
                      const Icon = meta.icon;
                      return (
                        <span
                          key={reason}
                          className={`inline-flex items-center justify-center h-8 w-8 shrink-0 rounded-md border border-border bg-muted/40 ${meta.className}`}
                          title={`${meta.label}: ${meta.description}`}
                          aria-label={meta.label}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                      );
                    })}
                  </div>

                  {/* Score */}
                  <div className="hidden md:flex items-center gap-2.5">
                    <span className="w-8 text-base font-bold tabular-nums text-foreground">{score}</span>
                    <span className="h-1.5 w-12 rounded-full bg-muted overflow-hidden">
                      <span
                        className="block h-full rounded-full bg-[#0091ad] dark:bg-[#00a4c2]"
                        style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
                      />
                    </span>
                  </div>

                  {/* Tests 60d */}
                  <span className="text-base tabular-nums text-foreground">
                    {opp.total_tests_60d}
                    <span className="md:hidden text-sm text-foreground/55"> tests</span>
                  </span>

                  {/* Tendencia */}
                  <span className="text-sm">
                    <TrendCell trend={trendOf(opp)} />
                  </span>

                  {/* Detectada */}
                  <span className="text-sm tabular-nums text-foreground/70">
                    {opp.created_at ? fmtDate(opp.created_at) : "—"}
                  </span>

                  {/* Acciones (no abren el modal) */}
                  <div className="flex items-center gap-1.5 md:justify-end">
                    <ActionButton
                      title="Ver en HubSpot"
                      onClick={() => openHubSpot(opp)}
                      className="text-orange-400 hover:border-orange-400/60"
                    >
                      <HubSpotIcon className="h-4 w-4" />
                    </ActionButton>
                    <ActionButton
                      title={opp.upsell_object ? "Editar asignación" : "Asignar"}
                      onClick={() => onAssign(opp)}
                      className="text-foreground/70 hover:text-[#00a4c2] hover:border-[#00a4c2]/60"
                    >
                      {opp.upsell_object ? <UserCheck className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                    </ActionButton>
                    {completed ? (
                      <ActionButton
                        title="Deshacer: volver a pendiente"
                        onClick={() => onUndo(opp.id)}
                        className="text-foreground/70 hover:text-red-500 hover:border-red-500/60"
                      >
                        <Undo2 className="h-4 w-4" />
                      </ActionButton>
                    ) : (
                      <ActionButton
                        title="Marcar como revisada"
                        onClick={() => onReview(opp.id)}
                        className="text-foreground/70 hover:text-green-500 hover:border-green-500/60"
                      >
                        <CheckCircle className="h-4 w-4" />
                      </ActionButton>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
