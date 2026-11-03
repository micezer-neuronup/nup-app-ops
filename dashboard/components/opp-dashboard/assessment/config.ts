import { Clock, AlertTriangle, Gauge } from "lucide-react";
import { OPP_MODULES } from "../modules";
import { reviewReasons } from "../shared/PriorityBadge";
import { REVIEWED_TAB, type ModuleConfig } from "../shared/moduleConfig";

// ---------- MÓDULO ASSESSMENT (product 'assessments', job scripts/opportunities/assessment) ----------
// opportunity_kind: upgrade / review (sin test_all) y expansion (ya tiene test_all, uso alto)

export const ASSESSMENT_CONFIG: ModuleConfig = {
  product: "assessments",
  title: "Assessment",
  image: OPP_MODULES.find((m) => m.key === "assessment")?.image,
  metric: { prefix: "tests", column: "Tests 60d", one: "test", many: "tests", activeDaysSub: "con algún test" },
  tabs: [
    {
      key: "pending",
      label: "Pendientes",
      icon: Clock,
      empty: "No hay oportunidades pendientes",
      hint: "Clientes con la suscripción verificada que usan tests sin tener test_all. Candidatos directos a Assessment. Si tuvieron test_all antes, lo indica su icono.",
      // Clientes verificados sin test_all, candidatos directos a upsell (aunque hayan tenido test_all antes)
      filter: (o) => o.status === "pending" && o.opportunity_kind !== "expansion" && reviewReasons(o).length === 0,
    },
    {
      key: "review",
      label: "Revisar",
      icon: AlertTriangle,
      empty: "No hay oportunidades por revisar",
      hint: "Centros que usan tests pero con dudas sobre su suscripción: sin suscripción activa, cancelada con acceso o sin verificar. Comprobar su situación antes de ofrecer nada.",
      // Hay que comprobar su suscripción antes de vender (acceso sin verificar, sin suscripción, cancelada…)
      filter: (o) => o.status === "pending" && o.opportunity_kind !== "expansion" && reviewReasons(o).length > 0,
    },
    {
      key: "expansion",
      label: "Uso alto",
      icon: Gauge,
      empty: "No hay centros con Assessment y uso alto",
      hint: "Clientes que ya tienen test_all y están en el top 15% de uso. No hay que venderles Assessment: contactar para conocer sus necesidades.",
      // Ya tienen test_all y están en el top de uso
      filter: (o) => o.status === "pending" && o.opportunity_kind === "expansion",
    },
    REVIEWED_TAB,
  ],
  reasons: ["no_active_subscription", "cancelled_with_access", "access_unverified", "test_all_unverified", "had_test_all_before"],
  kindTags: {
    expansion: {
      label: "Uso alto con Assessment",
      icon: Gauge,
      title: "Ya tiene test_all y está en el top de uso: contactar para conocer sus necesidades",
    },
  },
  help: [
    { term: "Prioridad", text: "Alta si el centro está en el top 15% de uso entre los centros sin test_all; Media si tiene un uso constante por encima del mínimo." },
    { term: "Pendientes", text: "Clientes verificados sin test_all, candidatos directos a Assessment." },
    { term: "Revisar", text: "Hay que comprobar su suscripción antes de vender. El icono junto a la prioridad dice qué (el de Tuvo test_all es solo contexto y también aparece en Pendientes)." },
    { term: "Uso alto", text: "Clientes que ya tienen test_all y están en el top 15% de uso; contactar para conocer sus necesidades." },
    { term: "Tests 60d", text: "Tests finalizados en los últimos 60 días." },
  ],
  scoreHints: {
    volume: "Percentil de tests en 60 días frente al resto de centros sin test_all",
    consistency: "Días con tests sobre los 60 días de la ventana",
    trend: "Últimos 30 días frente a los 30 anteriores (50 = estable, 100 = el doble o más)",
  },
  showConverted: true,
};
