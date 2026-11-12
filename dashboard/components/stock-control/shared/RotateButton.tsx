'use client';

import { RefreshCw } from 'lucide-react';

interface Props {
  autoRotate: boolean;
  onToggle: () => void;
}

export function RotateButton({ autoRotate, onToggle }: Props) {
  return (
    <button
      onClick={onToggle}
      className={`p-1.5 rounded-full border transition-colors ${
        autoRotate ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-border'
      }`}
      title={autoRotate ? 'Auto: ON' : 'Auto: OFF'}
    >
      <RefreshCw className={`w-3.5 h-3.5 ${autoRotate ? 'animate-spin text-emerald-500' : 'text-muted-foreground'}`} />
    </button>
  );
}
