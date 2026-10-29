"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import {
  ArrowRight, CircleDot, Hourglass, Layers, Clock, AlertTriangle, CheckCircle2, Trophy, CalendarDays, CalendarRange,
  type LucideIcon,
  Gauge,
} from "lucide-react";
import { OPP_MODULES, type OppModule } from "./modules";
import { OppHeader } from "./shared/OppHeader";
import { Tag, TONE_STYLES, type TagTone } from "./shared/Tag";
import { reviewReasons } from "./shared/PriorityBadge";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || "";
const DAY_MS = 24 * 60 * 60 * 1000;

interface DailyPoint {
  date: Date;
  count: number;
}

interface AssessmentStats {
  daily: DailyPoint[];
  total: number;
  pending: number;
  review: number;
  expansion: number;
  reviewedOrAssigned: number;
  converted: number;
  new7d: number;
  new30d: number;
}

type StatKey = Exclude<keyof AssessmentStats, "daily">;
type StatDef = { key: StatKey; label: string; tone: TagTone; icon: LucideIcon; title?: string };

// Estado actual (mismos filtros que las columnas de OppDashboard) + nuevas por periodo
const CURRENT_STATS: StatDef[] = [
  { key: "total", label: "Total", tone: "neutral", icon: Layers },
  { key: "pending", label: "Pendientes", tone: "yellow", icon: Clock },
  { key: "review", label: "Revisar", tone: "orange", icon: AlertTriangle },
  { key: "expansion", label: "Uso alto", tone: "cyan", icon: Gauge, title: "Ya tienen test_all y están en el top de uso" },
  { key: "reviewedOrAssigned", label: "Revisadas / Asignadas", tone: "green", icon: CheckCircle2 },
  { key: "converted", label: "Convertidas", tone: "cyan", icon: Trophy },
];
const PERIOD_STATS: StatDef[] = [
  { key: "new7d", label: "7 días", title: "Creadas en los últimos 7 días", tone: "cyan", icon: CalendarDays },
  { key: "new30d", label: "30 días", title: "Creadas en los últimos 30 días", tone: "cyan", icon: CalendarRange },
];

const sectionTitle = "text-[11px] font-semibold uppercase tracking-wider text-foreground/55 shrink-0";
// Los prefijos [@media(min-height:1000px)]: recuperan los tamaños grandes en pantallas altas
const fmtDay = (d: Date) => d.toLocaleDateString("es", { day: "numeric", month: "short" });

