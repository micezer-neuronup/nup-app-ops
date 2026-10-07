"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { SiteHeader } from "../layout/site-header";
import { ModalOpp } from "./ModalOpp";
import { AssignUpsellModal } from "./AssignUpsellModal";
import { OpportunityCard } from "./OpportunityCard";
import type { Opportunity } from "./types";

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

  const pending = useMemo(() => sorted.filter((o) => o.status === "pending"), [sorted]);
  const completed = useMemo(() => sorted.filter((o) => o.status === "completed"), [sorted]);

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
                    onAssignUpsell={openAssignModal}
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
                    onAssignUpsell={openAssignModal}
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