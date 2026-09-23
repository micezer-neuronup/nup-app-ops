'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { SiteHeader } from "@/components/site-header";

// --- INTERFACES ---
interface User {
  id: number;
  owner_name: string;
  hubspot_user_id: string | null;
  email: string;
  market_ids: number[];
  market_names: string[];
  max_stock: number;
  restock_threshold: number;
  automation_enabled: boolean;
  current_stock: number;
  role: string;
  pipelines: string[];
  inbound_count: number;
  outbound_count: number;
  mm_count: number;
  ent_count: number;
  mm_percent: number;
  e_percent: number;
  target_mm_percent: number;
  target_e_percent: number;
  market_targets: Record<string, number> | null;
  market_breakdown: Record<string, { total: number; inbound: number; outbound: number; mm: number; ent: number }> | null;
  updated_at: string | null;
}

interface Lead {
  id: string;
  market_name: string;
  status: string;
  score: number;
  owner_name: string;
  lead_type: string | null;
}

// --- CONSTANTES ---
const SERVER_URL = process.env.NEXT_PUBLIC_STOCK_CONTROL_URL || 'http://localhost:5000'

const MARKET_FLAG_CODES: Record<string, string> = {
  'España': 'es',
  'Brasil - Portugal': 'br',
  'Brasil-Portugal': 'br',
  'Francia': 'fr',
  'LATAM': 'mx',
  'Italia': 'it',
  'USA': 'us',
};

