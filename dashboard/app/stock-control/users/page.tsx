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
  market_name: string;
  market_id: number;
  max_stock: number;
  restock_threshold: number;
  automation_enabled: boolean;
  current_stock: number;
  role: string;
  pipelines: string[];
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
const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'https://grumbly-comply-dante.ngrok-free.dev';

const MARKET_FLAG_CODES: Record<string, string> = {
  'España': 'es',
  'Brasil - Portugal': 'br',
  'Brasil-Portugal': 'br',
  'Francia': 'fr',
  'LATAM': 'mx',
  'Italia': 'it',
};

const MARKET_LIST = ['España', 'Brasil - Portugal', 'Francia', 'LATAM', 'Italia'];

const PIPELINE_COLORS: Record<string, string> = {
  'Leads Academy': '#3b82f6',
  'Mid-Market': '#8b5cf6',
  'Enterprise': '#10b981',
  'Lead pipeline': '#f59e0b',
  'Mid-Market Leads': '#8b5cf6',
  'Enterprise Leads': '#10b981',
};

// Tooltip personalizado para badges de pipeline
function PipelineBadge({ pipeline }: { pipeline: string }) {
  const [showTooltip, setShowTooltip] = useState(false);
  
  let shortLabel = '';
  let color = '#6b7280';
  
  if (pipeline.includes('Mid-Market')) {
    shortLabel = 'MM';
    color = PIPELINE_COLORS['Mid-Market'] || '#8b5cf6';
  } else if (pipeline.includes('Enterprise')) {
    shortLabel = 'E';
    color = PIPELINE_COLORS['Enterprise'] || '#10b981';
  } else if (pipeline.includes('Lead')) {
    shortLabel = 'L';
    color = PIPELINE_COLORS['Lead pipeline'] || '#f59e0b';
  }
  
  if (!shortLabel) return null;
  
  return (
    <div 
      className="relative inline-flex shrink-0"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span
        className="text-[10px] px-1.5 py-0.5 rounded-full font-bold border cursor-help"
        style={{ 
          backgroundColor: color + '15', 
          color: color,
          borderColor: color + '30'
        }}
      >
        {shortLabel}
      </span>
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50">
          <div className="bg-card border border-border rounded-lg shadow-md px-3 py-1.5 whitespace-nowrap">
            <p className="text-xs font-semibold text-foreground">{pipeline}</p>
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 top-full -mt-1">
            <div className="w-2 h-2 bg-card border-b border-r border-border rotate-45" />
          </div>
        </div>
      )}
    </div>
  );
}

