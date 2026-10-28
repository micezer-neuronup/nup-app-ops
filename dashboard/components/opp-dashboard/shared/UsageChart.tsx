"use client";

import { useEffect, useMemo, useState } from "react";
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || "";

export interface UsagePoint {
  date: string; // YYYY-MM-DD
  tests: number;
  recent: boolean; // últimos 30 días (los que cuentan como "recientes" en la tendencia)
}

// Fecha local en YYYY-MM-DD, para casar created_at con el eje
const toDayKey = (d: string) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};

const fmtDay = (key: string) =>
  new Date(`${key}T00:00:00`).toLocaleDateString("es", { day: "numeric", month: "short" });

function UsageTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as UsagePoint;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md">
      <span className="font-semibold">{fmtDay(p.date)}</span>
      <span className="text-foreground/70"> · {p.tests} {p.tests === 1 ? "test" : "tests"}</span>
    </div>
  );
}

// Tests por día de los últimos 60 días del centro (GET /api/opportunities/:id/usage)
export function UsageChart({ opportunityId, detectedAt }: { opportunityId: number; detectedAt?: string }) {
  const [data, setData] = useState<UsagePoint[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(false);
    fetch(`${SERVER_URL}/api/opportunities/${opportunityId}/usage`, {
      headers: { "ngrok-skip-browser-warning": "true" },
    })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((rows: UsagePoint[]) => !cancelled && setData(rows))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [opportunityId]);

  const detectedKey = detectedAt ? toDayKey(detectedAt) : null;
  const showDetected = !!detectedKey && !!data?.some((p) => p.date === detectedKey);

  const summary = useMemo(() => {
    if (!data) return "";
    const recent = data.filter((p) => p.recent).reduce((s, p) => s + p.tests, 0);
    const previous = data.filter((p) => !p.recent).reduce((s, p) => s + p.tests, 0);
    const days = data.filter((p) => p.tests > 0).length;
    return `${recent + previous} tests en 60 días, ${days} días con uso. Últimos 30 días: ${recent}; 30 días anteriores: ${previous}.`;
  }, [data]);

  if (error) {
    return <p className="text-sm text-foreground/60 py-6 text-center">No se pudo cargar la actividad.</p>;
  }
  if (!data) {
    return <div className="h-[180px] rounded-md bg-muted/40 animate-pulse" aria-label="Cargando actividad" />;
  }
  if (!data.some((p) => p.tests > 0)) {
    return <p className="text-sm text-foreground/60 py-6 text-center">Sin actividad registrada.</p>;
  }

  // Dos líneas: 30 días anteriores (gris) y últimos 30 (marca). El último punto anterior se repite
  // en la línea reciente para que las dos queden unidas sin hueco.
  const firstRecent = data.findIndex((p) => p.recent);
  const lines = data.map((p, i) => ({
    ...p,
    previous: p.recent ? null : p.tests,
    recentTests: p.recent || i === firstRecent - 1 ? p.tests : null,
  }));

  const n = data.length;
  const xTicks = [data[0].date, data[Math.floor(n / 2)].date, data[n - 1].date];
  const axisTick = { fill: "var(--muted-foreground)", fontSize: 12 };

  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0">
      <div className="flex-1 min-h-[180px] text-[#0091ad] dark:text-[#00a4c2]" role="img" aria-label={summary}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={lines} margin={{ top: 16, right: 22, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="date"
              ticks={xTicks}
              tickFormatter={fmtDay}
              tick={axisTick}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              interval={0}
            />
            <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} width={28} />
            <Tooltip
              content={<UsageTooltip />}
              cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1, strokeDasharray: "4 4" }}
            />
            {showDetected && (
              <ReferenceLine
                x={detectedKey!}
                stroke="var(--muted-foreground)"
                strokeDasharray="4 4"
                label={{ value: "Detectada", position: "top", fill: "var(--muted-foreground)", fontSize: 12 }}
              />
            )}
            <Line
              dataKey="previous"
              type="monotone"
              stroke="var(--muted-foreground)"
              strokeOpacity={0.6}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "var(--muted-foreground)", stroke: "var(--card)", strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              dataKey="recentTests"
              type="monotone"
              stroke="currentColor"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "currentColor", stroke: "var(--card)", strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="flex items-center gap-4 text-xs text-foreground/60">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full bg-foreground/35" aria-hidden />
          30 días anteriores
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full bg-[#0091ad] dark:bg-[#00a4c2]" aria-hidden />
          Últimos 30 días
        </span>
      </p>

      {/* Versión en tabla para lectores de pantalla */}
      <table className="sr-only">
        <caption>Tests por día, últimos 60 días</caption>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Tests</th>
          </tr>
        </thead>
        <tbody>
          {data.map((p) => (
            <tr key={p.date}>
              <td>{fmtDay(p.date)}</td>
              <td>{p.tests}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