const MARKET_LIST = ['España', 'Brasil - Portugal', 'Francia', 'LATAM', 'Italia', 'USA'];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-background/95 backdrop-blur-sm border border-border rounded-lg shadow-md p-3 text-sm">
        <p className="font-semibold mb-2 text-foreground border-b pb-1">{label}</p>
        <div className="flex flex-col gap-1.5 mt-2">
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div 
                  className="w-2.5 h-2.5 rounded-full shadow-sm" 
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-muted-foreground">{entry.name}</span>
              </div>
              <span className="font-semibold text-foreground">
                {entry.value.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

// --- COMPONENTE PRINCIPAL ---
export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [tooltipId, setTooltipId] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState<string>('');

  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userLeads, setUserLeads] = useState<Lead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState<boolean>(false);

  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  const [pipelineList, setPipelineList] = useState<string[]>([]);

  const [headerStats, setHeaderStats] = useState<any>(null);


  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${SERVER_URL}/api/users/`, {
        headers: { 'ngrok-skip-browser-warning': 'true' },
      });
      if (!response.ok) throw new Error('Error al conectar con la API de Flask');
      const data: User[] = await response.json();
      
      const normalized = data.map((u) => ({
        ...u,
        market_ids: u.market_ids || [],
        market_names: u.market_names || [],
        automation_enabled: u.automation_enabled !== undefined ? u.automation_enabled : true,
        current_stock: u.current_stock || 0,
        role: u.role || 'BDR',
        pipelines: u.pipelines || [],
        inbound_count: u.inbound_count || 0,
        outbound_count: u.outbound_count || 0,
        mm_count: u.mm_count || 0,
        ent_count: u.ent_count || 0,
        mm_percent: u.mm_percent || 0,
        e_percent: u.e_percent || 0,
        target_mm_percent: u.target_mm_percent !== undefined ? u.target_mm_percent : 40,
        target_e_percent: u.target_e_percent !== undefined ? u.target_e_percent : 60,
        market_targets: u.market_targets || null,
        market_breakdown: u.market_breakdown || {},
      }));
      
      setUsers(normalized);
      
      const allPipelines = new Set<string>();
      normalized.forEach((u) => u.pipelines.forEach((p: string) => allPipelines.add(p)));
      if (allPipelines.size > 0) setPipelineList(Array.from(allPipelines));
      
      
    } catch (err: any) {
      setError(err.message || 'Error al cargar los usuarios');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);


  useEffect(() => {
  async function fetchHeaderStats() {
    try {
      const response = await fetch(`${SERVER_URL}/api/stock-control`, {
        headers: { 'ngrok-skip-browser-warning': 'true' },
      });
      const data = await response.json();
      setHeaderStats(data.stats);
    } catch (err) {
      console.error('Error al cargar header stats:', err);
    }
  }
  fetchHeaderStats();
}, []);

  const toggleUserAutomation = async (userId: number) => {
    const user = users.find((u) => u.id === userId);
    if (!user) return;

    const newStatus = !user.automation_enabled;

    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, automation_enabled: newStatus } : u))
    );

    try {
      const response = await fetch(`${SERVER_URL}/api/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({ automation_enabled: newStatus }),
      });
      if (!response.ok) throw new Error();
    } catch (err) {
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, automation_enabled: !newStatus } : u))
      );
      alert('Error al guardar el estado de automatización');
    }
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setEditForm({
      market_ids: user.market_ids || [],
      max_stock: user.max_stock,
      restock_threshold: user.restock_threshold,
      role: user.role,
      pipelines: [...(user.pipelines || [])],
      target_e_percent: user.target_e_percent !== undefined && user.target_e_percent !== null 
        ? user.target_e_percent 
        : null,
      market_targets: user.market_targets || null,
      market_targets_enabled: !!user.market_targets,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingUser) return;

    if (!editForm.market_ids || editForm.market_ids.length === 0) {
      alert('El usuario debe tener al menos un mercado asignado');
      return;
    }

    if (!editForm.pipelines || editForm.pipelines.length === 0) {
      alert('El usuario debe tener al menos un pipeline asignado');
      return;
    }

    // Validar que si hay objetivo ENT, Enterprise debe estar en pipelines
    if (editForm.target_e_percent !== null && 
        editForm.target_e_percent !== undefined && 
        !editForm.pipelines.includes('Enterprise')) {
      alert('No puedes establecer un objetivo ENT sin tener Enterprise habilitado en pipelines');
      return;
    }

    // Validar market_targets si está activado
    if (editForm.market_targets_enabled) {
      const assignedMarkets = editForm.market_ids || [];
      const targets = editForm.market_targets || {};
      const sum = assignedMarkets.reduce((acc: number, mid: number) => acc + (targets[mid] || 0), 0);
      
      if (sum !== 100) {
        alert(`Los porcentajes de mercado deben sumar 100. Actual: ${sum}%`);
        return;
      }
    }

    try {
      const response = await fetch(`${SERVER_URL}/api/users/${editingUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({
          market_ids: editForm.market_ids,
          max_stock: editForm.max_stock,
          restock_threshold: editForm.restock_threshold,
          role: editForm.role,
          pipelines: editForm.pipelines,
          target_e_percent: editForm.target_e_percent,
        }),
      });

      if (!response.ok) throw new Error('Error al actualizar usuario');

      // Guardar market targets (o borrarlos si está desactivado)
      if (editForm.market_targets_enabled) {
        const assignedMarkets = editForm.market_ids || [];
        const targets = editForm.market_targets || {};
        const targetsArray = assignedMarkets.map((mid: number) => ({
          market_id: mid,
          target_percent: targets[mid] || 0
        }));
        
        await fetch(`${SERVER_URL}/api/users/${editingUser.id}/market-targets`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true',
          },
          body: JSON.stringify({ targets: targetsArray }),
        });
      } else {
        // Borrar config si estaba desactivado
        await fetch(`${SERVER_URL}/api/users/${editingUser.id}/market-targets`, {
          method: 'DELETE',
          headers: { 'ngrok-skip-browser-warning': 'true' },
        });
      }

      await fetchUsers();
      setEditingUser(null);
    } catch (err: any) {
      alert(err.message || 'No se pudieron guardar los cambios');
    }
  };

  const closeModal = () => {
    setSelectedUser(null);
    setUserLeads([]);
  };

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      if (searchTerm.trim() !== '') {
        const query = searchTerm.toLowerCase();
        const nameMatch = user.owner_name?.toLowerCase().includes(query);
        const emailMatch = user.email?.toLowerCase().includes(query);
        return nameMatch || emailMatch;
      }
      return true;
    });
  }, [users, searchTerm]);

  const groupedUsers = useMemo(() => {
    const groups: Record<string, User[]> = {};
    filteredUsers.forEach((user) => {
      const marketNames = user.market_names?.length
        ? user.market_names
        : ['Sin mercado'];
      
      marketNames.forEach((marketName: string) => {
        if (!groups[marketName]) groups[marketName] = [];
        groups[marketName].push(user);
      });
    });
    return groups;
  }, [filteredUsers]);

  return (
    <div className="flex flex-1 flex-col min-h-screen bg-background">
      <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
  <div className="px-4 lg:px-6 space-y-4">
    
    {/* CABECERA SUPERIOR */}
    <div className="w-full flex items-center gap-3">
      <Link
        href="/stock-control"
        className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg border bg-card text-card-foreground hover:bg-muted transition-colors shadow-sm shrink-0"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Volver
      </Link>

     <div className="flex-1 flex items-center justify-center gap-3">
  {/* Inbound/Outbound */}
  <div className="flex items-center gap-2 shrink-0 rounded-lg border border-foreground/10 bg-card px-3 py-1.5">
    <div className="text-center">
      <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">Inbound</p>
      <p className="text-sm font-bold text-foreground leading-tight">{headerStats?.inboundVivos ?? 0}</p>
    </div>
    <div className="w-px h-5 bg-border" />
    <div className="text-center">
      <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">Outbound</p>
      <p className="text-sm font-bold text-foreground leading-tight">{headerStats?.outboundVivos ?? 0}</p>
    </div>
  </div>

 {/* Pipelines con datos reales y nombres completos */}
  <div className="flex items-center gap-3 shrink-0 rounded-lg border border-foreground/10 bg-card px-3 py-1.5">
    {headerStats?.pipelineData?.map((p: any, i: number) => (
      <React.Fragment key={p.name}>
        {i > 0 && <div className="w-px h-5 bg-border" />}
        <div className="text-center">
          <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">
            {p.name}
          </p>
          <p className="text-sm font-bold text-foreground leading-tight">{p.value}</p>
        </div>
      </React.Fragment>
    ))}
  </div>

         {/* Mercados con datos reales - mismo tamaño que otros contenedores */}
  <div className="flex items-center gap-3 shrink-0 rounded-lg border border-foreground/10 bg-card px-3 py-1.5">
    {headerStats?.marketStackedData?.map((m: any) => (
      <div key={m.name} className="flex flex-col items-center gap-0.5">
        <img 
          src={`https://flagcdn.com/w40/${m.flagCode || 'es'}.png`} 
          alt={m.name} 
          className="w-5 h-3.5 object-cover rounded-sm" 
        />
        <span className="text-[11px] font-bold text-foreground leading-none">{m.pct}%</span>
      </div>
    ))}
  </div>



         {/* Barra Asignados/Pool con contenedor */}
  <div className="flex items-center gap-2 shrink-0">
  <div className="flex items-center gap-1.5">
    <span className="text-[10px] font-semibold text-emerald-600">Asig.</span>
    <span className="text-xs font-bold text-foreground">
      {headerStats?.asignadosReales ?? 0}
    </span>
  </div>
  <div className="w-24 h-2.5 bg-slate-200 rounded-full overflow-hidden border border-slate-300 flex">
    <div 
      className="h-full bg-emerald-500" 
      style={{ 
        width: `${headerStats && headerStats.totalLeadsVivos > 0 
          ? (headerStats.asignadosReales / headerStats.totalLeadsVivos * 100) 
          : 0}%` 
      }} 
    />
    <div 
      className="h-full bg-orange-500" 
      style={{ 
        width: `${headerStats && headerStats.totalLeadsVivos > 0 
          ? (headerStats.leadsEnPool / headerStats.totalLeadsVivos * 100) 
          : 0}%` 
      }} 
    />
  </div>
  <div className="flex items-center gap-1.5">
    <span className="text-xs font-bold text-foreground">{headerStats?.leadsEnPool ?? 0}</span>
    <span className="text-[10px] font-semibold text-orange-500">Pool</span>
  </div>
