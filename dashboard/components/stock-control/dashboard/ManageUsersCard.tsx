'use client';

import Link from 'next/link';

export function ManageUsersCard() {
  return (
    <div className="flex flex-col gap-3 order-1 sm:order-2">
      <Link
        href="/stock-control/users"
        className="p-4 rounded-xl border border-border bg-card hover:bg-muted/50 transition-all shadow-sm group flex flex-col items-center justify-center gap-2 flex-1"
      >
        <span className="text-2xl text-foreground">👥</span>
        <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors text-center">
          Gestión de Usuarios
        </h3>
        <p className="text-[10px] text-muted-foreground text-center">Límites y estadísticas</p>
        <span className="text-xs font-medium text-muted-foreground group-hover:text-primary transition-colors">
          Ver Métricas →
        </span>
      </Link>
    </div>
  );
}