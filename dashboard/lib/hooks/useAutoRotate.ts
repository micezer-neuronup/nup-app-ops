import { useEffect } from 'react';
import type { ViewMode } from '@/lib/stock-control/types';

export function useAutoRotate(
  enabled: boolean,
  currentView: ViewMode,
  setView: (v: ViewMode) => void,
  intervalMs: number = 10000
) {
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      setView(
        currentView === 'tabla' ? 'barras'
        : currentView === 'barras' ? 'pie'
        : 'tabla'
      );
    }, intervalMs);
    return () => clearInterval(id);
  }, [enabled, currentView, setView, intervalMs]);
}

export function nextView(v: ViewMode): ViewMode {
  return v === 'tabla' ? 'barras' : v === 'barras' ? 'pie' : 'tabla';
}