// --- COMPONENTE PRINCIPAL ---
export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [tooltipId, setTooltipId] = useState<string | null>(null);

  // Estados de interfaz
  const [copiedEmailId, setCopiedEmailId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Modal de leads por usuario
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userLeads, setUserLeads] = useState<Lead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState<boolean>(false);

  // Modal de edición
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  const [roleList, setRoleList] = useState<string[]>(['BDR', 'SDR', 'AE']);
  const [pipelineList, setPipelineList] = useState<string[]>([]);

  // Cargar usuarios desde la API
  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${SERVER_URL}/api/users/`, {
        headers: { 'ngrok-skip-browser-warning': 'true' },
      });
      if (!response.ok) throw new Error('Error al conectar con la API de Flask');
      const data: User[] = await response.json();
      
      // Normalizar datos
      const normalized = data.map((u) => ({
        ...u,
        automation_enabled: u.automation_enabled !== undefined ? u.automation_enabled : true,
        current_stock: u.current_stock !== undefined ? u.current_stock : Math.floor(Math.random() * (u.max_stock || 60)),
        role: u.role || 'BDR',
        pipelines: u.pipelines || [],
      }));
      
      setUsers(normalized);
      
      // Extraer pipelines únicos
      const allPipelines = new Set<string>();
      normalized.forEach((u) => u.pipelines.forEach((p: string) => allPipelines.add(p)));
      if (allPipelines.size > 0) setPipelineList(Array.from(allPipelines));
      
      // Extraer roles únicos
      const allRoles = new Set<string>();
      normalized.forEach((u) => { if (u.role) allRoles.add(u.role); });
      if (allRoles.size > 0) setRoleList(Array.from(allRoles));
      
    } catch (err: any) {
      setError(err.message || 'Error al cargar los usuarios');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Función para copiar email al portapapeles
  const handleCopyEmail = (email: string, userId: number) => {
    if (!email) return;
    navigator.clipboard.writeText(email);
    setCopiedEmailId(userId);
    setTimeout(() => setCopiedEmailId(null), 2000);
  };

  // Toggle automatización individual
  const toggleUserAutomation = async (userId: number) => {
    const user = users.find((u) => u.id === userId);
    if (!user) return;

    const newStatus = !user.automation_enabled;

    // Actualización optimista de UI
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
      // Revertir si falla la red
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, automation_enabled: !newStatus } : u))
      );
      alert('Error al guardar el estado de automatización');
    }
  };

  // Forzar recarga
  const handleForceRestock = async (user: User) => {
    try {
      const response = await fetch(`${SERVER_URL}/api/users/${user.id}/restock`, {
        method: 'POST',
        headers: {
          'ngrok-skip-browser-warning': 'true',
        },
      });

      const data = await response.json();
      alert(data.message || 'Recarga procesada');
      fetchUsers(); // Refrescar los contadores
    } catch (err) {
      alert('Error al forzar la recarga');
    }
  };

  // Abrir modal de edición
  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setEditForm({
      market_id: user.market_id,
      market_name: user.market_name,
      max_stock: user.max_stock,
      restock_threshold: user.restock_threshold,
      role: user.role,
      pipelines: [...(user.pipelines || [])],
    });
  };

  const handleSaveEdit = async () => {
    if (!editingUser) return;

    try {
      const response = await fetch(`${SERVER_URL}/api/users/${editingUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({
          market_id: editForm.market_id,
          max_stock: editForm.max_stock,
          restock_threshold: editForm.restock_threshold,
          role: editForm.role,
          pipelines: editForm.pipelines,
        }),
      });

      if (!response.ok) throw new Error('Error al actualizar usuario');

      // Recargar lista para actualizar estado
      await fetchUsers();
      setEditingUser(null);
    } catch (err: any) {
      alert(err.message || 'No se pudieron guardar los cambios');
    }
  };

  // Abrir modal con los leads del usuario
  const handleViewLeads = async (user: User) => {
    setSelectedUser(user);
    setLeadsLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/users/${user.id}/leads`, {
        headers: { 'ngrok-skip-browser-warning': 'true' },
      });
      if (!res.ok) throw new Error('Error al obtener leads');
      const leads: Lead[] = await res.json();
      setUserLeads(leads);
    } catch (err) {
      console.error(err);
      setUserLeads([]);
    } finally {
      setLeadsLoading(false);
    }
  };

  const closeModal = () => {
    setSelectedUser(null);
    setUserLeads([]);
  };

  // Filtrado de usuarios
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

  // Agrupar usuarios por mercado
  const groupedUsers = useMemo(() => {
    const groups: Record<string, User[]> = {};
    filteredUsers.forEach((user) => {
      const key = user.market_name || 'Sin mercado';
      if (!groups[key]) groups[key] = [];
      groups[key].push(user);
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
    {/* Bloque 1: Inbound/Outbound en recuadro */}
    <div className="flex items-center gap-2 shrink-0 rounded-lg border border-foreground/10 bg-card px-3 py-1.5">
      <div className="text-center">
        <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">Inbound</p>
        <p className="text-sm font-bold text-blue-600 leading-tight">612</p>
      </div>
      <div className="w-px h-5 bg-border" />
      <div className="text-center">
        <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">Outbound</p>
        <p className="text-sm font-bold text-purple-600 leading-tight">244</p>
      </div>
    </div>

    {/* Bloque 2: Mercados */}
    <div className="flex items-center gap-3 shrink-0 rounded-lg border border-foreground/10 bg-card px-3 py-1.5">
      {[
        { code: 'es', pct: '37%' },
        { code: 'br', pct: '21%' },
        { code: 'fr', pct: '16%' },
        { code: 'mx', pct: '14%' },
        { code: 'it', pct: '11%' },
      ].map((m) => (
        <div key={m.code} className="flex flex-col items-center gap-0.5">
          <img src={`https://flagcdn.com/w40/${m.code}.png`} alt="" className="w-5 h-3.5 object-cover rounded-sm" />
          <span className="text-[11px] font-bold text-foreground leading-none">{m.pct}</span>
        </div>
      ))}
    </div>

    {/* Bloque 3: Pipelines en recuadro */}
    <div className="flex items-center gap-2 shrink-0 rounded-lg border border-foreground/10 bg-card px-3 py-1.5">
      <div className="text-center">
        <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">Lead</p>
        <p className="text-sm font-bold text-slate-700 leading-tight">342</p>
      </div>
      <div className="w-px h-5 bg-border" />
      <div className="text-center">
        <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">MM</p>
        <p className="text-sm font-bold text-indigo-600 leading-tight">298</p>
      </div>
      <div className="w-px h-5 bg-border" />
      <div className="text-center">
        <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">ENT</p>
        <p className="text-sm font-bold text-emerald-600 leading-tight">216</p>
      </div>
    </div>

    {/* Bloque 4: Barra Asignados/Pool - sin cambios */}
    <div className="flex items-center gap-2 shrink-0">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-semibold text-emerald-600">Asig.</span>
        <span className="text-xs font-bold text-foreground">706</span>
      </div>
      <div className="w-24 h-2.5 bg-slate-200 rounded-full overflow-hidden border border-slate-300 flex">
        <div className="h-full bg-emerald-500" style={{ width: '82.5%' }} />
        <div className="h-full bg-orange-500" style={{ width: '17.5%' }} />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-bold text-foreground">150</span>
        <span className="text-[10px] font-semibold text-orange-500">Pool</span>
      </div>
    </div>
  </div>

  <SiteHeader />
