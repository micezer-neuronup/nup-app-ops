'use client';

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { CHART_COLORS, STATE_FULL_MAP } from '@/lib/stock-control/constants';
import { StateTooltip } from '@/components/stock-control/shared/Tooltips';
import type { StateItem } from '@/lib/stock-control/types';

interface Props {
  stateData: StateItem[];
}

const COLORS = [
  CHART_COLORS.primary,
  CHART_COLORS.secondary,
  CHART_COLORS.accent,
  CHART_COLORS.info,
  CHART_COLORS.danger,
];

export function StatesChart({ stateData }: Props) {
  return (
    <div className="p-5 rounded-xl border border-border bg-card shadow-sm">
      <h3 className="text-sm font-semibold tracking-tight mb-2 text-foreground">Estados</h3>
      <div className="flex gap-4 h-[180px]">
        <div className="flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stateData}>
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fontWeight: 'bold', fill: 'var(--muted-foreground)' }}
                axisLine={false}
                tickLine={false}
                interval={0}
              />
              <YAxis hide />
              <Tooltip content={<StateTooltip />} cursor={{ fill: 'transparent' }} />
              <Bar dataKey="value" name="Leads" radius={[4, 4, 0, 0]} barSize={18}>
                {stateData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-col justify-center gap-2">
          {stateData.map((s) => (
            <div key={s.name} className="flex items-center justify-between gap-3">
              <span className="text-[11px] text-muted-foreground font-medium">
                {STATE_FULL_MAP[s.name] || s.name}
              </span>
              <span className="text-sm font-semibold text-foreground">{s.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}