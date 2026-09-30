'use client';

import { MARKET_BY_ID, MARKET_BY_NAME } from '@/lib/stock-control/constants';

interface Props {
  /** Puedes pasar id numérico o nombre del mercado */
  marketId?: number;
  marketName?: string;
  /** Tamaño de la bandera (default 20x14) */
  width?: number;
  height?: number;
  className?: string;
}

export function MarketFlag({
  marketId,
  marketName,
  width = 20,
  height = 14,
  className = '',
}: Props) {
  const market =
    (marketId != null ? MARKET_BY_ID[marketId] : undefined) ||
    (marketName ? MARKET_BY_NAME[marketName] : undefined);

  const code = market?.code;

  if (!code) {
    return (
      <div
        className={`bg-muted border border-border rounded-sm flex items-center justify-center text-[10px] font-bold text-muted-foreground leading-none ${className}`}
        style={{ width, height }}
      >
        ?
      </div>
    );
  }

  return (
    <img
      src={`https://flagcdn.com/w40/${code}.png`}
      alt={market?.name || ''}
      title={market?.name || ''}
      className={`object-cover rounded-sm ${className}`}
      style={{ width, height }}
    />
  );
}