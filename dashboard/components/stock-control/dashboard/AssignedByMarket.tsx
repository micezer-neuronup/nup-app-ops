'use client';

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LabelList,
} from 'recharts';
import { CHART_COLORS } from '@/lib/stock-control/constants';
import { MarketFlag } from '@/components/stock-control/shared/MarketFlag';
import { RotateButton } from '../shared/RotateButton';
import type { ViewMode } from '@/lib/stock-control/types';

interface Row {
  name: string;
  flagCode: string;
  mm: number;
  ent: number;
  in: number;
  out: number;
  total: number;
  pct: number;
}

interface Props {
  rows: Row[];
  total: number;
  view: ViewMode;
  setView: (v: ViewMode) => void;
  autoRotate: boolean;
  onToggleAutoRotate: () => void;
}

const MARKET_COLORS: Record<string, string> = {
  'España':            '#f59e0b',
  'Brasil - Portugal': '#10b981',
  'Francia':           '#3b82f6',
  'LATAM':             '#84cc16',
  'Italia':            '#ef4444',
  'USA':               '#6366f1',
};

export function AssignedByMarket({
  rows: rawRows,
  total,
  view,
  setView,
  autoRotate,
  onToggleAutoRotate,
}: Props) {
  const rows = rawRows.map((r) => ({
    ...r,
    totalLabel: r.total > 0 ? String(r.total) : '',
    inoutTotalLabel: r.in + r.out > 0 ? String(r.in + r.out) : '',
  }));

  const pieData = rows.filter((r) => r.total > 0);
  const totalMM = rows.reduce((acc, r) => acc + r.mm, 0);
  const totalENT = rows.reduce((acc, r) => acc + r.ent, 0);
  const totalIN = rows.reduce((acc, r) => acc + r.in, 0);
  const totalOUT = rows.reduce((acc, r) => acc + r.out, 0);

  const goPrev = () =>
    setView(
      view === 'pie' ? 'inout'
      : view === 'inout' ? 'barras'
      : view === 'barras' ? 'tabla'
      : 'pie'
    );

  const goNext = () =>
    setView(
      view === 'tabla' ? 'barras'
      : view === 'barras' ? 'inout'
      : view === 'inout' ? 'pie'
      : 'tabla'
    );

  return (
    <div className="p-5 rounded-xl border border-border bg-card shadow-sm relative">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">Asignados por Mercado</h3>
        <RotateButton autoRotate={autoRotate} onToggle={onToggleAutoRotate} />
      </div>

      <button
        onClick={goPrev}
        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 w-7 h-7 rounded-full border border-border bg-card shadow-sm hover:bg-muted transition-colors flex items-center justify-center text-muted-foreground hover:text-foreground"
        title="Vista anterior"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <button
        onClick={goNext}
        className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10 w-7 h-7 rounded-full border border-border bg-card shadow-sm hover:bg-muted transition-colors flex items-center justify-center text-muted-foreground hover:text-foreground"
        title="Vista siguiente"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      <div className="min-w-0">
        {/* ─── Vista TABLA ─── */}
        {view === 'tabla' && (
          <div className="space-y-1">
            <div className="grid grid-cols-8 gap-1.5 text-[10px] text-muted-foreground font-bold uppercase tracking-wider border-b border-border pb-1 mb-1">
              <span className="col-span-2"></span>
              <span className="text-center">MM</span>
              <span className="text-center">ENT</span>
              <span className="text-center">In</span>
              <span className="text-center">Out</span>
              <span className="text-center">Tot</span>
              <span className="text-right">%</span>
            </div>
            {rows.map((row) => (
              <div key={row.name} className="grid grid-cols-8 gap-1.5 items-center py-1.5 border-b border-border/50 last:border-0">
                <div className="col-span-2">
                  <MarketFlag marketName={row.name} width={20} height={14} />
                </div>
                <span className="text-center text-xs font-semibold text-indigo-500">{row.mm}</span>
                <span className="text-center text-xs font-semibold text-emerald-500">{row.ent}</span>
                <span className="text-center text-xs font-semibold text-blue-500">{row.in}</span>
                <span className="text-center text-xs font-semibold text-orange-500">{row.out}</span>
                <span className="text-center text-xs font-bold text-foreground">{row.total}</span>
                <span className="text-right text-xs font-semibold text-muted-foreground">{row.pct}%</span>
              </div>
            ))}
          </div>
        )}

        {/* ─── Vista BARRAS (MM/ENT) ─── */}
        {view === 'barras' && (
          <div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 40 }}>
                <XAxis type="number" hide />
                <YAxis
                  dataKey="name"
                  type="category"
                  interval={0}
                  tick={({ x, y, payload }: any) => (
                    <foreignObject x={x - 24} y={y - 7} width={20} height={14}>
                      <MarketFlag marketName={payload.value} width={20} height={14} />
                    </foreignObject>
                  )}
                  axisLine={false}
                  tickLine={false}
                  width={32}
                />
                <Tooltip
                  content={({ active, payload, label }: any) => {
                    if (!active || !payload?.length) return null;
                    const item = payload[0]?.payload;
                    return (
                      <div className="bg-card border border-border rounded-lg shadow-md p-3 text-sm">
                        <p className="font-semibold mb-2 text-foreground border-b pb-1">
                          {label} — {item.total} ({item.pct}%)
                        </p>
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#6366f1' }} />
                              <span className="text-muted-foreground">MM</span>
                            </div>
                            <span className="font-semibold text-foreground">{item.mm}</span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#10b981' }} />
                              <span className="text-muted-foreground">ENT</span>
                            </div>
                            <span className="font-semibold text-foreground">{item.ent}</span>
                          </div>
                        </div>
                      </div>
                    );
                  }}
                  cursor={{ fill: 'transparent' }}
                />
                <Bar dataKey="mm" stackId="a" fill="#6366f1" name="MM" barSize={18} />
                <Bar dataKey="ent" stackId="a" fill="#10b981" name="ENT" barSize={18} radius={[0, 4, 4, 0]}>
                  <LabelList
                    dataKey="totalLabel"
                    position="right"
                    style={{ fontSize: 11, fontWeight: 'bold', fill: 'var(--foreground)' }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            <div className="flex justify-center gap-6 mt-2 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#6366f1' }} />
                <span className="text-muted-foreground">MM</span>
                <span className="font-bold text-foreground">{totalMM}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#10b981' }} />
                <span className="text-muted-foreground">ENT</span>
                <span className="font-bold text-foreground">{totalENT}</span>
              </span>
            </div>
          </div>
        )}

        {/* ─── Vista IN/OUT ─── */}
        {view === 'inout' && (
          <div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 40 }}>
                <XAxis type="number" hide />
                <YAxis
                  dataKey="name"
                  type="category"
                  interval={0}
                  tick={({ x, y, payload }: any) => (
                    <foreignObject x={x - 24} y={y - 7} width={20} height={14}>
                      <MarketFlag marketName={payload.value} width={20} height={14} />
                    </foreignObject>
                  )}
                  axisLine={false}
                  tickLine={false}
                  width={32}
                />
                <Tooltip
                  content={({ active, payload, label }: any) => {
                    if (!active || !payload?.length) return null;
                    const item = payload[0]?.payload;
                    const t = item.in + item.out;
                    return (
                      <div className="bg-card border border-border rounded-lg shadow-md p-3 text-sm">
                        <p className="font-semibold mb-2 text-foreground border-b pb-1">
                          {label} — {t}
                        </p>
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#3b82f6' }} />
                              <span className="text-muted-foreground">Inbound</span>
                            </div>
                            <span className="font-semibold text-foreground">{item.in}</span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#f97316' }} />
                              <span className="text-muted-foreground">Outbound</span>
                            </div>
                            <span className="font-semibold text-foreground">{item.out}</span>
                          </div>
                        </div>
                      </div>
                    );
                  }}
                  cursor={{ fill: 'transparent' }}
                />
                <Bar dataKey="in" stackId="a" fill="#3b82f6" name="Inbound" barSize={18} />
                <Bar dataKey="out" stackId="a" fill="#f97316" name="Outbound" barSize={18} radius={[0, 4, 4, 0]}>
                  <LabelList
                    dataKey="inoutTotalLabel"
                    position="right"
                    style={{ fontSize: 11, fontWeight: 'bold', fill: 'var(--foreground)' }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            <div className="flex justify-center gap-6 mt-2 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#3b82f6' }} />
                <span className="text-muted-foreground">Inbound</span>
                <span className="font-bold text-foreground">{totalIN}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#f97316' }} />
                <span className="text-muted-foreground">Outbound</span>
                <span className="font-bold text-foreground">{totalOUT}</span>
              </span>
            </div>
          </div>
        )}

        {/* ─── Vista PIE ─── */}
        {view === 'pie' && (
          <div className="flex justify-center">
            <PieChart width={260} height={200}>
              <Pie
                data={pieData}
                dataKey="total"
                nameKey="name"
                cx="50%"
                cy="45%"
                innerRadius={32}
                outerRadius={55}
                paddingAngle={2}
                stroke="none"
                labelLine={false}
                isAnimationActive={false}
                label={(props: any) => {
                  const { cx, cy, midAngle, outerRadius, index } = props;
                  const RADIAN = Math.PI / 180;
                  const radius = outerRadius + 20;
                  const x = cx + radius * Math.cos(-midAngle * RADIAN);
                  const y = cy + radius * Math.sin(-midAngle * RADIAN);
                  const row = pieData[index];
                  const flagCode = row?.flagCode;
                  const color = MARKET_COLORS[row?.name] || CHART_COLORS.primary;

                  return (
                    <g>
                      <line
                        x1={cx + outerRadius * Math.cos(-midAngle * RADIAN)}
                        y1={cy + outerRadius * Math.sin(-midAngle * RADIAN)}
                        x2={x}
                        y2={y}
                        stroke={color}
                        strokeWidth={1}
                      />
                      {flagCode && (
                        <image
                          href={`https://flagcdn.com/w40/${flagCode}.png`}
                          x={x - 9}
                          y={y - 6}
                          width={18}
                          height={12}
                          preserveAspectRatio="xMidYMid slice"
                        />
                      )}
                    </g>
                  );
                }}
              >
                {pieData.map((row, i) => (
                  <Cell key={i} fill={MARKET_COLORS[row.name] || CHART_COLORS.primary} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }: any) => {
                  if (!active || !payload?.length) return null;
                  const item = payload[0]?.payload;
                  return (
                    <div className="bg-card border border-border rounded-lg shadow-md p-3 text-sm">
                      <p className="font-semibold text-foreground border-b pb-1 mb-2">{item.name}</p>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">Total</span>
                        <span className="font-semibold text-foreground">{item.total} ({item.pct}%)</span>
                      </div>
                    </div>
                  );
                }}
              />
            </PieChart>
          </div>
        )}
      </div>
    </div>
  );
}