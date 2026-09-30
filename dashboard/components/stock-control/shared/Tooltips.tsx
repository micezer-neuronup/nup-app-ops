'use client';

import { STATE_FULL_MAP } from '@/lib/stock-control/constants';

export const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-lg shadow-md p-3 text-sm">
        <p className="font-semibold mb-2 text-foreground border-b pb-1">{label}</p>
        <div className="flex flex-col gap-1.5 mt-2">
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: entry.color || entry.fill }}
                />
                <span className="text-muted-foreground">{entry.name}</span>
              </div>
              <span className="font-semibold text-foreground">
                {entry.value.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

export const StateTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const fullName = STATE_FULL_MAP[label] || label;
    return (
      <div className="bg-card border border-border rounded-lg shadow-md p-3 text-sm">
        <p className="font-semibold mb-2 text-foreground border-b pb-1">{fullName}</p>
        <div className="flex flex-col gap-1.5 mt-2">
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: entry.color || entry.fill }}
                />
                <span className="text-muted-foreground">{entry.name}</span>
              </div>
              <span className="font-semibold text-foreground">
                {entry.value.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

export const MarketTooltip = ({ active, payload, label, marketData }: any) => {
  if (active && payload && payload.length) {
    const item = payload[0]?.payload || marketData?.find((m: any) => m.name === label);
    const flagCode = (item?.flagCode || '').toLowerCase();
    const marketName = item?.name || label || 'Sin mercado';

    return (
      <div className="bg-card border border-border rounded-lg shadow-md p-3 text-sm">
        <p className="font-semibold mb-2 text-foreground border-b pb-1 flex items-center gap-2">
          {flagCode ? (
            <img
              src={`https://flagcdn.com/w40/${flagCode}.png`}
              alt={`${marketName} flag`}
              className="w-6 h-4 object-cover rounded-sm inline-block"
            />
          ) : (
            <span className="w-6 h-4 bg-muted border border-border rounded-sm inline-flex items-center justify-center text-[10px] font-bold text-muted-foreground leading-none">
              ?
            </span>
          )}
          {marketName}
        </p>
        <div className="flex flex-col gap-1.5 mt-2">
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: entry.color || entry.fill }}
                />
                <span className="text-muted-foreground">{entry.name}</span>
              </div>
              <span className="font-semibold text-foreground">
                {entry.value.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};