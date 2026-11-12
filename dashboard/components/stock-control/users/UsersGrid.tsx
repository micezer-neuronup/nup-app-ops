'use client';

import type { CSSProperties } from 'react';
import { UserCard } from './UserCard';
import { MarketFlag } from '@/components/stock-control/shared/MarketFlag';
import { MARKET_LIST } from '@/lib/stock-control/constants';
import type { User } from '@/lib/stock-control/types';

interface Props {
  users: User[];
  onEdit: (user: User) => void;
  onToggleAutomation: (userId: number) => void;
}

const NO_MARKET = 0;

export function UsersGrid({ users, onEdit, onToggleAutomation }: Props) {
  // One column per market with users (a user with several markets appears in each), plus "Sin mercado"
  const groups = [
    ...MARKET_LIST.map((m) => ({ id: m.id as number, name: m.name as string })),
    { id: NO_MARKET, name: 'Sin mercado' },
  ]
    .map((g) => {
      const marketUsers = users.filter((u) =>
        g.id === NO_MARKET ? !u.market_ids?.length : u.market_ids?.includes(g.id)
      );
      return {
        ...g,
        active: marketUsers.filter((u) => u.automation_enabled),
        inactive: marketUsers.filter((u) => !u.automation_enabled),
      };
    })
    .filter((g) => g.active.length + g.inactive.length > 0);

  const renderCard = (user: User) => (
    <UserCard
      key={user.id}
      user={user}
      onEdit={onEdit}
      onToggleAutomation={onToggleAutomation}
    />
  );

  return (
    <div
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[repeat(var(--cols),minmax(0,1fr))] gap-3"
      style={{ '--cols': groups.length } as CSSProperties}
    >
      {groups.map((g) => (
        <div key={g.id} className="space-y-2 min-w-0">
          <div className="flex items-center gap-2 px-1">
            {g.id !== NO_MARKET && <MarketFlag marketId={g.id} width={24} height={16} />}
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider truncate">{g.name}</h3>
            <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
              {g.active.length}/{g.active.length + g.inactive.length} activos
            </span>
          </div>

          {/* One list: active first, inactive always at the bottom (the card border shows which is which) */}
          <div className="space-y-2">{[...g.active, ...g.inactive].map(renderCard)}</div>
        </div>
      ))}
    </div>
  );
}
