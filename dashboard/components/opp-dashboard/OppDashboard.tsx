"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { SiteHeader } from "../layout/site-header";
import { ModalOpp } from "./ModalOpp";
import { AssignUpsellModal } from "./AssignUpsellModal";
import { OpportunityCard } from "./OpportunityCard";
import type { Opportunity } from "./types";
import Image from "next/image";

// Reexporta los tipos para mantener compatibilidad con imports existentes
export type { Detection, Opportunity } from "./types";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || "";

// ---------- COMPONENTE PRINCIPAL ----------
export function OppDashboard() {
  const [allOpportunities, setAllOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);
  const [copiedField, setCopiedField] = useState<{ id: number; field: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignModalOpp, setAssignModalOpp] = useState<Opportunity | null>(null);

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

  // ---------- 3 COLUMNAS ----------
  // Cast a string para evitar el error de TS sin tocar types.ts
  

  const pendingNoTestAll = useMemo(
  () =>
    sorted.filter(
      (o) =>
        o.status === "pending" &&
        o.opportunity_kind !== "review"
    ),
  [sorted]
);

const pendingTestAll = useMemo(
  () =>
    sorted.filter(
      (o) =>
        o.status === "pending" &&
        o.opportunity_kind === "review"
    ),
  [sorted]
);

  const reviewedOrAssigned = useMemo(
    () => sorted.filter((o) => o.status === "completed" || !!o.upsell_object),
    [sorted]
  );

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

  const totalPendingNoTestAll = pendingNoTestAll.length;
  const totalPendingTestAll = pendingTestAll.length;
  const totalReviewedOrAssigned = reviewedOrAssigned.length;

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
        <p className="text-muted-foreground">Cargando oportunidades...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      {/* ================= HEADER ================= */}
      <header className="border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70 sticky top-0 z-50">
        {/* Línea superior con el color corporativo */}

        <div className="max-w-[1700px] mx-auto px-4 md:px-6">
          <div className="flex items-center justify-between h-16 gap-4">
            {/* ZONA IZQUIERDA: logo + título */}
            <div className="flex items-center gap-4 min-w-0">
              {/* ==== LOGO ==== */}
              <div className="flex items-center justify-center shrink-0">
                <Image
                  src="/Icono_NeuronUP-positivo.png"
                  alt="NeuronUP"
                  width={40}
                  height={40}
                  className="h-10 w-auto object-contain"
                  priority
                />
              </div>

              <div className="flex flex-col min-w-0">
                <h1 className="text-base font-semibold leading-tight text-foreground truncate">
                  Oportunidades de Upsell: Assesment
                </h1>
              </div>

              {/* Buscador */}
              <div className="hidden md:block ml-2">
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Buscar centro o nup_id..."
                  value={searchTerm}
                  onChange={handleSearchChange}
                  className="h-9 w-56 rounded-md border border-border/60 bg-background/60 px-3 text-sm text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-1 focus:ring-[#00a4c2]/60 focus:border-[#00a4c2]/60"
                />
              </div>
            </div>

            {/* ZONA DERECHA: contadores + settings */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="hidden lg:flex items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-3 py-1">
                  <span className="h-2 w-2 rounded-full bg-yellow-400" />
                  <span className="text-xs font-medium text-foreground/80">Pendientes</span>
                  <span className="text-sm font-bold text-yellow-500">{totalPendingNoTestAll}</span>
                </span>

                <span className="inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1">
                  <span className="h-2 w-2 rounded-full bg-orange-400" />
                  <span className="text-xs font-medium text-foreground/80">Revisar</span>
                  <span className="text-sm font-bold text-orange-500">{totalPendingTestAll}</span>
                </span>

                <span className="inline-flex items-center gap-2 rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1">
                  <span className="h-2 w-2 rounded-full bg-green-400" />
                  <span className="text-xs font-medium text-foreground/80">Revisadas/Asignadas</span>
                  <span className="text-sm font-bold text-green-500">{totalReviewedOrAssigned}</span>
                </span>
              </div>

              <SiteHeader />
            </div>
          </div>

          {/* Buscador en móvil */}
          <div className="md:hidden pb-3">
            <input
              type="text"
              placeholder="Buscar centro o nup_id..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="h-9 w-full rounded-md border border-border/60 bg-background/60 px-3 text-sm text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-1 focus:ring-[#00a4c2]/60 focus:border-[#00a4c2]/60"
            />
          </div>
        </div>
      </header>

      {/* ================= CONTENIDO ================= */}
      <main className="flex-1 max-w-[1700px] mx-auto w-full px-4 md:px-6 py-5">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-500 p-3 rounded-lg mb-4 text-sm">
            ❌ {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* ============ COLUMNA 1: Pendientes ============ */}
          <section className="flex flex-col rounded-xl border border-border/60 bg-muted/10 max-h-[calc(100vh-180px)]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 sticky top-0 bg-background/90 backdrop-blur-sm rounded-t-xl z-10">
              <div className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-400" />
                <h2 className="text-sm font-semibold text-foreground">Pendientes</h2>
              </div>
              <span className="inline-flex items-center justify-center min-w-[28px] h-6 rounded-full bg-yellow-500/15 text-yellow-500 text-xs font-bold px-2">
                {pendingNoTestAll.length}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 scrollbar-thin scrollbar-thumb-[#00a4c2]/40 hover:scrollbar-thumb-[#00a4c2]/60 scrollbar-track-transparent">
              {pendingNoTestAll.length === 0 ? (
                <p className="text-sm text-foreground/60 text-center py-8">
                  No hay oportunidades pendientes
                </p>
              ) : (
                pendingNoTestAll.map((opp) => (
                  <OpportunityCard
                    key={opp.id}
                    opp={opp}
                    onMarkReviewed={handleMarkAsReviewed}
                    onMarkPending={handleMarkAsPending}
                    onClick={() => setSelectedOpp(opp)}
                    onCopy={handleCopy}
                    copiedField={copiedField}
                    onAssignUpsell={openAssignModal}
                  />
                ))
              )}
            </div>
          </section>

          {/* ============ COLUMNA 2: Revisar ============ */}
          <section className="flex flex-col rounded-xl border border-border/60 bg-muted/10 max-h-[calc(100vh-180px)]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 sticky top-0 bg-background/90 backdrop-blur-sm rounded-t-xl z-10">
              <div className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-orange-400" />
                <h2 className="text-sm font-semibold text-foreground">Revisar</h2>
              </div>
              <span className="inline-flex items-center justify-center min-w-[28px] h-6 rounded-full bg-orange-500/15 text-orange-500 text-xs font-bold px-2">
                {pendingTestAll.length}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 scrollbar-thin scrollbar-thumb-[#00a4c2]/40 hover:scrollbar-thumb-[#00a4c2]/60 scrollbar-track-transparent">
              {pendingTestAll.length === 0 ? (
                <p className="text-sm text-foreground/60 text-center py-8">
                  No hay oportunidades por revisar
                </p>
              ) : (
                pendingTestAll.map((opp) => (
                  <OpportunityCard
                    key={opp.id}
                    opp={opp}
                    onMarkReviewed={handleMarkAsReviewed}
                    onMarkPending={handleMarkAsPending}
                    onClick={() => setSelectedOpp(opp)}
                    onCopy={handleCopy}
                    copiedField={copiedField}
                    onAssignUpsell={openAssignModal}
                  />
                ))
              )}
            </div>
          </section>

          {/* ============ COLUMNA 3: Revisadas / Asignadas ============ */}
          <section className="flex flex-col rounded-xl border border-border/60 bg-muted/10 max-h-[calc(100vh-180px)]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 sticky top-0 bg-background/90 backdrop-blur-sm rounded-t-xl z-10">
              <div className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-400" />
                <h2 className="text-sm font-semibold text-foreground">Revisadas / Asignadas</h2>
              </div>
              <span className="inline-flex items-center justify-center min-w-[28px] h-6 rounded-full bg-green-500/15 text-green-500 text-xs font-bold px-2">
                {reviewedOrAssigned.length}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 scrollbar-thin scrollbar-thumb-[#00a4c2]/40 hover:scrollbar-thumb-[#00a4c2]/60 scrollbar-track-transparent">
              {reviewedOrAssigned.length === 0 ? (
                <p className="text-sm text-foreground/60 text-center py-8">
                  No hay oportunidades revisadas o asignadas
                </p>
              ) : (
                reviewedOrAssigned.map((opp) => (
                  <OpportunityCard
                    key={opp.id}
                    opp={opp}
                    onMarkReviewed={handleMarkAsReviewed}
                    onMarkPending={handleMarkAsPending}
                    onClick={() => setSelectedOpp(opp)}
                    onCopy={handleCopy}
                    copiedField={copiedField}
                    onAssignUpsell={openAssignModal}
                    isReviewed
                  />
                ))
              )}
            </div>
          </section>
        </div>
      </main>

      {selectedOpp && (
        <ModalOpp
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