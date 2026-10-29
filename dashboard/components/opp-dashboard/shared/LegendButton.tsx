"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  BookOpen, X, ChevronsUp, ChevronUp, UserPlus, UserCheck, CheckCircle, Undo2,
  TrendingUp, TrendingDown, MoveRight, Sparkles, Copy,
} from "lucide-react";
import { HubSpotIcon } from "./HubSpotIcon";
import { REASON_META } from "./PriorityBadge";

// Muestra de icono con el mismo marco que en la tabla
function Swatch({ children, className = "text-foreground/70" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center justify-center h-7 w-7 shrink-0 rounded-md border border-border bg-muted/40 ${className}`}>
      {children}
    </span>
  );
}

function Item({ icon, label, description }: { icon: ReactNode; label: string; description?: string }) {
  return (
    <li className="flex items-start gap-2.5">
      {icon}
      <span className="min-w-0 pt-0.5">
        <span className="font-medium text-foreground">{label}</span>
        {description && <span className="text-foreground/70"> · {description}</span>}
      </span>
    </li>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground/60 mb-2">{title}</h4>
      <ul className="flex flex-col gap-2 text-sm leading-snug">{children}</ul>
    </section>
  );
}

// Botón "Leyenda" de la cabecera del tablero: abre un popup con el significado de los iconos de la tabla.
// Se abre con clic y se cierra al sacar el ratón, con la X o con Escape.
export function LegendButton() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const icon = "h-4 w-4";

  return (
    <div className="relative" onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`inline-flex items-center gap-2 h-10 px-3 rounded-md border text-sm font-medium transition-colors ${
          open
            ? "border-[#00a4c2]/60 bg-[#00a4c2]/10 text-foreground"
            : "border-border bg-card text-foreground/70 hover:text-foreground hover:border-[#00a4c2]/60"
        }`}
      >
        <BookOpen className={icon} />
        <span className="hidden sm:inline">Leyenda</span>
      </button>

      {open && (
        // pt-2 en vez de margen: el ratón puede bajar del botón al popup sin "salir" y cerrarlo
        <div className="absolute right-0 top-full z-50 pt-2" role="dialog" aria-label="Leyenda de iconos">
          <div className="w-[420px] max-w-[calc(100vw-2rem)] max-h-[75vh] overflow-y-auto rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold">Leyenda</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-muted text-foreground/60 hover:text-foreground"
              >
                <X className={icon} />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <Group title="Prioridad">
                <Item icon={<Swatch><ChevronsUp className={icon} /></Swatch>} label="Alta" description="en el top 15% de uso de su grupo" />
                <Item icon={<Swatch><ChevronUp className={icon} /></Swatch>} label="Media" description="uso constante por encima del mínimo" />
                {Object.values(REASON_META).map((m) => {
                  const Icon = m.icon;
                  return (
                    <Item
                      key={m.label}
                      icon={<Swatch className={m.className}><Icon className={icon} /></Swatch>}
                      label={m.label}
                      description={`${m.description}${m.blocking ? "" : " (solo contexto, no manda a Revisar)"}`}
                    />
                  );
                })}
              </Group>

              <Group title="Acciones">
                <Item icon={<Swatch className="text-orange-400"><HubSpotIcon className={icon} /></Swatch>} label="HubSpot" description="abrir la ficha del centro" />
                <Item icon={<Swatch><UserPlus className={icon} /></Swatch>} label="Asignar" description="asignar la oportunidad a un comercial" />
                <Item icon={<Swatch><UserCheck className={icon} /></Swatch>} label="Asignada" description="ya tiene comercial; pulsar para editar" />
                <Item icon={<Swatch><CheckCircle className={icon} /></Swatch>} label="Revisar" description="marcar como revisada (pasa a Revisadas)" />
                <Item icon={<Swatch><Undo2 className={icon} /></Swatch>} label="Deshacer" description="volver a pendiente" />
              </Group>

              <Group title="Otros">
                <Item
                  icon={
                    <span className="shrink-0 inline-flex items-center h-5 mt-1 px-1.5 rounded border border-[#00a4c2]/40 text-[11px] font-semibold uppercase tracking-wide text-[#0091ad] dark:text-[#00a4c2]">
                      Nueva
                    </span>
                  }
                  label="Detectada hace poco"
                  description="en los últimos 7 días"
                />
                <Item icon={<Swatch><Copy className={icon} /></Swatch>} label="nup_id" description="pulsar para copiarlo" />
                <Item
                  icon={
                    <span className="inline-flex items-center gap-1 h-7 shrink-0">
                      <TrendingUp className={`${icon} text-green-500`} />
                      <TrendingDown className={`${icon} text-red-500`} />
                      <MoveRight className={`${icon} text-foreground/40`} />
                    </span>
                  }
                  label="Tendencia"
                  description="tests de los últimos 30 días frente a los 30 anteriores (sube, baja, estable)"
                />
                <Item icon={<Swatch className="text-green-500"><Sparkles className={icon} /></Swatch>} label="Nuevo uso" description="no usaba tests en los 30 días anteriores" />
              </Group>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
