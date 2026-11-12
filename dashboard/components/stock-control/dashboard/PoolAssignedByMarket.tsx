'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LabelList,
} from 'recharts';
import { CHART_COLORS } from '@/lib/stock-control/constants';
import { MarketFlag } from '@/components/stock-control/shared/MarketFlag';
import { RotateButton } from '../shared/RotateButton';
import { nextView, prevView } from '@/lib/hooks/useAutoRotate';
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
  huecos?: number;
}

interface Props {
  title: string;
  rows: Row[];
  /** Adds a "Huecos" column to the table (free slots of active SDRs per market) */
  showHuecos?: boolean;
  view: ViewMode;
  setView: (v: ViewMode) => void;
  autoRotate: boolean;
  onToggleAutoRotate: () => void;
}

interface Series {
  key: 'mm' | 'ent' | 'in' | 'out';
  label: string;
  color: string;
}

const MARKET_COLORS: Record<string, string> = {
  'España':            '#f59e0b',
  'Brasil - Portugal': '#10b981',
  'Francia':           '#3b82f6',
  'LATAM':             '#84cc16',
  'Italia':            '#ef4444',
  'USA':               '#6366f1',
};

type Direction = 'next' | 'prev';

const variants = {
  enter: (dir: Direction) => ({
    x: dir === 'next' ? 40 : -40,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (dir: Direction) => ({
    x: dir === 'next' ? -40 : 40,
    opacity: 0,
  }),
};

// ────── Function: StackedBars ─────────────────────────────────────────────
// ─── One horizontal bar per market, stacking two series (MM/ENT or In/Out)
// ─── Total at the end of each bar, tooltip per market and legend with totals
// ──────────────────────────────────────────────────────────────────────────
function StackedBars({
  rows,
  series: [a, b],
  titleOf,
}: {
  rows: Row[];
  series: [Series, Series];
  titleOf: (row: Row) => string;
}) {
  // The total is drawn at the end of the last non-empty segment (Recharts skips labels on zero-width segments)
  const data = rows.map((r) => {
    const total = r[a.key] + r[b.key];
    return {
      ...r,
      labelA: r[b.key] === 0 ? String(total) : '',
      labelB: r[b.key] > 0 ? String(total) : '',
    };
  });
  const totalOf = (s: Series) => rows.reduce((acc, r) => acc + r[s.key], 0);

  return (
    <div>
      <ResponsiveContainer width="100%" height={165}>
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 40 }}>
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
            content={({ active, payload }: any) => {
              if (!active || !payload?.length) return null;
              const item = payload[0]?.payload;
              return (
                <div className="bg-card border border-border rounded-lg shadow-md p-3 text-sm">
                  <p className="font-semibold mb-2 text-foreground border-b pb-1">{titleOf(item)}</p>
                  <div className="flex flex-col gap-1.5">
                    {[a, b].map((s) => (
                      <div key={s.key} className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                          <span className="text-muted-foreground">{s.label}</span>
                        </div>
                        <span className="font-semibold text-foreground">{item[s.key]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }}
            cursor={{ fill: 'transparent' }}
          />
          <Bar dataKey={a.key} stackId="a" fill={a.color} name={a.label} barSize={18} minPointSize={1} isAnimationActive={false}>
            <LabelList dataKey="labelA" position="right" style={{ fontSize: 11, fontWeight: 'bold', fill: 'var(--foreground)' }} />
          </Bar>
          <Bar dataKey={b.key} stackId="a" fill={b.color} name={b.label} barSize={18} radius={[0, 4, 4, 0]} isAnimationActive={false}>
            <LabelList dataKey="labelB" position="right" style={{ fontSize: 11, fontWeight: 'bold', fill: 'var(--foreground)' }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="flex justify-center gap-6 mt-1 text-xs">
        {[a, b].map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="text-muted-foreground">{s.label}</span>
            <span className="font-bold text-foreground">{totalOf(s)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function PoolAssignedByMarket({
  title,
  rows,
  showHuecos = false,
  view,
  setView,
  autoRotate,
  onToggleAutoRotate,
}: Props) {
  const [direction, setDirection] = useState<Direction>('next');
  const pieData = rows.filter((r) => r.total > 0);

  const goPrev = () => {
    setDirection('prev');
    setView(prevView(view));
  };

  const goNext = () => {
    setDirection('next');
    setView(nextView(view));
  };

  return (
    <div className="p-4 rounded-xl border border-border bg-card shadow-sm relative h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
        <RotateButton autoRotate={autoRotate} onToggle={onToggleAutoRotate} />
      </div>

      <button
        onClick={goPrev}
        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 w-7 h-7 rounded-full border border-border bg-card shadow-sm hover:bg-muted transition-colors flex items-center justify-center text-muted-foreground hover:text-foreground"
        title="Vista anterior"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>

      <button
        onClick={goNext}
        className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10 w-7 h-7 rounded-full border border-border bg-card shadow-sm hover:bg-muted transition-colors flex items-center justify-center text-muted-foreground hover:text-foreground"
        title="Vista siguiente"
      >
        <ChevronRight className="w-3.5 h-3.5" />
      </button>

      {/* Fixed height: every view uses the same space, so rotating never resizes the row */}
      <div className="min-w-0 relative overflow-hidden h-[190px]">
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.div
            key={view}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* ─── Vista TABLA ─── */}
            {view === 'tabla' && (
              <div className="space-y-1">
                <div className={`grid ${showHuecos ? 'grid-cols-9' : 'grid-cols-8'} gap-1.5 text-[10px] text-muted-foreground font-bold uppercase tracking-wider border-b border-border pb-1 mb-1`}>
                  <span className="col-span-2"></span>
                  <span className="text-center">MM</span>
                  <span className="text-center">ENT</span>
                  <span className="text-center">In</span>
                  <span className="text-center">Out</span>
                  <span className="text-center">Tot</span>
                  <span className="text-right">%</span>
                  {showHuecos && (
                    <span className="text-right" title="Huecos libres de los SDR activos en este mercado">
                      Huecos
                    </span>
                  )}
                </div>
                {rows.map((row) => (
                  <div key={row.name} className={`grid ${showHuecos ? 'grid-cols-9' : 'grid-cols-8'} gap-1.5 items-center py-1 border-b border-border/50 last:border-0`}>
                    <div className="col-span-2">
                      <MarketFlag marketName={row.name} width={20} height={14} />
                    </div>
                    <span className="text-center text-xs font-semibold text-indigo-500">{row.mm}</span>
                    <span className="text-center text-xs font-semibold text-emerald-500">{row.ent}</span>
                    <span className="text-center text-xs font-semibold text-blue-500">{row.in}</span>
                    <span className="text-center text-xs font-semibold text-orange-500">{row.out}</span>
                    <span className="text-center text-xs font-bold text-foreground">{row.total}</span>
                    <span className="text-right text-xs font-semibold text-muted-foreground">{row.pct}%</span>
                    {showHuecos && (
                      <span
                        className={`text-right text-xs font-semibold ${
                          (row.huecos ?? 0) > row.total ? 'text-rose-500' : 'text-muted-foreground'
                        }`}
                        title={(row.huecos ?? 0) > row.total ? 'Hay menos leads en el pool que huecos libres' : undefined}
                      >
                        {row.huecos ?? 0}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ─── Vista BARRAS (MM/ENT) ─── */}
            {view === 'barras' && (
              <StackedBars
                rows={rows}
                series={[
                  { key: 'mm', label: 'MM', color: '#6366f1' },
                  { key: 'ent', label: 'ENT', color: '#10b981' },
                ]}
                titleOf={(r) => `${r.name} — ${r.total} (${r.pct}%)`}
              />
            )}

            {/* ─── Vista IN/OUT ─── */}
            {view === 'inout' && (
              <StackedBars
                rows={rows}
                series={[
                  { key: 'in', label: 'Inbound', color: '#3b82f6' },
                  { key: 'out', label: 'Outbound', color: '#f97316' },
                ]}
                titleOf={(r) => `${r.name} — ${r.in + r.out}`}
              />
            )}

            {/* ─── Vista PIE ─── */}
            {view === 'pie' && (
              <div className="flex justify-center">
                <PieChart width={240} height={175}>
                  <Pie
                    data={pieData}
                    dataKey="total"
                    nameKey="name"
                    cx="50%"
                    cy="45%"
                    innerRadius={30}
                    outerRadius={50}
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
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
