export const SERVER_URL = process.env.NEXT_PUBLIC_STOCK_CONTROL_URL || 'http://localhost:5000';

export const MARKET_LIST = [
  { id: 1, name: 'España',            code: 'es' },
  { id: 2, name: 'Brasil - Portugal', code: 'br' },
  { id: 3, name: 'Francia',           code: 'fr' },
  { id: 4, name: 'LATAM',             code: 'mx' },
  { id: 5, name: 'Italia',            code: 'it' },
  { id: 6, name: 'USA',               code: 'us' },
] as const;

export const MARKET_BY_ID = Object.fromEntries(MARKET_LIST.map(m => [m.id, m]));
export const MARKET_BY_NAME = Object.fromEntries(MARKET_LIST.map(m => [m.name, m]));

export const STATE_FULL_MAP: Record<string, string> = {
  'New':   'New',
  'Att.':  'Attempting',
  'Cont.': 'Contacted',
  'Qual.': 'Qualified',
  'Disq.': 'Disqualified',
};

export const CHART_COLORS = {
  primary:   '#64748b',
  secondary: '#94a3b8',
  accent:    '#475569',
  success:   '#16a34a',
  warning:   '#ca8a04',
  danger:    '#dc2626',
  info:      '#2563eb',
  purple:    '#7c3aed',
  emerald:   '#059669',
  orange:    '#ea580c',
};