</div>

            {/* CARGA / ERROR */}
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

            {/* LISTADO DE USUARIOS POR MERCADO */}
            {!loading && !error && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                {MARKET_LIST.map((market) => {
                  const marketUsers = groupedUsers[market] || [];
                  if (marketUsers.length === 0 && searchTerm === '') return null;
                  const flagCode = MARKET_FLAG_CODES[market];

                  return (
                    <div key={market} className="space-y-2">
                      {/* Cabecera del mercado */}
                      <div className="flex items-center gap-2 px-1">
                        {flagCode ? (
                          <img src={`https://flagcdn.com/w40/${flagCode}.png`} alt={`${market} flag`} className="w-6 h-4 object-cover rounded-sm shrink-0" />
                        ) : (
                          <div className="w-6 h-4 bg-muted border border-border rounded-sm flex items-center justify-center text-[10px] font-bold text-muted-foreground leading-none shrink-0">?</div>
                        )}
                        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">{market}</h3>
                        <span className="text-xs text-muted-foreground ml-auto">{marketUsers.length}</span>
                      </div>
                      
                      {/* Cards de usuarios */}
                      <div className="space-y-2">
                        {marketUsers.map((user) => {
                          const carga = Math.round((user.current_stock / user.max_stock) * 100);
                          const isOverloaded = carga > 100;
                          const isCopied = copiedEmailId === user.id;
                          
                          return (
                            <div 
                              key={user.id} 
                              className="p-2.5 rounded-lg border-2 border-foreground/20 bg-card hover:border-primary/40 hover:shadow-md transition-all group"
                            >
                            {/* Línea 1: Nombre + Rol + Badges de reparto objetivo (MM%/ENT%) */}
<div className="flex items-center gap-1 min-w-0 mb-1.5">
  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: isOverloaded ? '#f43f5e' : carga > 80 ? '#f59e0b' : carga > 50 ? '#3b82f6' : '#10b981' }} />
  <p className="text-xs font-bold truncate">{user.owner_name}</p>
  <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-primary/10 text-primary border border-primary/20 shrink-0">
    {user.role}
  </span>
  
  {/* Badges de reparto objetivo con tooltip individual */}
  <div className="relative inline-flex shrink-0 ml-auto" onMouseEnter={() => setTooltipId('target-mm')} onMouseLeave={() => setTooltipId(null)}>
    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-indigo-500/10 text-indigo-600 border border-dashed border-indigo-500/30 cursor-help">
      MM 40%
    </span>
    {tooltipId === 'target-mm' && (
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50">
        <div className="bg-card border border-border rounded-lg shadow-md px-3 py-1.5 whitespace-nowrap">
          <p className="text-xs font-semibold text-foreground">Objetivo: 40% Mid-Market</p>
        </div>
        <div className="absolute left-1/2 -translate-x-1/2 top-full -mt-1">
          <div className="w-2 h-2 bg-card border-b border-r border-border rotate-45" />
        </div>
      </div>
    )}
  </div>

  <div className="relative inline-flex shrink-0" onMouseEnter={() => setTooltipId('target-e')} onMouseLeave={() => setTooltipId(null)}>
    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-emerald-500/10 text-emerald-600 border border-dashed border-emerald-500/30 cursor-help">
      ENT 60%
    </span>
    {tooltipId === 'target-e' && (
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50">
        <div className="bg-card border border-border rounded-lg shadow-md px-3 py-1.5 whitespace-nowrap">
          <p className="text-xs font-semibold text-foreground">Objetivo: 60% Enterprise</p>
        </div>
        <div className="absolute left-1/2 -translate-x-1/2 top-full -mt-1">
          <div className="w-2 h-2 bg-card border-b border-r border-border rotate-45" />
        </div>
      </div>
    )}
  </div>
</div>

                              {/* Línea 2: Barra de stock + Acciones siempre visibles + Automatización */}
                              <div className="flex items-center gap-1.5 mb-1.5">
                                <span className="text-[10px] text-muted-foreground font-medium shrink-0">Stock</span>
                                <div className="flex-1 h-1.5 bg-muted/70 rounded-full overflow-hidden">
                                  <div className="h-full flex rounded-full overflow-hidden">
                                    <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.min(carga, 100)}%` }} />
                                    {isOverloaded && <div className="h-full bg-rose-500" style={{ width: `${carga - 100}%` }} />}
                                  </div>
                                </div>
                                <span className={`text-[10px] font-bold shrink-0 ${isOverloaded ? 'text-rose-500' : 'text-foreground'}`}>{user.current_stock}/{user.max_stock}</span>
                                
                                {/* Acciones siempre visibles */}
                                <div className="flex items-center gap-0.5 shrink-0">
                                  <button onClick={() => handleCopyEmail(user.email, user.id)} className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Copiar email">
                                    {isCopied ? (
                                      <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                      </svg>
                                    ) : (
                                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                      </svg>
                                    )}
                                  </button>
                                  <button onClick={() => handleEditUser(user)} className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Editar usuario">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                  </button>
                                  <button onClick={() => handleViewLeads(user)} className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Ver leads">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    </svg>
                                  </button>
                                </div>

                                {/* Botón de automatización */}
                                <button
                                  onClick={() => toggleUserAutomation(user.id)}
                                  className={`shrink-0 p-1 rounded-full border transition-all ${user.automation_enabled ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-500' : 'bg-rose-500/10 border-rose-500/40 text-rose-500'}`}
                                  title={user.automation_enabled ? 'Autom. ON' : 'Autom. OFF'}
                                >
                                  <svg className={`w-3.5 h-3.5 transition-transform ${user.automation_enabled ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                  </svg>
                                </button>
                              </div>

                              {/* Línea 3: Badges de asignación actual en una sola fila */}
                              <div className="flex items-center gap-1">
                                <div className="relative inline-flex shrink-0 min-w-0 flex-1" onMouseEnter={() => setTooltipId('current-in')} onMouseLeave={() => setTooltipId(null)}>
                                  <span className="w-full text-center text-[10px] px-1 py-0.5 rounded-full font-bold bg-blue-500/10 text-blue-600 border border-blue-500/20 cursor-help whitespace-nowrap">
                                    Inbound 18
                                  </span>
                                  {tooltipId === 'current-in' && (
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50">
                                      <div className="bg-card border border-border rounded-lg shadow-md px-3 py-1.5 whitespace-nowrap">
                                        <p className="text-xs font-semibold text-foreground">Inbound actual: 18 leads</p>
                                      </div>
                                      <div className="absolute left-1/2 -translate-x-1/2 top-full -mt-1">
                                        <div className="w-2 h-2 bg-card border-b border-r border-border rotate-45" />
                                      </div>
                                    </div>
                                  )}
                                </div>

                                <div className="relative inline-flex shrink-0 min-w-0 flex-1" onMouseEnter={() => setTooltipId('current-out')} onMouseLeave={() => setTooltipId(null)}>
                                  <span className="w-full text-center text-[10px] px-1 py-0.5 rounded-full font-bold bg-purple-500/10 text-purple-600 border border-purple-500/20 cursor-help whitespace-nowrap">
                                    Outbound 7
                                  </span>
                                  {tooltipId === 'current-out' && (
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50">
                                      <div className="bg-card border border-border rounded-lg shadow-md px-3 py-1.5 whitespace-nowrap">
                                        <p className="text-xs font-semibold text-foreground">Outbound actual: 7 leads</p>
                                      </div>
                                      <div className="absolute left-1/2 -translate-x-1/2 top-full -mt-1">
                                        <div className="w-2 h-2 bg-card border-b border-r border-border rotate-45" />
                                      </div>
                                    </div>
                                  )}
                                </div>

                                <div className="relative inline-flex shrink-0 min-w-0 flex-1" onMouseEnter={() => setTooltipId('current-mm')} onMouseLeave={() => setTooltipId(null)}>
                                  <span className="w-full text-center text-[10px] px-1 py-0.5 rounded-full font-bold bg-indigo-500/10 text-indigo-600 border border-indigo-500/20 cursor-help whitespace-nowrap">
                                    MM 45%
                                  </span>
                                  {tooltipId === 'current-mm' && (
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50">
                                      <div className="bg-card border border-border rounded-lg shadow-md px-3 py-1.5 whitespace-nowrap">
                                        <p className="text-xs font-semibold text-foreground">Mid-Market actual: 45%</p>
                                      </div>
                                      <div className="absolute left-1/2 -translate-x-1/2 top-full -mt-1">
                                        <div className="w-2 h-2 bg-card border-b border-r border-border rotate-45" />
                                      </div>
                                    </div>
                                  )}
                                </div>

                                <div className="relative inline-flex shrink-0 min-w-0 flex-1" onMouseEnter={() => setTooltipId('current-e')} onMouseLeave={() => setTooltipId(null)}>
                                  <span className="w-full text-center text-[10px] px-1 py-0.5 rounded-full font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 cursor-help whitespace-nowrap">
                                    ENT 55%
                                  </span>
                                  {tooltipId === 'current-e' && (
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50">
                                      <div className="bg-card border border-border rounded-lg shadow-md px-3 py-1.5 whitespace-nowrap">
                                        <p className="text-xs font-semibold text-foreground">Enterprise actual: 55%</p>
                                      </div>
                                      <div className="absolute left-1/2 -translate-x-1/2 top-full -mt-1">
                                        <div className="w-2 h-2 bg-card border-b border-r border-border rotate-45" />
                                      </div>
                                    </div>
                                  )}
                                </div>
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
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                <div className="bg-card w-full max-w-md rounded-xl shadow-xl border p-6">
                  <h2 className="text-lg font-bold mb-4">Editar {editingUser.owner_name}</h2>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold mb-1">Mercado</label>
                      <select value={editForm.market_id} onChange={(e) => setEditForm({ ...editForm, market_id: parseInt(e.target.value) })} className="w-full rounded-lg border px-2.5 py-1.5 text-sm">
                        {MARKET_LIST.map((m, i) => (
                          <option key={m} value={i + 1}>{m}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">Rol</label>
                      <select value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })} className="w-full rounded-lg border px-2.5 py-1.5 text-sm">
                        {roleList.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold mb-1">Max Stock</label>
                        <input type="number" value={editForm.max_stock} onChange={(e) => setEditForm({ ...editForm, max_stock: parseInt(e.target.value) || 0 })} className="w-full rounded-lg border px-2.5 py-1.5 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold mb-1">Umbral Recarga</label>
                        <input type="number" value={editForm.restock_threshold} onChange={(e) => setEditForm({ ...editForm, restock_threshold: parseInt(e.target.value) || 0 })} className="w-full rounded-lg border px-2.5 py-1.5 text-sm" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">Pipelines Permitidos</label>
                      <div className="flex flex-wrap gap-2">
                        {pipelineList.map((p) => (
                          <label key={p} className="flex items-center gap-1 text-sm">
                            <input type="checkbox" checked={editForm.pipelines.includes(p)} onChange={(e) => {
                              if (e.target.checked) {
                                setEditForm({ ...editForm, pipelines: [...editForm.pipelines, p] });
                              } else {
                                setEditForm({ ...editForm, pipelines: editForm.pipelines.filter((x: string) => x !== p) });
                              }
                            }} className="rounded" />
                            {p}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 mt-6">
                    <button onClick={() => setEditingUser(null)} className="px-4 py-2 text-sm rounded-lg border bg-muted hover:bg-muted/80">Cancelar</button>
                    <button onClick={handleSaveEdit} className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:opacity-90">Guardar</button>
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