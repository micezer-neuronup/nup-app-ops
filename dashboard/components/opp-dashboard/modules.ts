import { ClipboardCheck, Activity, CalendarCheck, KeyRound, type LucideIcon } from "lucide-react";

export type OppModuleKey = "assessment" | "activity" | "sessions" | "licenses";

export interface OppModule {
  key: OppModuleKey;
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  // Imagen opcional (en /public) que sustituye al icono en la home
  image?: string;
  // Color del icono del módulo (el fondo es neutro)
  accent: string;
  status: "active" | "soon";
}

// Configuración única de módulos: la usan la home y el placeholder
export const OPP_MODULES: OppModule[] = [
  {
    key: "assessment",
    title: "Assessment",
    description: "Centros que usan tests: candidatos a Assessment, suscripciones a revisar y uso alto.",
    href: "/opp-dashboard/assessment",
    icon: ClipboardCheck,
    image: "/assesment-logo.webp",
    accent: "text-[#00a4c2]",
    status: "active",
  },
  {
    key: "activity",
    title: "Actividad",
    description: "Oportunidades detectadas a partir de la actividad diaria de los centros.",
    href: "/opp-dashboard/activity",
    icon: Activity,
    accent: "text-violet-500",
    status: "soon",
  },
  {
    key: "sessions",
    title: "Sesiones",
    description: "Centros que usan sesiones: uso alto, suscripciones a revisar, riesgo de abandono y adopción.",
    href: "/opp-dashboard/sessions",
    icon: CalendarCheck,
    image: "/sesiones.svg",
    accent: "text-rose-500",
    status: "active",
  },
  {
    key: "licenses",
    title: "Licencias",
    description: "Centros con uso destacado de NUP2GO o que necesitan más licencias de profesional.",
    href: "/opp-dashboard/licenses",
    icon: KeyRound,
    accent: "text-amber-500",
    status: "soon",
  },
];
