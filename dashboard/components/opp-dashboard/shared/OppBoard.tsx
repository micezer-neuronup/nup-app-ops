"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { Search, HelpCircle, X, Sparkles } from "lucide-react";
import { ModalOpp } from "./ModalOpp";
import { AssignUpsellModal } from "./AssignUpsellModal";
import { OpportunityList, trendOf, trendSortValue, isRecent, NEW_DAYS, type SortKey, type SortDir } from "./OpportunityList";
import type { Opportunity } from "./types";
import { OppHeader } from "./OppHeader";
import { LegendButton } from "./LegendButton";
import { getTrack, REASON_META } from "./PriorityBadge";
import { MODULE_CONFIGS } from "../moduleConfigs";
import type { OppModuleKey } from "../modules";

// Reexporta los tipos para mantener compatibilidad con imports existentes
export type { Detection, Opportunity } from "./types";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || "";

type PriorityFilter = "all" | "alta" | "media";

// ---------- TABLERO COMÚN DE UN MÓDULO (assessment, sessions…) ----------
// Pestañas, métrica, textos y etiquetas salen de la config del módulo (<modulo>/config.ts, ver moduleConfigs.ts)
export function OppBoard({ moduleKey }: { moduleKey: OppModuleKey }) {
  const config = MODULE_CONFIGS[moduleKey]!;
  const [allOpportunities, setAllOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);
  const [copiedField, setCopiedField] = useState<{ id: number; field: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignModalOpp, setAssignModalOpp] = useState<Opportunity | null>(null);

  const [activeTab, setActiveTab] = useState<string>(config.tabs[0].key);
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "score", dir: "desc" });
  const [helpOpen, setHelpOpen] = useState(false);
  const [newOnly, setNewOnly] = useState(false);

  const fetchOpportunities = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${SERVER_URL}/api/opportunities?product=${encodeURIComponent(config.product)}`, {
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
        upsell_object: opp.upsell_object || null,
        upsell_owner_id: opp.upsell_owner_id || null,
        upsell_owner_name: opp.upsell_owner_name || null,
        avg_daily_60d: typeof opp.avg_daily_60d === "number" ? opp.avg_daily_60d : 0,
        score: typeof opp.score === "number" ? opp.score : 0,
        total_tests_60d: typeof opp.total_tests_60d === "number" ? opp.total_tests_60d : 0,
        active_days_60d: typeof opp.active_days_60d === "number" ? opp.active_days_60d : 0,
        detections: Array.isArray(opp.detections) ? opp.detections : [],
        opportunity_kind: opp.opportunity_kind || 'upgrade',
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

  // ---------- PESTAÑAS: cada una con su filtro (config.tabs) ----------
  const tabList = useMemo(
    () => Object.fromEntries(config.tabs.map((t) => [t.key, sorted.filter(t.filter)])) as Record<string, Opportunity[]>,
    [sorted, config.tabs]
  );

  // ---------- LISTA VISIBLE: pestaña -> prioridad -> orden ----------
  const visible = useMemo(() => {
    const base =
      tabList[activeTab];
    const filtered =
      (priorityFilter === "all" ? base : base.filter((o) => getTrack(o.trigger_details).priority === priorityFilter))
        .filter((o) => !newOnly || isRecent(o));
    const value = (o: Opportunity) =>
      sort.key === "score"
        ? o.score || 0
        : sort.key === "tests"
        ? o.total_tests_60d || 0
        : sort.key === "created"
        ? new Date(o.created_at).getTime() || 0
        : trendSortValue(trendOf(o, config.metric.prefix));
    const dir = sort.dir === "desc" ? -1 : 1;
    return [...filtered].sort((a, b) => (value(a) - value(b)) * dir);
  }, [activeTab, priorityFilter, newOnly, sort, tabList, config.metric.prefix]);

  // Oportunidades nuevas (últimos NEW_DAYS días) en la pestaña activa, para el botón "Nuevas"
  const newInTab = useMemo(() => {
    const base =
      tabList[activeTab];
    return base.filter(isRecent).length;
  }, [activeTab, tabList]);

  const handleSort = (key: SortKey) =>
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));

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

  const openAssignModal = (opp: Opportunity) => {
    setAssignModalOpp(opp);
    setAssignModalOpen(true);
  };

  const handleAssigned = (data: {
    upsellObject: string;
    upsellOwnerId: string;
    upsellOwnerName: string;
  }) => {
    if (!assignModalOpp) return;
    setAllOpportunities((prev) =>
      prev.map((o) =>
        o.id === assignModalOpp.id
          ? {
              ...o,
              upsell_object: data.upsellObject,
              upsell_owner_id: data.upsellOwnerId,
              upsell_owner_name: data.upsellOwnerName,
            }
          : o
      )
    );
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-lg text-muted-foreground">Cargando oportunidades...</p>
      </div>
    );
  }

  const currentTab = config.tabs.find((t) => t.key === activeTab) || config.tabs[0];

  return (
    <div className="flex flex-col min-h-screen lg:h-screen bg-background text-foreground">
      <OppHeader
        title={config.title}
        backHref="/opp-dashboard"
        titleImage={config.image}
        right={<LegendButton reasons={config.reasons} />}
      />

      <main className="flex-1 min-h-0 max-w-[1900px] mx-auto w-full px-4 md:px-6 py-4 flex flex-col gap-4">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-500 p-3 rounded-md text-base">
            ❌ {error}
          </div>
        )}

        {/* ================= TOOLBAR: pestañas + filtros ================= */}
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border/60">
          <div className="flex flex-wrap items-end gap-1">
            {config.tabs.map((t) => {
              const Icon = t.icon;
              const active = t.key === activeTab;
              return (
                <div key={t.key} className="group/tab relative">
                <button
                  type="button"
                  onClick={() => setActiveTab(t.key)}
                  aria-describedby={`tab-hint-${t.key}`}
                  className={`inline-flex items-center gap-2 h-11 px-4 -mb-px border-b-2 text-base whitespace-nowrap transition-colors ${
                    active
                      ? "border-[#00a4c2] font-semibold text-foreground"
                      : "border-transparent text-foreground/60 hover:text-foreground"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${active ? "text-[#00a4c2]" : ""}`} />
                  {t.label}
                  <span className="inline-flex items-center justify-center min-w-7 h-6 px-1.5 rounded-md border border-border bg-muted/40 text-sm font-bold tabular-nums">
                    {tabList[t.key]?.length ?? 0}
                  </span>
                </button>
                <div
                  id={`tab-hint-${t.key}`}
                  role="tooltip"
                  className="invisible opacity-0 group-hover/tab:visible group-hover/tab:opacity-100 group-focus-within/tab:visible group-focus-within/tab:opacity-100 transition-opacity delay-150 absolute left-0 top-full mt-2 z-40 w-80 rounded-lg border border-border bg-popover p-3 text-sm leading-relaxed text-popover-foreground shadow-lg"
                >
                  <p className="font-semibold mb-1">{t.label}</p>
                  <p className="text-foreground/80">{t.hint}</p>
                </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-2 pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/50" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Buscar centro o nup_id..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="h-10 w-64 rounded-md border border-border/60 bg-background/60 pl-9 pr-3 text-sm text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-1 focus:ring-[#00a4c2]/60 focus:border-[#00a4c2]/60"
              />
            </div>

            <button
              type="button"
              onClick={() => setNewOnly((v) => !v)}
              aria-pressed={newOnly}
              title={`Solo las detectadas en los últimos ${NEW_DAYS} días`}
              className={`inline-flex items-center gap-2 h-10 px-3 rounded-md border text-sm transition-colors ${
                newOnly
                  ? "border-[#00a4c2]/60 bg-[#00a4c2]/10 font-semibold text-foreground"
                  : "border-border bg-muted/30 text-foreground/70 hover:text-foreground"
              }`}
            >
              <Sparkles className={`h-4 w-4 ${newOnly ? "text-[#00a4c2]" : ""}`} />
              Nuevas
              <span className="font-bold tabular-nums">{newInTab}</span>
            </button>

            <div className="inline-flex h-10 rounded-md border border-border bg-muted/30 p-0.5" role="group" aria-label="Prioridad">
              {(["all", "alta", "media"] as PriorityFilter[]).map((pf) => (
                <button
                  key={pf}
                  type="button"
                  onClick={() => setPriorityFilter(pf)}
                  className={`px-3 rounded text-sm transition-colors ${
                    priorityFilter === pf ? "bg-card shadow-sm font-semibold text-foreground" : "text-foreground/60 hover:text-foreground"
                  }`}
                >
                  {pf === "all" ? "Todas" : pf === "alta" ? "Alta" : "Media"}
                </button>
              ))}
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => setHelpOpen((v) => !v)}
                className="inline-flex items-center justify-center h-10 w-10 rounded-md border border-border bg-muted/30 text-foreground/60 hover:text-[#00a4c2] hover:border-[#00a4c2]/60 transition-colors"
                title="¿Qué significa cada columna?"
                aria-label="Ayuda"
              >
                <HelpCircle className="h-5 w-5" />
              </button>
              {helpOpen && (
                <div className="absolute right-0 top-12 z-40 w-[400px] max-h-[75vh] overflow-y-auto rounded-lg border border-border bg-popover p-4 text-sm text-popover-foreground shadow-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">¿Qué significa cada columna?</h3>
                    <button type="button" onClick={() => setHelpOpen(false)} aria-label="Cerrar">
                      <X className="h-4 w-4 text-foreground/60" />
                    </button>
                  </div>
                  <ul className="space-y-2 leading-relaxed text-foreground/80">
                    <li><b>Score</b>: puntuación de 0 a 100 con el uso de los últimos 60 días: volumen de {config.metric.many} (50%), constancia (30%) y tendencia (20%).</li>
                    {config.help.map((h) => (
                      <li key={h.term}><b>{h.term}</b>: {h.text}</li>
                    ))}
                    <li>
                      <b>Iconos de revisión</b> (junto a la prioridad):
                      <ul className="mt-1 space-y-1 pl-3">
                        {config.reasons.map((r) => {
                          const m = REASON_META[r];
                          const Icon = m.icon;
                          return (
                            <li key={r} className="flex gap-1.5">
                              <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${m.className}`} />
                              <span><b>{m.label}</b>: {m.description}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                    <li><b>Tendencia</b>: {config.metric.many} de los últimos 30 días frente a los 30 anteriores. <b>Nuevo uso</b> si antes no tenía uso.</li>
                    <li><b>Detectada</b>: fecha en que entró la oportunidad. Las de los últimos {NEW_DAYS} días llevan la marca <b>Nueva</b> y se pueden filtrar con el botón <b>Nuevas</b>.</li>
                    <li><b>Acciones</b>: abrir en HubSpot, asignar y marcar como revisada (o deshacer para volver a pendiente).</li>
                    <li>Pulsa una fila para ver el contacto, el historial y las acciones (HubSpot, asignar, revisar).</li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ================= LISTA ================= */}
        <OpportunityList
          metric={config.metric}
          opportunities={visible}
          emptyText={currentTab.empty}
          sort={sort}
          onSort={handleSort}
          onOpen={setSelectedOpp}
          onCopy={handleCopy}
          copiedField={copiedField}
          onReview={handleMarkAsReviewed}
          onUndo={handleMarkAsPending}
          onAssign={openAssignModal}
        />
      </main>

      {selectedOpp && (
        <ModalOpp
          config={config}
          opp={selectedOpp}
          onClose={() => setSelectedOpp(null)}
          onReview={handleMarkAsReviewed}
          onUndo={handleMarkAsPending}
          onAssignUpsell={openAssignModal}
        />
      )}

      {assignModalOpp && (
        <AssignUpsellModal
          open={assignModalOpen}
          onClose={() => {
            setAssignModalOpen(false);
            setAssignModalOpp(null);
          }}
          opportunityId={assignModalOpp.id}
          centerName={assignModalOpp.center_name || `Centro ${assignModalOpp.center_id}`}
          currentObject={assignModalOpp.upsell_object || ""}
          currentOwnerId={assignModalOpp.upsell_owner_id || ""}
          currentOwnerName={assignModalOpp.upsell_owner_name || ""}
          onAssigned={handleAssigned}
        />
      )}
    </div>
  );
}
