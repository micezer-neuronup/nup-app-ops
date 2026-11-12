import { useEffect } from 'react';
import type { ViewMode } from '@/lib/stock-control/types';

// Order of the views in the Pool / Asignados cards
const VIEW_ORDER: ViewMode[] = ['tabla', 'barras', 'inout', 'pie'];

export function nextView(view: ViewMode): ViewMode {
  return VIEW_ORDER[(VIEW_ORDER.indexOf(view) + 1) % VIEW_ORDER.length];
}

export function prevView(view: ViewMode): ViewMode {
  return VIEW_ORDER[(VIEW_ORDER.indexOf(view) + VIEW_ORDER.length - 1) % VIEW_ORDER.length];
}

export function useAutoRotate(
  enabled: boolean,
  currentView: ViewMode,
  setView: (v: ViewMode) => void,
  intervalMs: number = 10000
) {
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setView(nextView(currentView)), intervalMs);
    return () => clearInterval(id);
  }, [enabled, currentView, setView, intervalMs]);
}
