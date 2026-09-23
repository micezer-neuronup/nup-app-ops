'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { SiteHeader } from "../../components/site-header";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface Market {
  id: number;
  name: string;
  flag: string;
  automation_enabled: boolean;
}

const SERVER_URL = process.env.NEXT_PUBLIC_STOCK_CONTROL_URL || 'http://localhost:5000'

const STATE_FULL_MAP: Record<string, string> = {
  "New": "New",
  "Att.": "Attempting",
  "Cont.": "Contacted",
  "Qual.": "Qualified",
  "Disq.": "Disqualified",
};

const MARKET_FLAG_CODES: Record<number, string> = {
  1: "es",
  2: "br",
  3: "fr",
  4: "mx",
  5: "it",
  6: "us"
  
};

// Paleta neutra y profesional
const CHART_COLORS = {
  primary: '#64748b',      // slate
  secondary: '#94a3b8',    // slate light
  accent: '#475569',       // slate dark
  success: '#16a34a',      // verde sobrio
  warning: '#ca8a04',      // amarillo oscuro
  danger: '#dc2626',       // rojo sobrio
  info: '#2563eb',         // azul sobrio
  purple: '#7c3aed',       // púrpura sobrio
  emerald: '#059669',      // esmeralda sobrio
  orange: '#ea580c',       // naranja sobrio
};

// Tooltip genérico
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-lg shadow-md p-3 text-sm">
        <p className="font-semibold mb-2 text-foreground border-b pb-1">{label}</p>
        <div className="flex flex-col gap-1.5 mt-2">
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div 
                  className="w-2.5 h-2.5 rounded-full" 
                  style={{ backgroundColor: entry.color || entry.fill }}
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

