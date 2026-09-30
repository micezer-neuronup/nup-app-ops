'use client';

import type { SdrWorkloadItem } from '@/lib/stock-control/types';

interface Props {
  sdrData: SdrWorkloadItem[];
  onToggleAutomation: (sdrName: string) => void;
}

export function SdrWorkload({ sdrData, onToggleAutomation }: Props) {
  return (
    <div className="p-5 rounded-xl border border-border bg-card shadow-sm sm:col-span-3 order-2 sm:order-1">
      <h3 className="text-sm font-semibold tracking-tight mb-2 text-foreground">Carga por SDR</h3>
      {sdrData && sdrData.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2">
          {sdrData.map((sdr, i) => (
            <div key={i} className="flex items-center gap-1 text-xs">
              <span className="w-14 font-medium truncate text-right text-foreground">
                {sdr.name}
              </span>

              <div className="flex-1 flex items-center gap-1 min-w-0">
                <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden flex">
                  <div
                    className="h-full bg-muted-foreground/50 transition-all"
                    style={{
                      width: `${Math.min((sdr.cargaNormal / Math.max(sdr.maxStock, 1)) * 100, 100)}%`,
                    }}
                  />
                  {sdr.sobrecarga > 0 && (
                    <div
                      className="h-full bg-destructive transition-all"
                      style={{
                        width: `${(sdr.sobrecarga / Math.max(sdr.maxStock, 1)) * 100}%`,
                      }}
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

              <button
                onClick={() => onToggleAutomation(sdr.name)}
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
  );
}