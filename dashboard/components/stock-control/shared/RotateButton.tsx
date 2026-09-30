'use client';

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
      <svg
        className={`w-3.5 h-3.5 ${autoRotate ? 'animate-spin text-emerald-500' : 'text-muted-foreground'}`}
        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    </button>
  );
}