</div>
      </div>

      <SiteHeader />
    </div>


            {loading && (
              <div className="p-8 text-center text-sm text-muted-foreground border rounded-xl">
                Cargando listado de usuarios...
              </div>
            )}

            {error && (
              <div className="p-4 text-center text-sm text-destructive border border-destructive/30 bg-destructive/10 rounded-xl">
                Error: {error}
              </div>
            )}

            {!loading && !error && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                {MARKET_LIST.map((market) => {
                  const marketUsers = groupedUsers[market] || [];
                  if (marketUsers.length === 0 && searchTerm === '') return null;
                  const flagCode = MARKET_FLAG_CODES[market];

                  return (
                    <div key={market} className="space-y-2">
                      <div className="flex items-center gap-2 px-1">
                        {flagCode ? (
                          <img src={`https://flagcdn.com/w40/${flagCode}.png`} alt={`${market} flag`} className="w-6 h-4 object-cover rounded-sm shrink-0" />
                        ) : (
                          <div className="w-6 h-4 bg-muted border border-border rounded-sm flex items-center justify-center text-[10px] font-bold text-muted-foreground leading-none shrink-0">?</div>
                        )}
                        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">{market}</h3>
                        <span className="text-xs text-muted-foreground ml-auto">{marketUsers.length}</span>
                      </div>
                      
                      <div className="space-y-2">
                       {marketUsers.map((user) => {
  const carga = Math.round((user.current_stock / user.max_stock) * 100);
  const isOverloaded = carga > 100;
  
  return (
    <div 
      key={user.id} 
      className="rounded-lg border-2 border-foreground/20 bg-card hover:border-primary/40 hover:shadow-md transition-all group overflow-visible p-2 space-y-1.5"
    >
      {/* Fila 1: Nombre + Rol + Objetivo ENT */}
      <div className="flex items-center gap-1">
        <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: isOverloaded ? '#f43f5e' : carga > 80 ? '#f59e0b' : carga > 50 ? '#3b82f6' : '#10b981' }} />
        <p className="text-xs font-bold truncate">{user.owner_name}</p>
        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium bg-muted text-foreground border border-border shrink-0">
          {user.role}
        </span>
        
        {/* Objetivo ENT a la derecha */}
        <div className="relative inline-flex shrink-0 ml-auto" 
          onMouseEnter={() => setTooltipId(`${user.id}-target-e`)} 
          onMouseLeave={() => setTooltipId(null)}
        >
          <span className="text-[9px] font-medium text-foreground cursor-help whitespace-nowrap">
            {user.target_e_percent === null || user.target_e_percent === undefined 
              ? 'X' 
              : `ENT ${user.target_e_percent}%`}
          </span>
          {tooltipId === `${user.id}-target-e` && (
            <div className="absolute right-full top-1/2 -translate-y-1/2 mr-2 z-50">
              <CustomTooltip 
                active={true} 
                payload={[{ 
                  name: 'Enterprise', 
                  value: user.target_e_percent === null || user.target_e_percent === undefined 
                    ? 'No aplica' 
                    : user.target_e_percent, 
                  color: '#64748b' 
                }]} 
                label={`${user.owner_name} - Objetivo`} 
              />
            </div>
          )}
        </div>
      </div>

      {/* Fila 2: Stock + Botones */}
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] text-muted-foreground font-medium shrink-0">Stock</span>
        <div className="flex-1 h-1.5 bg-muted/70 rounded-full overflow-hidden">
          <div className="h-full flex rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.min(carga, 100)}%` }} />
            {isOverloaded && <div className="h-full bg-rose-500" style={{ width: `${carga - 100}%` }} />}
          </div>
        </div>
        <span className={`text-[9px] font-bold shrink-0 ${isOverloaded ? 'text-rose-500' : 'text-foreground'}`}>{user.current_stock}/{user.max_stock}</span>
        
        {/* Botones al lado de la barra */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => handleEditUser(user)}
            className="shrink-0 p-1 rounded-full border transition-all bg-blue-500/15 border-blue-500/40 text-blue-600 hover:bg-blue-500/25"
            title="Editar usuario"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={() => toggleUserAutomation(user.id)}
            className={`shrink-0 p-1 rounded-full border transition-all ${user.automation_enabled ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-500' : 'bg-rose-500/10 border-rose-500/40 text-rose-500'}`}
            title={user.automation_enabled ? 'Autom. ON' : 'Autom. OFF'}
          >
            <svg className={`w-3 h-3 transition-transform ${user.automation_enabled ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Fila 3: Badges actual */}
      <div className="flex items-center gap-1">
        <span className="text-[8px] text-muted-foreground font-semibold uppercase tracking-wider shrink-0">Actual:</span>
        
        {[
          { key: 'in', label: `IN ${user.inbound_count}`, tooltip: 'Inbound', value: user.inbound_count },
          { key: 'out', label: `OUT ${user.outbound_count}`, tooltip: 'Outbound', value: user.outbound_count },
          { key: 'mm', label: `MM ${user.mm_percent}%`, tooltip: 'Mid-Market', value: user.mm_percent },
          { key: 'e', label: `ENT ${user.e_percent}%`, tooltip: 'Enterprise', value: user.e_percent },
        ].map((b) => (
          <div key={b.key} className="relative inline-flex shrink-0 min-w-0 flex-1" 
            onMouseEnter={() => setTooltipId(`${user.id}-current-${b.key}`)} 
            onMouseLeave={() => setTooltipId(null)}
          >
            <span className="w-full text-center text-[9px] px-1 py-0.5 rounded-full font-medium bg-muted text-foreground border border-border cursor-help whitespace-nowrap">
              {b.label}
            </span>
            {tooltipId === `${user.id}-current-${b.key}` && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50">
                <CustomTooltip 
                  active={true} 
                  payload={[{ name: b.tooltip, value: b.value, color: '#64748b' }]} 
                  label={`${user.owner_name} - ${b.tooltip}`} 
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
})}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* MODAL DE LEADS DEL USUARIO */}
            {selectedUser && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                <div className="bg-card w-full max-w-3xl rounded-xl shadow-xl border p-6 max-h-[80vh] flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold">Leads de {selectedUser.owner_name}</h2>
                    <button onClick={closeModal} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {leadsLoading ? (
                      <p className="text-center text-sm text-muted-foreground py-8">Cargando leads...</p>
                    ) : userLeads.length === 0 ? (
                      <p className="text-center text-sm text-muted-foreground py-8">No se encontraron leads.</p>
                    ) : (
                      <table className="w-full text-sm border-collapse">
                        <thead className="bg-muted/50 border-b">
                          <tr className="text-muted-foreground">
                            <th className="px-3 py-2 text-left font-semibold">ID</th>
                            <th className="px-3 py-2 text-left font-semibold">Mercado</th>
                            <th className="px-3 py-2 text-left font-semibold">Estado</th>
                            <th className="px-3 py-2 text-center font-semibold">Score</th>
                            <th className="px-3 py-2 text-left font-semibold">Tipo</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {userLeads.map((lead) => (
                            <tr key={lead.id} className="hover:bg-muted/30">
                              <td className="px-3 py-2 font-mono">{lead.id}</td>
                              <td className="px-3 py-2">{lead.market_name}</td>
                              <td className="px-3 py-2">
                                <span className="px-2 py-0.5 rounded border bg-background text-muted-foreground text-xs">{lead.status}</span>
                              </td>
                              <td className="px-3 py-2 text-center font-bold">{lead.score}</td>
                              <td className="px-3 py-2 text-muted-foreground">{lead.lead_type || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                  <div className="mt-4 text-right">
                    <button onClick={closeModal} className="px-4 py-2 text-sm font-semibold rounded-lg border bg-muted hover:bg-muted/80 transition-colors">Cerrar</button>
                  </div>
                </div>
              </div>
            )}

         {/* MODAL DE EDICIÓN */}
{editingUser && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
    <div className="bg-card w-full max-w-7xl rounded-2xl shadow-2xl border border-border overflow-hidden max-h-[94vh] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-border bg-muted/30 shrink-0">
        <div>
          <h2 className="text-xl font-bold text-foreground">Editar {editingUser.owner_name}</h2>
          <p className="text-sm text-muted-foreground mt-1">Configura mercados, pipelines, capacidad y objetivos</p>
        </div>
        <button onClick={() => setEditingUser(null)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Body: 2 columnas */}
      <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-2">
        
        {/* ─── Columna izquierda: CONFIGURACIÓN ─────────────── */}
        <div className="px-8 py-6 space-y-6 overflow-y-auto border-r border-border">
          
          {/* Mercados Permitidos */}
          <div>
            <label className="block text-sm font-semibold mb-3 text-foreground">Mercados Permitidos</label>
            <div className="flex flex-wrap gap-2.5">
              {MARKET_LIST.map((m, i) => {
                const isSelected = (editForm.market_ids || []).includes(i + 1);
                const flagCode = MARKET_FLAG_CODES[m];
                return (
                  <label
                    key={m}
                    title={m}
                    className={`flex items-center justify-center px-3 py-2 rounded-lg border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-500/20 border-emerald-500/50'
                        : 'bg-rose-500/10 border-rose-500/30 opacity-60'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        const newIds = e.target.checked
                          ? [...(editForm.market_ids || []), i + 1]
                          : (editForm.market_ids || []).filter((id: number) => id !== i + 1);
                        setEditForm({ ...editForm, market_ids: newIds });
                      }}
                      className="sr-only"
                    />
                    {flagCode ? (
                      <img src={`https://flagcdn.com/w40/${flagCode}.png`} alt={m} className="w-7 h-5 object-cover rounded-sm" />
                    ) : (
                      <span className="text-lg">❓</span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Max Stock + Umbral */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-2 text-foreground">Max Stock</label>
              <input
                type="number"
                value={editForm.max_stock}
                onChange={(e) => setEditForm({ ...editForm, max_stock: parseInt(e.target.value) || 0 })}
                className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2 text-foreground">Umbral Recarga</label>
              <input
                type="number"
                value={editForm.restock_threshold}
                onChange={(e) => setEditForm({ ...editForm, restock_threshold: parseInt(e.target.value) || 0 })}
                className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
              />
            </div>
          </div>

          {/* Pipelines + Objetivo ENT en la misma línea */}
          <div>
            <div className="grid grid-cols-2 gap-4">
              {/* Pipelines Permitidos */}
              <div>
                <label className="block text-sm font-semibold mb-3 text-foreground">Pipelines Permitidos</label>
                <div className="flex flex-wrap gap-2">
                  {pipelineList.map((p) => {
                    const isSelected = editForm.pipelines.includes(p);
                    return (
                      <label
                        key={p}
                        className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-600 font-semibold'
                            : 'bg-rose-500/10 border-rose-500/30 text-rose-600'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setEditForm({ ...editForm, pipelines: [...editForm.pipelines, p] });
                            } else {
                              setEditForm({ ...editForm, pipelines: editForm.pipelines.filter((x: string) => x !== p) });
                            }
                          }}
                          className="sr-only"
                        />
                        <span>{p}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Objetivo ENT */}
              <div>
                <label className="block text-sm font-semibold mb-2 text-foreground">Objetivo ENTERPRISE (%)</label>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setEditForm({ ...editForm, target_e_percent: null })}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                      editForm.target_e_percent === null || editForm.target_e_percent === undefined
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-600 font-semibold'
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-600'
                    }`}
                  >
                    No aplica
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const current = editForm.target_e_percent;
                      if (current === null || current === undefined) return;
                      if (current === 10) {
                        setEditForm({ ...editForm, target_e_percent: null });
                      } else {
                        setEditForm({ ...editForm, target_e_percent: current - 10 });
                      }
                    }}
                    className="w-8 h-8 rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors flex items-center justify-center text-sm font-bold"
                  >
                    -
                  </button>
                  <div className="w-14 text-center">
                    <p className="text-sm font-bold text-foreground">
                      {editForm.target_e_percent === null || editForm.target_e_percent === undefined ? 'X' : `${editForm.target_e_percent}%`}
                    </p>
                    <p className="text-[9px] text-muted-foreground">
                      {editForm.target_e_percent === null || editForm.target_e_percent === undefined ? 'MM: -' : `MM: ${100 - editForm.target_e_percent}%`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const current = editForm.target_e_percent;
                      if (current === null || current === undefined) {
                        setEditForm({ ...editForm, target_e_percent: 10 });
                      } else {
                        setEditForm({ ...editForm, target_e_percent: Math.min(100, current + 10) });
                      }
                    }}
                    className="w-8 h-8 rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors flex items-center justify-center text-sm font-bold"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {editForm.target_e_percent !== null &&
             editForm.target_e_percent !== undefined &&
             !editForm.pipelines.includes('Enterprise') && (
              <p className="text-xs text-amber-600 font-medium mt-2">
                ⚠️ El objetivo ENT requiere Enterprise habilitado
              </p>
            )}
          </div>

          {/* Objetivo por MERCADO */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-semibold text-foreground">Objetivo por MERCADO (%)</label>
              <button
                type="button"
                onClick={() => {
                  if (editForm.market_targets_enabled) {
                    setEditForm({ ...editForm, market_targets_enabled: false, market_targets: null });
                  } else {
                    const assigned = editForm.market_ids || [];
                    const base = assigned.length > 0 ? Math.floor(100 / assigned.length) : 0;
                    const remainder = assigned.length > 0 ? 100 - base * assigned.length : 0;
                    const initial: Record<string, number> = {};
                    assigned.forEach((mid: number, i: number) => {
                      initial[mid] = base + (i < remainder ? 1 : 0);
                    });
                    setEditForm({ ...editForm, market_targets_enabled: true, market_targets: initial });
                  }
                }}
                className={`text-xs px-3 py-1.5 rounded-md border transition-all ${
                  editForm.market_targets_enabled
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-600 font-semibold'
                    : 'bg-muted border-border text-muted-foreground hover:bg-muted/70'
                }`}
              >
                {editForm.market_targets_enabled ? 'Configurado' : 'Equitativo'}
              </button>
            </div>

            {editForm.market_targets_enabled && (
              <div className="space-y-3 p-4 rounded-lg border border-border bg-muted/20">
                {(editForm.market_ids || []).map((mid: number) => {
                  const marketName = MARKET_LIST[mid - 1] || `Mercado ${mid}`;
                  const flagCode = MARKET_FLAG_CODES[marketName];
                  const pct = (editForm.market_targets || {})[mid] || 0;
                  return (
                    <div key={mid} className="flex items-center gap-3">
                      {flagCode ? (
                        <img src={`https://flagcdn.com/w40/${flagCode}.png`} alt={marketName} className="w-6 h-4 object-cover rounded-sm shrink-0" />
                      ) : (
                        <span className="w-6 text-center">❓</span>
                      )}
                      <span className="text-sm text-foreground flex-1 truncate">{marketName}</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={pct}
                        onChange={(e) => {
                          const newPct = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                          setEditForm({
                            ...editForm,
                            market_targets: {
                              ...(editForm.market_targets || {}),
                              [mid]: newPct
                            }
                          });
                        }}
                        className="w-20 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground text-right focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      <span className="text-sm text-muted-foreground w-4">%</span>
                    </div>
                  );
                })}

                {/* Suma */}
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Suma total</span>
                  <span className={`text-lg font-bold ${
                    (() => {
                      const assigned = editForm.market_ids || [];
                      const targets = editForm.market_targets || {};
                      const sum = assigned.reduce((acc: number, mid: number) => acc + (targets[mid] || 0), 0);
                      return sum === 100 ? 'text-emerald-600' : 'text-rose-600';
                    })()
                  }`}>
                    {(() => {
                      const assigned = editForm.market_ids || [];
                      const targets = editForm.market_targets || {};
                      const sum = assigned.reduce((acc: number, mid: number) => acc + (targets[mid] || 0), 0);
                      return `${sum}%`;
                    })()}
                  </span>
                </div>

                {(() => {
                  const assigned = editForm.market_ids || [];
                  const targets = editForm.market_targets || {};
                  const sum = assigned.reduce((acc: number, mid: number) => acc + (targets[mid] || 0), 0);
                  if (sum !== 100) {
                    return <p className="text-xs text-rose-600 font-medium">⚠️ La suma debe ser exactamente 100%</p>;
                  }
                  return null;
                })()}

                {(() => {
                  const assigned = editForm.market_ids || [];
                  const targets = editForm.market_targets || {};
                  const hasUnassigned = Object.keys(targets).some(mid => !assigned.includes(parseInt(mid)));
                  if (hasUnassigned) {
                    return <p className="text-xs text-amber-600 font-medium">ℹ️ Algunos mercados tienen % guardado pero no están asignados. Se ignorarán.</p>;
                  }
                  return null;
                })()}
              </div>
            )}

            {!editForm.market_targets_enabled && (
              <p className="text-xs text-muted-foreground mt-1.5">
                Reparto equitativo entre los mercados asignados. Activa para definir porcentajes específicos.
              </p>
            )}
          </div>
        </div>

        {/* ─── Columna derecha: ACTUAL ──────────────────────── */}
        <div className="px-8 py-6 overflow-y-auto bg-muted/10">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Estado Actual</h3>
            <p className="text-xs text-muted-foreground mt-1">Leads asignados ahora mismo</p>
          </div>

          {/* Totales compactos */}
          <div className="flex items-center gap-6 mb-5 pb-4 border-b border-border">
            <div>
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Stock</p>
              <p className="text-xl font-bold text-foreground">
                {editingUser.current_stock}<span className="text-sm text-muted-foreground">/{editingUser.max_stock}</span>
              </p>
            </div>
            <div className="w-px h-8 bg-border" />
            <div>
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Calificación</p>
              <p className="text-xl font-bold text-foreground">
                {editingUser.e_percent}<span className="text-sm text-muted-foreground">% ENT</span>
              </p>
            </div>
          </div>

          {/* Desglose por mercado */}
          <div className="space-y-2">
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-2">Por Mercado</p>

            {(editingUser.market_ids || []).map((mid: number) => {
              const marketName = MARKET_LIST[mid - 1] || `Mercado ${mid}`;
              const flagCode = MARKET_FLAG_CODES[marketName];
              const mb = (editingUser.market_breakdown || {})[mid] || { total: 0, inbound: 0, outbound: 0, mm: 0, ent: 0 };
              return (
                <div key={mid} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
                  {flagCode ? (
                    <img src={`https://flagcdn.com/w40/${flagCode}.png`} alt={marketName} title={marketName} className="w-6 h-4 object-cover rounded-sm shrink-0" />
                  ) : (
                    <span className="w-6 text-center shrink-0">❓</span>
                  )}
                  <span className="text-sm font-bold text-foreground w-8">{mb.total}</span>
                  <div className="flex-1 grid grid-cols-4 gap-1 text-center">
                    <div>
                      <p className="text-[9px] text-muted-foreground font-bold uppercase">IN</p>
                      <p className="text-xs font-bold text-blue-500">{mb.inbound}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-muted-foreground font-bold uppercase">OUT</p>
                      <p className="text-xs font-bold text-cyan-500">{mb.outbound}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-muted-foreground font-bold uppercase">MM</p>
                      <p className="text-xs font-bold text-indigo-500">{mb.mm}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-muted-foreground font-bold uppercase">ENT</p>
                      <p className="text-xs font-bold text-emerald-500">{mb.ent}</p>
                    </div>
                  </div>
                </div>
              );
            })}

            {(editingUser.market_ids || []).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">Sin mercados asignados</p>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-3 px-8 py-5 border-t border-border bg-muted/30 shrink-0">
        <button
          onClick={() => setEditingUser(null)}
          className="px-5 py-2.5 text-sm font-medium rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={handleSaveEdit}
          className="px-5 py-2.5 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
        >
          Guardar
        </button>
      </div>
    </div>
  </div>
)}
          </div>
        </div>
      </div>
    </div>
  );
}