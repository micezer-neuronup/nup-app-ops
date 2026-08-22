'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { SiteHeader } from "@/components/site-header";

interface Lead {
  id: string;
  market_id: number;
  market_name: string;
  user_id: number | null;
  owner_name: string;
  status: string;
  score: number;
  lead_type: string | null;
  updated_at: string | null;
}

const PAGE_SIZE = 20;

export default function StockControlPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Estados de Filtros
  const [selectedMarket, setSelectedMarket] = useState<string>('all');
  const [assignmentFilter, setAssignmentFilter] = useState<string>('unassigned');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [scoreOrder, setScoreOrder] = useState<'desc' | 'asc'>('desc');

  // Paginación
  const [currentPage, setCurrentPage] = useState<number>(1);

  const fetchLeads = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('https://grumbly-comply-dante.ngrok-free.dev/api/leads/', {
  headers: {
    'ngrok-skip-browser-warning': 'true',
  },
});
      if (!response.ok) throw new Error('Error al conectar con la API de Flask');
      const data: Lead[] = await response.json();
      setLeads(data);
    } catch (err: any) {
      setError(err.message || 'Error al cargar los leads');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, []);

  // Resetear página al cambiar filtros
  const resetFiltersAndPage = (newFilters?: any) => {
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setSelectedMarket('all');
    setAssignmentFilter('unassigned');
    setSelectedType('all');
    setSelectedStatus('all');
    setScoreOrder('desc');
    setCurrentPage(1);
  };

  const marketsList = useMemo(() => {
    const map = new Map<number, string>();
    leads.forEach((l) => {
        if (l.market_id !== null && l.market_name) {
            map.set(l.market_id, l.market_name);
        }
    });
    const list = Array.from(map.entries()).map(([id, name]) => ({ id, name }));
    // Si hay leads sin mercado, añadir opción especial
    const hasNullMarket = leads.some((l) => l.market_id === null);
    if (hasNullMarket) {
        list.push({ id: 0, name: 'Sin mercado' });
    }
    return list;
}, [leads]);

  const usersList = useMemo(() => {
    const filteredByMarket = selectedMarket === 'all'
      ? leads
      : leads.filter((l) => l.market_id.toString() === selectedMarket);
    const owners = new Set<string>();
    filteredByMarket.forEach((l) => {
      if (l.user_id !== null && l.owner_name && l.owner_name !== 'Lead Pool') {
        owners.add(l.owner_name);
      }
    });
    return Array.from(owners);
  }, [leads, selectedMarket]);

  const statusesList = useMemo(() => {
    const set = new Set<string>();
    leads.forEach((l) => l.status && set.add(l.status));
    return Array.from(set);
  }, [leads]);

  const typesList = useMemo(() => {
    const set = new Set<string>();
    leads.forEach((l) => l.lead_type && set.add(l.lead_type));
    return Array.from(set);
  }, [leads]);

  const activeFilters = useMemo(() => {
    const filters: { key: string; label: string; onClear: () => void }[] = [];

    if (selectedMarket !== 'all') {
      const market = marketsList.find(m => m.id.toString() === selectedMarket);
      if (market) {
        filters.push({
          key: 'market',
          label: `Mercado: ${market.name}`,
          onClear: () => setSelectedMarket('all'),
        });
      }
    }

    if (assignmentFilter === 'assigned') {
      filters.push({
        key: 'assignment',
        label: 'Asignados (todos)',
        onClear: () => setAssignmentFilter('unassigned'),
      });
    } else if (assignmentFilter === 'all') {
      filters.push({
        key: 'assignment',
        label: 'Todos los registros',
        onClear: () => setAssignmentFilter('unassigned'),
      });
    } else if (assignmentFilter !== 'unassigned') {
      filters.push({
        key: 'assignment',
        label: `BDR: ${assignmentFilter}`,
        onClear: () => setAssignmentFilter('unassigned'),
      });
    } else {
      filters.push({
        key: 'assignment',
        label: 'Pool sin asignar',
        onClear: () => setAssignmentFilter('all'),
      });
    }

    if (selectedType !== 'all') {
      filters.push({
        key: 'type',
        label: `Tipo: ${selectedType}`,
        onClear: () => setSelectedType('all'),
      });
    }

    if (selectedStatus !== 'all') {
      filters.push({
        key: 'status',
        label: `Estado: ${selectedStatus}`,
        onClear: () => setSelectedStatus('all'),
      });
    }

    if (scoreOrder === 'asc') {
      filters.push({
        key: 'order',
        label: 'Score ascendente',
        onClear: () => setScoreOrder('desc'),
      });
    }

    return filters;
  }, [selectedMarket, assignmentFilter, selectedType, selectedStatus, scoreOrder, marketsList]);

  // Leads filtrados (sin paginar)
  const filteredLeads = useMemo(() => {
    const result = leads
      .filter((lead) => {
        if (selectedMarket !== 'all' && selectedMarket !== 'null' && lead.market_id?.toString() !== selectedMarket) return false;
        if (selectedMarket === 'null' && lead.market_id !== null) return false;
        if (assignmentFilter === 'unassigned') {
          if (lead.user_id !== null) return false;
        } else if (assignmentFilter === 'assigned') {
          if (lead.user_id === null) return false;
        } else if (assignmentFilter !== 'all') {
          if (lead.owner_name !== assignmentFilter) return false;
        }
        if (selectedType !== 'all' && lead.lead_type !== selectedType) return false;
        if (selectedStatus !== 'all' && lead.status !== selectedStatus) return false;
        return true;
      })
      .sort((a, b) => {
        if (scoreOrder === 'desc') return b.score - a.score;
        return a.score - b.score;
      });
    return result;
  }, [leads, selectedMarket, assignmentFilter, selectedType, selectedStatus, scoreOrder]);

  // Lógica de paginación
  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / PAGE_SIZE));

  // Ajustar página actual si se sale del rango
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [filteredLeads.length, totalPages, currentPage]);

  const paginatedLeads = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return filteredLeads.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredLeads, currentPage]);

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handleAssignClick = (lead: Lead) => {
    console.log("Abrir modal de asignación para lead:", lead);
  };

  // Renderiza números de página
  const renderPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
    if (endPage - startPage + 1 < maxVisible) {
      startPage = Math.max(1, endPage - maxVisible + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(
        <button
          key={i}
          onClick={() => goToPage(i)}
          className={`px-2.5 py-1 text-sm rounded ${
            currentPage === i
              ? 'bg-primary text-primary-foreground font-semibold'
              : 'hover:bg-muted text-foreground'
          }`}
        >
          {i}
        </button>
      );
    }
    return pages;
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Cabecera fija */}
      <div className="flex-shrink-0 px-4 lg:px-6 pt-4 md:pt-6 space-y-4">
        {/* Línea superior: Volver + título + SiteHeader + botones */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <Link
              href="/stock-control"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg border bg-card text-card-foreground hover:bg-muted transition-colors shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Volver al Dashboard
            </Link>
            <h1 className="text-2xl font-bold tracking-tight mt-2">Stock Control</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Gestión y asignación de catálogo de leads por mercado
            </p>
          </div>

          {/* Lado derecho: SiteHeader + botones alineados */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleResetFilters}
              className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted transition-colors shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Resetear Filtros
            </button>

            <button
              onClick={fetchLeads}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border bg-primary text-primary-foreground px-3 py-2 text-sm font-semibold hover:opacity-90 transition-opacity shadow-sm disabled:opacity-50"
            >
              <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Recargar
            </button>
            <div className="flex-shrink-0">
              <SiteHeader />
            </div>
          </div>
        </div>

        {/* Barra de filtros (parte del header fijo) */}
        <div className="bg-card/80 backdrop-blur-md border rounded-xl p-4 shadow-sm space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {/* Mercado */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Mercado</label>
              <select
                value={selectedMarket}
                onChange={(e) => {
                  setSelectedMarket(e.target.value);
                  setAssignmentFilter('unassigned');
                  setCurrentPage(1);
                }}
                className="w-full rounded-lg border border-input/80 bg-background px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
              >
                <option value="all">Todos</option>
{marketsList.map((m) => (
  <option key={m.id ?? 'null'} value={m.id?.toString() ?? 'null'}>
    {m.name}
  </option>
))}
              </select>
            </div>

            {/* Asignación */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Asignación</label>
              <select
                value={assignmentFilter}
                onChange={(e) => {
                  setAssignmentFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full rounded-lg border border-input/80 bg-background px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
              >
                <option value="unassigned">Sin Asignar</option>
                <option value="assigned">Asignados</option>
                <option value="all">Todos</option>
                {usersList.length > 0 && <option disabled>── Usuarios ──</option>}
                {usersList.map((owner) => (
                  <option key={owner} value={owner}>{owner}</option>
                ))}
              </select>
            </div>

            {/* Tipo */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Tipo</label>
              <select
                value={selectedType}
                onChange={(e) => {
                  setSelectedType(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full rounded-lg border border-input/80 bg-background px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
              >
                <option value="all">Todos</option>
                {typesList.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Estado */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Estado</label>
              <select
                value={selectedStatus}
                onChange={(e) => {
                  setSelectedStatus(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full rounded-lg border border-input/80 bg-background px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
              >
                <option value="all">Todos</option>
                {statusesList.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Orden Score */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Score</label>
              <select
                value={scoreOrder}
                onChange={(e) => {
                  setScoreOrder(e.target.value as 'desc' | 'asc');
                  setCurrentPage(1);
                }}
                className="w-full rounded-lg border border-input/80 bg-background px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
              >
                <option value="desc">Mayor a Menor</option>
                <option value="asc">Menor a Mayor</option>
              </select>
            </div>
          </div>

          {/* Resultados y chips activos */}
          <div className="flex items-center justify-between pt-2 border-t border-border/50 text-xs text-muted-foreground">
            <span className="font-medium">
              <strong className="text-foreground">{filteredLeads.length}</strong> de {leads.length} leads
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {activeFilters.map((f) => (
                <span
                  key={f.key}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                >
                  {f.label}
                  <button
                    onClick={() => {
                      f.onClear();
                      setCurrentPage(1);
                    }}
                    className="ml-0.5 rounded-full p-0.5 hover:bg-primary/20 transition-colors"
                    aria-label={`Eliminar filtro ${f.label}`}
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
              {activeFilters.length > 1 && (
                <button onClick={handleResetFilters} className="text-xs underline hover:text-foreground ml-1">
                  Limpiar
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Estados de carga y error (dentro del área scrollable) */}
      <div className="flex-1 overflow-y-auto px-4 lg:px-6 pb-6">
        {loading && (
          <div className="p-8 text-center text-sm text-muted-foreground border rounded-xl mt-4">
            Cargando listado de leads desde la API...
          </div>
        )}

        {error && (
          <div className="p-4 text-center text-sm text-destructive border border-destructive/30 bg-destructive/10 rounded-xl mt-4">
            Error: {error}
          </div>
        )}

        {!loading && !error && (
  <>
    <div className="border rounded-xl bg-card shadow-sm overflow-clip mt-4">
      <table className="w-full table-fixed text-sm border-separate border-spacing-0">
        <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur border-b uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="w-[18%] px-4 py-2.5 font-semibold text-left">ID (HubSpot)</th>
            <th className="w-[16%] px-4 py-2.5 font-semibold text-left">Mercado</th>
            <th className="w-[18%] px-4 py-2.5 font-semibold text-left">Asignado a</th>
            <th className="w-[14%] px-4 py-2.5 font-semibold text-left">Estado</th>
            <th className="w-[10%] px-4 py-2.5 font-semibold text-center">Score</th>
            <th className="w-[12%] px-4 py-2.5 font-semibold text-left">Tipo</th>
            <th className="w-[12%] px-4 py-2.5 font-semibold text-right">Acción</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {paginatedLeads.length === 0 ? (
            <tr>
              <td colSpan={7} className="p-8 text-center text-muted-foreground">
                No se encontraron leads con los filtros seleccionados.
              </td>
            </tr>
          ) : (
            paginatedLeads.map((lead) => (
                      <tr key={lead.id} className="hover:bg-muted/40 transition-colors">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-foreground font-medium truncate">{lead.id}</span>
                            <a
                              href={`https://app.hubspot.com/contacts/123456/record/0-1/${lead.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#FF7A59] hover:text-[#e66b4a] transition-colors shrink-0"
                              title="Abrir en HubSpot"
                            >
                              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 1.846c5.607 0 10.154 4.547 10.154 10.154S17.607 22.154 12 22.154 1.846 17.607 1.846 12 6.393 1.846 12 1.846zm4.962 5.68a.84.84 0 00-.593.246l-3.87 3.87a2.969 2.969 0 00-1.722-.533c-.836 0-1.584.347-2.11.898l-2.337-1.35a.845.845 0 00-.117-.058l-.013-.005a.839.839 0 00-1.17.743v.007a.84.84 0 00.444.746l2.338 1.35a2.964 2.964 0 00-.13.863c0 1.043.54 1.964 1.358 2.497l-1.35 2.338a.837.837 0 00-.058.117l-.005.013a.839.839 0 001.488.613l.002-.004 1.35-2.337c.28.07.568.108.863.108a2.96 2.96 0 002.497-1.358l2.337 1.35c.04.023.08.042.122.058l.013.005a.84.84 0 001.17-.743v-.007a.845.845 0 00-.444-.746l-2.338-1.35a2.965 2.965 0 00.13-.863c0-1.043-.54-1.964-1.358-2.497l1.35-2.338a.837.837 0 00.058-.117l.005-.013a.84.84 0 00-.895-1.201zm.089.84a.169.169 0 01.12.29l-.002.004-1.35 2.337a.182.182 0 00.068.252 2.296 2.296 0 011.055 1.922 2.3 2.3 0 01-1.055 1.921.182.182 0 00-.068.252l1.35 2.338a.168.168 0 01-.246.219l-.003-.001-2.337-1.35a.182.182 0 00-.252.068 2.295 2.295 0 01-1.921 1.055 2.296 2.296 0 01-1.922-1.055.182.182 0 00-.252-.068l-2.337 1.35a.168.168 0 01-.222-.246l.001-.003 1.35-2.337a.182.182 0 00-.068-.252 2.295 2.295 0 01-1.055-1.921c0-.796.41-1.496 1.033-1.9a.182.182 0 00.07-.25l-1.351-2.34a.168.168 0 01.244-.22h.002l2.338 1.35a.182.182 0 00.252-.067 2.296 2.296 0 011.921-1.055c.835 0 1.583.347 2.11.898l3.87-3.87a.169.169 0 01.119-.05z"/>
                              </svg>
                            </a>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 truncate">{lead.market_name}</td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-sm font-medium ${
                              lead.user_id
                                ? 'bg-muted text-foreground'
                                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold'
                            }`}
                          >
                            {lead.owner_name}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="px-2 py-0.5 rounded border bg-background text-muted-foreground text-sm">
                            {lead.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center font-bold font-mono">{lead.score}</td>
                        <td className="px-4 py-2.5 text-muted-foreground truncate">{lead.lead_type || '-'}</td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={() => handleAssignClick(lead)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-semibold rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                            </svg>
                            Asignar
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            
    {/* Paginación */}
    {totalPages > 1 && (
      <div className="flex items-center justify-between mt-4 text-sm">
        <span className="text-muted-foreground">
          Página {currentPage} de {totalPages} ({filteredLeads.length} leads)
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
            className="px-2 py-1 rounded hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ‹ Anterior
          </button>
          {renderPageNumbers()}
          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="px-2 py-1 rounded hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Siguiente ›
          </button>
        </div>
      </div>
    )}
  </>
)}
      </div>
    </div>
  );
}