"use client";

import { OppHeader } from "./shared/OppHeader";
import { OPP_MODULES, type OppModuleKey } from "./modules";

export function ModulePlaceholder({ moduleKey }: { moduleKey: OppModuleKey }) {
  const mod = OPP_MODULES.find((m) => m.key === moduleKey)!;
  const Icon = mod.icon;

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <OppHeader title={`Oportunidades de Upsell: ${mod.title}`} backHref="/opp-dashboard" />

      {/* ================= CONTENIDO ================= */}
      <main className="flex-1 max-w-[1900px] mx-auto w-full px-4 md:px-6 py-5 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center p-10 rounded-xl border border-border/60 bg-card shadow-sm max-w-xl w-full">
          <span className={`inline-flex items-center justify-center w-20 h-20 rounded-lg border border-border bg-muted/40 ${mod.accent}`}>
            <Icon className="w-10 h-10" />
          </span>
          <h2 className="text-3xl font-semibold text-foreground">Módulo en construcción</h2>
          <p className="text-lg text-foreground/70">{mod.description}</p>
        </div>
      </main>
    </div>
  );
}