// Tooltip para Estados
const StateTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const fullName = STATE_FULL_MAP[label] || label;
    return (
      <div className="bg-card border border-border rounded-lg shadow-md p-3 text-sm">
        <p className="font-semibold mb-2 text-foreground border-b pb-1">{fullName}</p>
        <div className="flex flex-col gap-1.5 mt-2">
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div 
                  className="w-2.5 h-2.5 rounded-full" 
                  style={{ backgroundColor: entry.color || entry.fill }}
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

// Tooltip para Mercados
const MarketTooltip = ({ active, payload, label, marketData }: any) => {
  if (active && payload && payload.length) {
    const item = payload[0]?.payload || marketData?.find((m: any) => m.name === label);
    const flagCode = (item?.flagCode || '').toLowerCase();
    const marketName = item?.name || label || 'Sin mercado';




    return (
      <div className="bg-card border border-border rounded-lg shadow-md p-3 text-sm">
        <p className="font-semibold mb-2 text-foreground border-b pb-1 flex items-center gap-2">
          {flagCode ? (
            <img 
              src={`https://flagcdn.com/w40/${flagCode}.png`}
              alt={`${marketName} flag`}
              className="w-6 h-4 object-cover rounded-sm inline-block"
            />
          ) : (
            <span className="w-6 h-4 bg-muted border border-border rounded-sm inline-flex items-center justify-center text-[10px] font-bold text-muted-foreground leading-none">
              ?
            </span>
          )}
          {marketName}
        </p>
        <div className="flex flex-col gap-1.5 mt-2">
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div 
                  className="w-2.5 h-2.5 rounded-full" 
                  style={{ backgroundColor: entry.color || entry.fill }}
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
export default function StockControlDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [globalAutomation, setGlobalAutomation] = useState<boolean>(true);



    useEffect(() => {
    async function fetchAutomationState() {
      try {
        const response = await fetch(`${SERVER_URL}/api/global-automation`, {
          headers: {},
        });
        const data = await response.json();
        setGlobalAutomation(data.automation_enabled);
      } catch (err) {
        console.error('Error al cargar estado global:', err);
      }
    }

    fetchAutomationState();
    fetchStats();
  }, []);


  useEffect(() => {
    async function fetchMarkets() {
      try {
        const response = await fetch(`${SERVER_URL}/api/markets`, {
          headers: { 'ngrok-skip-browser-warning': 'true' },
        });
        const data = await response.json();
        setMarkets(data);
      } catch (err) {
        console.error('Error al cargar mercados:', err);
      }
    }

    fetchMarkets();
  }, []);

  const [markets, setMarkets] = useState<Market[]>([
    { id: 1, name: 'España', flag: '🇪🇸', automation_enabled: true },
    { id: 2, name: 'Brasil - Portugal', flag: '🇧🇷', automation_enabled: true },
    { id: 3, name: 'Francia', flag: '🇫🇷', automation_enabled: false },
    { id: 4, name: 'LATAM', flag: '🌎', automation_enabled: true },
    { id: 5, name: 'Italia', flag: '🇮🇹', automation_enabled: true },
  ]);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `${SERVER_URL}/api/stock-control`,
        { headers: { "ngrok-skip-browser-warning": "true" } }
      );
      const data = await response.json();
      setStats(data.stats);
    } catch (error) {
      console.error("Error al cargar estadísticas:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (loading || !stats) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-sm font-semibold text-muted-foreground">Cargando panel de control...</p>
        </div>
      </div>
    );
  }

  const toggleGlobalAutomation = async () => {
    const newStatus = !globalAutomation;
    setGlobalAutomation(newStatus);
    
    try {
      await fetch(`${SERVER_URL}/api/global-automation`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({ enabled: newStatus }),
      });
      
      // Si se reactiva la global, recargar mercados desde BD
      if (newStatus) {
        const response = await fetch(`${SERVER_URL}/api/markets`, {
          headers: { 'ngrok-skip-browser-warning': 'true' },
        });
        const data = await response.json();
        setMarkets(data);
      }
    } catch (err) {
      console.error('Error:', err);
      setGlobalAutomation(!newStatus);
    }
  };

  const toggleMarketAutomation = async (marketId: number) => {
    const market = markets.find((m) => m.id === marketId);
    if (!market) return;
    
    const newStatus = !market.automation_enabled;
    
    setMarkets((prev) =>
      prev.map((m) => (m.id === marketId ? { ...m, automation_enabled: newStatus } : m))
    );
    
    try {
      await fetch(`${SERVER_URL}/api/markets/${marketId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({ automation_enabled: newStatus }),
      });
    } catch (err) {
      console.error('Error:', err);
      setMarkets((prev) =>
        prev.map((m) => (m.id === marketId ? { ...m, automation_enabled: !newStatus } : m))
      );
    }
  };

  const toggleSdrAutomation = async (sdrName: string) => {
    try {
      const response = await fetch(`${SERVER_URL}/api/users/by-name/${encodeURIComponent(sdrName)}`, {
        headers: { 'ngrok-skip-browser-warning': 'true' },
      });
      const users = await response.json();
      
      if (!users || users.length === 0) return;
      
      const user = users[0];
      const newStatus = !user.automation_enabled;
      
      // Actualizar estado local
      setStats((prev: any) => ({
        ...prev,
        sdrWorkloadData: prev.sdrWorkloadData.map((sdr: any) => 
          sdr.name === sdrName ? { ...sdr, automation_enabled: newStatus } : sdr
        )
      }));
      
      // Actualizar en BD
      await fetch(`${SERVER_URL}/api/users/${user.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({ automation_enabled: newStatus }),
      });
      
      // Refrescar datos
      fetchStats();
    } catch (err) {
      console.error('Error al cambiar automatización:', err);
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-5 p-5 max-w-7xl mx-auto w-full">
      {/* Cabecera */}
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Stock Control</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Panel de control y automatización de distribución de leads
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Botón Global */}
          <button
  type="button"
  onClick={toggleGlobalAutomation}
  className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all shadow-sm flex-shrink-0 cursor-pointer ${
    globalAutomation
      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25'
      : 'bg-rose-500/15 border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-500/25'
  }`}
>
  <svg
    className={`w-4 h-4 transition-transform ${globalAutomation ? 'animate-spin text-emerald-500' : 'text-rose-500'}`}
    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
  <span>{globalAutomation ? 'Automatización: ON' : 'Automatización: OFF'}</span>
</button>

          {/* Botones de Mercado */}
          <div className="flex items-center gap-2">
            {markets.map((market) => {
  const isEnabled = market.automation_enabled;
  const isMarketActive = globalAutomation && isEnabled;
  const flagCode = MARKET_FLAG_CODES[market.id];

  return (
    <button
      key={market.id}
      type="button"
      onClick={() => toggleMarketAutomation(market.id)}
      disabled={!globalAutomation}
      title={`${market.name}: ${isEnabled ? 'ON' : 'OFF'}`}
      aria-label={`Toggle automation for ${market.name}`}
      className={`flex items-center gap-1.5 p-2 rounded-lg border transition-all shadow-sm flex-shrink-0 ${
        !globalAutomation
          ? 'bg-rose-500/15 border-rose-500/40 text-rose-600 dark:text-rose-400 cursor-not-allowed opacity-60'
          : isEnabled
          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25 cursor-pointer'
          : 'bg-rose-500/15 border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-500/25 cursor-pointer'
      }`}
    >
      {flagCode ? (
        <img 
          src={`https://flagcdn.com/w40/${flagCode}.png`}
          alt={`${market.name} flag`}
          className="w-6 h-4 object-cover rounded-sm"
        />
      ) : (
        <div className="w-6 h-4 bg-muted border border-border rounded-sm flex items-center justify-center text-[10px] font-bold text-muted-foreground leading-none">
          ?
        </div>
      )}
      <svg
        className={`w-4 h-4 transition-transform ${
          isMarketActive ? 'animate-spin' : ''
        } ${!globalAutomation || !isEnabled ? 'text-rose-500' : 'text-emerald-500'}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    </button>
  );
})}
          </div>

          {/* Separador + Recargar + SiteHeader */}
          <div className="flex items-center border-l border-border pl-3 h-9 flex-shrink-0 gap-2">
            <button
              type="button"
              onClick={fetchStats}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-medium hover:bg-muted transition-colors shadow-sm disabled:opacity-50"
              title="Recargar estadísticas"
            >
              <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Recargar
            </button>
            <SiteHeader />
          </div>
        </div>
      </header>

      {/* Primera fila */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Métricas Principales */}
        <div className="p-5 rounded-xl border border-border bg-card shadow-sm sm:col-span-2">
          <h3 className="text-sm font-semibold tracking-tight mb-4 text-foreground">Métricas Principales</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Vivos</p>
              <p className="text-2xl font-bold text-foreground">{stats.totalLeadsVivos}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">En Pool</p>
              <p className="text-2xl font-bold text-foreground">{stats.leadsEnPool}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Score Prom.</p>
              <p className="text-2xl font-bold text-foreground">{stats.scorePromedio}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">% Calificados</p>
              <p className="text-2xl font-bold text-foreground">{stats.porcentajeCalificados}%</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Inbound Vivos</p>
              <p className="text-2xl font-bold text-foreground">{stats.inboundVivos ?? 0}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Outbound Vivos</p>
              <p className="text-2xl font-bold text-foreground">{stats.outboundVivos ?? 0}</p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground font-medium mb-2">Pipeline</p>
            <div className="flex gap-6">
              {stats.pipelineData?.map((p: any) => (
                <div key={p.name} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/50" />
                  <span className="text-xs text-muted-foreground">{p.name}</span>
                  <span className="text-sm font-semibold text-foreground">{p.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Leads por Mercado */}
<div className="p-5 rounded-xl border border-border bg-card shadow-sm">
  <h3 className="text-sm font-semibold tracking-tight mb-2 text-foreground">Leads por Mercado</h3>
  <ResponsiveContainer width="100%" height={180}>
    <BarChart data={stats.marketStackedData} layout="vertical" margin={{ left: 10, right: 10 }}>
      <XAxis type="number" hide />
      <YAxis 
        dataKey="name" 
        type="category" 
        interval={0}
        tick={({ x, y, payload }: any) => {
          const item = stats.marketStackedData?.find((m: any) => m.name === payload.value);
          const code = item?.flagCode ? String(item.flagCode).toLowerCase() : null;
          return (
            <g transform={`translate(${x - 30}, ${y - 8})`}>
              {code ? (
                <image href={`https://flagcdn.com/w40/${code}.png`} x={0} y={0} width={22} height={15} preserveAspectRatio="xMidYMid slice" />
              ) : (
                <g>
                  <rect width={22} height={15} rx={2} fill="var(--muted)" stroke="var(--border)" strokeWidth={1} />
                  <text x={11} y={11} textAnchor="middle" fontSize={10} fontWeight="bold" fill="var(--muted-foreground)">?</text>
                </g>
              )}
            </g>
          );
        }}
        axisLine={false} 
        tickLine={false} 
        width={38} 
      />
      <Tooltip content={<MarketTooltip marketData={stats.marketStackedData} />} cursor={{ fill: 'transparent' }} />
      <Bar dataKey="asignados" stackId="a" fill="#10b981" name="Asignados" barSize={18} />
      <Bar dataKey="enPool" stackId="a" fill="#f97316" name="En Pool" barSize={18} radius={[0, 4, 4, 0]} />
    </BarChart>
  </ResponsiveContainer>
  <div className="flex justify-center gap-3 mt-2">
    <span className="text-[11px] font-medium flex items-center gap-1.5 text-muted-foreground">
      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#10b981' }} /> Asig.
    </span>
    <span className="text-[11px] font-medium flex items-center gap-1.5 text-muted-foreground">
      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#f97316' }} /> Pool
    </span>
  </div>
