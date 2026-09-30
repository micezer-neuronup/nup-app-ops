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
        : currentView === 'barras' ? 'inout'
        : currentView === 'inout' ? 'pie'
        : 'tabla'
      );
    }, intervalMs);
    return () => clearInterval(id);
  }, [enabled, currentView, setView, intervalMs]);
}