// ---------- ESTADO ACTUAL: lista vertical ----------
function StatusList({ stats }: { stats: AssessmentStats | null }) {
  return (
    <div className="flex flex-col gap-2 min-w-0 min-h-0">
      <h3 className={sectionTitle}>Estado actual</h3>
      <ul className="flex-1 grid grid-rows-[repeat(5,minmax(2rem,1fr))] divide-y divide-border/70 rounded-md border border-border bg-muted/20">
        {CURRENT_STATS.map((d) => {
          const Icon = d.icon;
          const t = TONE_STYLES[d.tone];
          return (
            <li key={d.key} className="group/tag flex items-center justify-between gap-3 px-3 min-h-0">
              <span className={`flex items-center gap-2 min-w-0 text-[13px] [@media(min-height:1000px)]:text-sm text-foreground/75`}>
                <Icon className={`h-4 w-4 shrink-0 text-foreground/50 transition-colors ${t.hoverIcon}`} />
                <span className="truncate">{d.label}</span>
              </span>
              <span className={`text-lg [@media(min-height:1000px)]:text-xl font-bold tabular-nums text-foreground`}>{stats ? stats[d.key] : "—"}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------- NUEVAS: tile compacto ----------
function PeriodTile({ def, value }: { def: StatDef; value: number | null }) {
  const Icon = def.icon;
  const t = TONE_STYLES[def.tone];
  return (
    <div
      title={def.title}
      className={`group/tag flex flex-col justify-between rounded-md border border-border bg-muted/20 px-3.5 py-2 h-[56px] [@media(min-height:1000px)]:h-[76px] [@media(min-height:1000px)]:py-2.5 transition-colors ${t.hoverBorder}`}
    >
      <span className="flex items-center gap-2 text-[13px] font-medium text-foreground/70">
        <Icon className={`h-4 w-4 shrink-0 text-foreground/50 transition-colors ${t.hoverIcon}`} />
        {def.label}
      </span>
      <span className={`text-xl [@media(min-height:1000px)]:text-2xl font-bold leading-none tabular-nums text-foreground`}>{value ?? "—"}</span>
    </div>
  );
}

// ---------- GRÁFICO DE LÍNEA (Recharts): nuevas por día (últimos 30 días) ----------
// El color sale de currentColor para seguir el tema (#0091ad en claro, #00a4c2 en oscuro)
function ChartTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as { date: Date; count: number };
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md">
      <span className="font-semibold">{fmtDay(p.date)}</span>
      <span className="text-foreground/70"> · {p.count} {p.count === 1 ? "nueva" : "nuevas"}</span>
    </div>
  );
}

function NewOppsLine({ daily }: { daily: DailyPoint[] | null }) {
  const data = useMemo(
    () => (daily || []).map((p) => ({ ...p, label: fmtDay(p.date) })),
    [daily]
  );
  const n = data.length;
  const xTicks = n > 0 ? [data[0].label, data[Math.floor(n / 2)].label, data[n - 1].label] : [];
  const axisTick = { fill: "var(--muted-foreground)", fontSize: 11 };

  return (
    <div className="flex flex-col gap-1.5 flex-1 min-h-[110px]">
      <h3 className={sectionTitle}>Nuevas por día · últimos 30 días</h3>
      <div className="flex-1 min-h-0 text-[#0091ad] dark:text-[#00a4c2]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 22, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="label"
              ticks={xTicks}
              interval={0}
              tick={axisTick}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              tickMargin={6}
            />
            <YAxis
              allowDecimals={false}
              tickCount={3}
              width={28}
              tick={axisTick}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              content={<ChartTooltip />}
              cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1, strokeDasharray: "4 4" }}
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke="currentColor"
              strokeWidth={2}
              fill="currentColor"
              fillOpacity={0.1}
              dot={false}
              activeDot={{ r: 4, fill: "currentColor", stroke: "var(--card)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ---------- CABECERA COMÚN DE TARJETA ----------
function ModuleHeader({ mod, action }: { mod: OppModule; action?: React.ReactNode }) {
  const Icon = mod.icon;
  const isActive = mod.status === "active";
  return (
    <div className="flex items-start justify-between gap-4 shrink-0">
      <div className="flex items-start gap-4 min-w-0">
        {mod.image ? (
          <Image
            src={mod.image}
            alt={mod.title}
            width={56}
            height={56}
            className="w-11 h-11 [@media(min-height:1000px)]:w-14 [@media(min-height:1000px)]:h-14 object-contain shrink-0"
          />
        ) : (
          <span className={`inline-flex items-center justify-center w-10 h-10 [@media(min-height:1000px)]:w-12 [@media(min-height:1000px)]:h-12 rounded-lg border border-border bg-muted/40 shrink-0 ${mod.accent}`}>
            <Icon className="w-5 h-5" />
          </span>
        )}
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className={`text-xl [@media(min-height:1000px)]:text-2xl font-semibold text-foreground`}>{mod.title}</h2>
            {isActive ? (
              <Tag tone="green" icon={CircleDot} label="Activo" />
            ) : (
              <Tag tone="neutral" icon={Hourglass} label="Próximamente" />
            )}
          </div>
          <p className={`text-sm [@media(min-height:1000px)]:text-base text-foreground/70 line-clamp-2`}>{mod.description}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

const cardFrame = `flex flex-col gap-3 p-4 [@media(min-height:1000px)]:gap-6 [@media(min-height:1000px)]:p-6 rounded-xl border border-border/60 bg-card shadow-sm min-w-0`;

// ---------- ASSESSMENT ----------
function AssessmentCard({ mod, stats }: { mod: OppModule; stats: AssessmentStats | null }) {
  return (
    <section className={cardFrame}>
      <ModuleHeader
        mod={mod}
        action={
          <Link
            href={mod.href}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-md border border-border bg-muted/40 text-sm font-semibold text-foreground hover:border-[#00a4c2]/70 hover:text-[#00a4c2] transition-colors shrink-0"
          >
            Abrir módulo
            <ArrowRight className="h-4 w-4" />
          </Link>
        }
      />

      <div className={`flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-4 [@media(min-height:1000px)]:gap-6`}>
        <StatusList stats={stats} />

        <div className="flex flex-col gap-3 min-w-0 min-h-0">
          <div className="flex flex-col gap-2 shrink-0">
            <h3 className={sectionTitle}>Nuevas oportunidades</h3>
            <div className="grid grid-cols-2 gap-3">
              {PERIOD_STATS.map((d) => (
                <PeriodTile key={d.key} def={d} value={stats ? stats[d.key] : null} />
              ))}
            </div>
          </div>
          <NewOppsLine daily={stats ? stats.daily : null} />
        </div>
      </div>
    </section>
  );
}

// ---------- MÓDULOS PRÓXIMOS: solo cabecera ----------
function SoonCard({ mod }: { mod: OppModule }) {
  return (
    <Link href={mod.href} className={`${cardFrame} group hover:border-[#00a4c2]/60 transition-colors`}>
      <ModuleHeader mod={mod} />
    </Link>
  );
}

// ---------- COMPONENTE PRINCIPAL ----------
export function OppHome() {
  const [stats, setStats] = useState<AssessmentStats | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${SERVER_URL}/api/opportunities`, {
          headers: { "ngrok-skip-browser-warning": "true" },
        });
        if (!res.ok) throw new Error(`Error ${res.status}: ${res.statusText}`);
        const data: any[] = await res.json();
        const kind = (o: any) => o.opportunity_kind || "upgrade";
        const now = Date.now();
        const createdWithin = (o: any, days: number) =>
          !!o.created_at && now - new Date(o.created_at).getTime() <= days * DAY_MS;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const daily: DailyPoint[] = Array.from({ length: 30 }, (_, i) => ({
          date: new Date(today.getTime() - (29 - i) * DAY_MS),
          count: 0,
        }));
        for (const o of data) {
          if (!o.created_at) continue;
          const d = new Date(o.created_at);
          d.setHours(0, 0, 0, 0);
          const idx = 29 - Math.round((today.getTime() - d.getTime()) / DAY_MS);
          if (idx >= 0 && idx < 30) daily[idx].count++;
        }
        setStats({
          daily,
          total: data.length,
          pending: data.filter((o) => o.status === "pending" && kind(o) !== "expansion" && reviewReasons(o).length === 0).length,
          review: data.filter((o) => o.status === "pending" && kind(o) !== "expansion" && reviewReasons(o).length > 0).length,
          expansion: data.filter((o) => o.status === "pending" && kind(o) === "expansion").length,
          reviewedOrAssigned: data.filter((o) => o.status === "completed" || !!o.upsell_object).length,
          converted: data.filter((o) => o.status === "converted").length,
          new7d: data.filter((o) => createdWithin(o, 7)).length,
          new30d: data.filter((o) => createdWithin(o, 30)).length,
        });
      } catch (error) {
        console.error("Error fetching opportunity stats:", error);
      }
    };
    fetchStats();
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <OppHeader title="Oportunidades de Upsell" />

      {/* ================= CONTENIDO: 2x2, todas las tarjetas iguales ================= */}
      <main className="lg:min-h-[calc(100vh-5rem)] max-w-[1900px] mx-auto w-full px-4 md:px-6 py-4 grid grid-cols-1 lg:grid-cols-2 lg:grid-rows-[1fr_1fr] gap-4">
        {OPP_MODULES.map((mod) =>
          mod.status === "active" ? (
            <AssessmentCard key={mod.key} mod={mod} stats={stats} />
          ) : (
            <SoonCard key={mod.key} mod={mod} />
          )
        )}
      </main>
    </div>
  );
}