</div>

        {/* Estados */}
        <div className="p-5 rounded-xl border border-border bg-card shadow-sm">
          <h3 className="text-sm font-semibold tracking-tight mb-2 text-foreground">Estados</h3>
          <div className="flex gap-4 h-[180px]">
            <div className="flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.stateData}>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 'bold', fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} interval={0} />
                  <YAxis hide />
                  <Tooltip content={<StateTooltip />} cursor={{ fill: 'transparent' }} />
                  <Bar dataKey="value" name="Leads" radius={[4, 4, 0, 0]} barSize={18}>
                    {stats.stateData.map((_: any, i: number) => (
                      <Cell key={i} fill={[CHART_COLORS.primary, CHART_COLORS.secondary, CHART_COLORS.accent, CHART_COLORS.info, CHART_COLORS.danger][i % 5]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col justify-center gap-2">
              {stats.stateData.map((s: any) => (
                <div key={s.name} className="flex items-center justify-between gap-3">
                  <span className="text-[11px] text-muted-foreground font-medium">{STATE_FULL_MAP[s.name] || s.name}</span>
                  <span className="text-sm font-semibold text-foreground">{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Segunda fila */}
      <section className="grid grid-cols-1 sm:grid-cols-4 gap-5">
     {/* Carga por SDR */}
<div className="p-5 rounded-xl border border-border bg-card shadow-sm sm:col-span-3 order-2 sm:order-1">
  <h3 className="text-sm font-semibold tracking-tight mb-2 text-foreground">Carga por SDR</h3>
  {stats.sdrWorkloadData && stats.sdrWorkloadData.length > 0 ? (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2">
      {stats.sdrWorkloadData.map((sdr: any, i: number) => (
        <div key={i} className="flex items-center gap-1 text-xs">
          <span className="w-14 font-medium truncate text-right text-foreground">{sdr.name}</span>
          
          {/* Barra y números PEGADOS */}
          <div className="flex-1 flex items-center gap-1 min-w-0">
            <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden flex">
              <div
                className="h-full bg-muted-foreground/50 transition-all"
                style={{ width: `${Math.min((sdr.cargaNormal / Math.max(sdr.maxStock, 1)) * 100, 100)}%` }}
              />
              {sdr.sobrecarga > 0 && (
                <div
                  className="h-full bg-destructive transition-all"
                  style={{ width: `${(sdr.sobrecarga / Math.max(sdr.maxStock, 1)) * 100}%` }}
                />
              )}
            </div>
            <span className="font-mono text-[11px] whitespace-nowrap shrink-0">
              <span className="text-foreground font-semibold">{sdr.cargaNormal}</span>
              {sdr.sobrecarga > 0 && (
                <span className="text-destructive font-semibold">+{sdr.sobrecarga}</span>
              )}
              <span className="text-muted-foreground">/{sdr.maxStock}</span>
            </span>
          </div>

          {/* Botón de automatización a la derecha */}
          <button
            onClick={() => toggleSdrAutomation(sdr.name)}
            className={`shrink-0 p-1 rounded-full border transition-all ${
              sdr.automation_enabled 
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/20'
                : 'bg-rose-500/10 border-rose-500/40 text-rose-500 hover:bg-rose-500/20'
            }`}
            title={`${sdr.automation_enabled ? 'Autom. ON' : 'Autom. OFF'} - Click para cambiar`}
          >
            <svg 
              className={`w-3 h-3 transition-transform ${sdr.automation_enabled ? 'animate-spin' : ''}`} 
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  ) : (
    <div className="flex items-center justify-center h-[170px] text-sm text-muted-foreground">
      No hay datos de carga por SDR disponibles
    </div>
  )}
</div>

        {/* Gestión de Usuarios */}
        <div className="flex flex-col gap-3 order-1 sm:order-2">
          <Link
            href="/stock-control/users"
            className="p-4 rounded-xl border border-border bg-card hover:bg-muted/50 transition-all shadow-sm group flex flex-col items-center justify-center gap-2 flex-1"
          >
            <span className="text-2xl text-foreground">👥</span>
            <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors text-center">Gestión de Usuarios</h3>
            <p className="text-[10px] text-muted-foreground text-center">Límites y estadísticas</p>
            <span className="text-xs font-medium text-muted-foreground group-hover:text-primary transition-colors">Ver Métricas →</span>
          </Link>
        </div>
      </section>
    </div>
  );
}