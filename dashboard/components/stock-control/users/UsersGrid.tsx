'use client';

import { UserCard } from './UserCard';
import { MarketFlag } from '@/components/stock-control/shared/MarketFlag';
import { MARKET_LIST } from '@/lib/stock-control/constants';
import type { User } from '@/lib/stock-control/types';

interface Props {
  users: User[];
  tooltipId: string | null;
  setTooltipId: (id: string | null) => void;
  onEdit: (user: User) => void;
  onToggleAutomation: (userId: number) => void;
}

export function UsersGrid({
  users,
  tooltipId,
  setTooltipId,
  onEdit,
  onToggleAutomation,
}: Props) {
  // Agrupa por mercado
  const grouped: Record<string, User[]> = {};
  users.forEach((user) => {
    const names = user.market_names?.length ? user.market_names : ['Sin mercado'];
    names.forEach((name) => {
      if (!grouped[name]) grouped[name] = [];
      grouped[name].push(user);
    });
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
      {MARKET_LIST.map((market) => {
        const marketUsers = grouped[market.name] || [];
        if (marketUsers.length === 0) return null;


        return (
          <div key={market.name} className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <MarketFlag marketName={market.name} width={24} height={16} />
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
                {market.name}
              </h3>
              <span className="text-xs text-muted-foreground ml-auto">{marketUsers.length}</span>
            </div>

            <div className="space-y-2">
              {marketUsers.map((user) => (
                <UserCard
                  key={user.id}
                  user={user}
                  tooltipId={tooltipId}
                  setTooltipId={setTooltipId}
                  onEdit={onEdit}
                  onToggleAutomation={onToggleAutomation}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}