import type { LucideIcon } from "lucide-react";
import { CheckCircle2 } from "lucide-react";
import type { Opportunity } from "./types";
import type { CheckReason } from "./PriorityBadge";

// ---------- CONFIGURACIÓN DE UN MÓDULO DEL TABLERO ----------
// OppBoard, OpportunityList, ModalOpp y la home son comunes; lo que cambia por módulo vive en <modulo>/config.ts.

export interface BoardTab {
  key: string;
  label: string;
  icon: LucideIcon;
  empty: string;
  // Explicación corta que aparece al pasar el ratón (o enfocar) por la pestaña
  hint: string;
  // Qué oportunidades van en la pestaña
  filter: (o: Opportunity) => boolean;
}

// Métrica del módulo: la columna de daily_stats que puntúa el job (tests_finished, sessions_finished)
export interface ModuleMetric {
  // Prefijo de las claves de trigger_details: <prefix>_recent / <prefix>_previous
  prefix: "tests" | "sessions";
  // Cabecera de la columna de la tabla y del KPI del modal ("Tests 60d", "Sesiones 60d")
  column: string;
  // Unidad en singular / plural ("test" / "tests", "sesión" / "sesiones")
  one: string;
  many: string;
  // Subtítulo del KPI de días activos ("con algún test")
  activeDaysSub: string;
}

export interface KindTag {
  label: string;
  icon: LucideIcon;
  title: string;
}

export interface ModuleConfig {
  // Valor de commercial_opportunity.product
  product: string;
  title: string;
  image?: string;
  metric: ModuleMetric;
  tabs: BoardTab[];
  // Motivos de revisión que pueden salir en este módulo (para la leyenda y la ayuda)
  reasons: CheckReason[];
  // Etiqueta del modal según opportunity_kind (p. ej. "Uso alto con Assessment")
  kindTags?: Record<string, KindTag>;
  // Explicaciones del botón "?" (pestañas y columnas propias del módulo)
  help: { term: string; text: string }[];
  // Texto de cada parte del score en el popover del modal
  scoreHints: { volume: string; consistency: string; trend: string };
  // Cuenta "Convertidas" en la home (solo Assessment: el centro compró test_all)
  showConverted?: boolean;
}

// Pestaña común a todos los módulos: revisadas en el tablero o asignadas a un comercial
export const REVIEWED_TAB: BoardTab = {
  key: "reviewed",
  label: "Revisadas / Asignadas",
  icon: CheckCircle2,
  empty: "No hay oportunidades revisadas o asignadas",
  hint: "Oportunidades ya revisadas o asignadas a un comercial. Se pueden devolver a pendiente con Deshacer.",
  filter: (o) => o.status === "completed" || !!o.upsell_object,
};
