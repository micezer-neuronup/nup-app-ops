import { Gauge, AlertTriangle, TrendingDown, TimerOff } from "lucide-react";
import { OPP_MODULES } from "../modules";
import { REVIEWED_TAB, type ModuleConfig } from "../shared/moduleConfig";

// ---------- MÓDULO SESIONES (product 'sessions', job scripts/opportunities/sessions) ----------
// Todos los centros tienen sesiones (no es una feature): se mira cuánto y cómo las usan.
// opportunity_kind: high_use, access_review, churn, adoption (ver sessions/pool.py)

const pendingOf = (kind: string) => (o: { status: string; opportunity_kind?: string }) =>
  o.status === "pending" && o.opportunity_kind === kind;

export const SESSIONS_CONFIG: ModuleConfig = {
  product: "sessions",
  title: "Sesiones",
  image: OPP_MODULES.find((m) => m.key === "sessions")?.image,
  metric: { prefix: "sessions", column: "Sesiones 60d", one: "sesión", many: "sesiones", activeDaysSub: "con alguna sesión" },
  tabs: [
    {
      key: "high_use",
      label: "Uso alto",
      icon: Gauge,
      empty: "No hay clientes con uso alto de sesiones",
      hint: "Clientes con la suscripción verificada en el top 5% de uso de sesiones. No se ofrece nada concreto: contactar para conocer sus necesidades (más profesionales, más pacientes, otro plan…).",
      filter: pendingOf("high_use"),
    },
    {
      key: "access_review",
      label: "Revisar",
      icon: AlertTriangle,
      empty: "No hay centros por revisar",
      hint: "Centros que usan sesiones pero con dudas sobre su suscripción: sin suscripción activa, cancelada con acceso o sin verificar. Comprobar su situación antes de contactar.",
      filter: pendingOf("access_review"),
    },
    {
      key: "churn",
      label: "Riesgo",
      icon: TrendingDown,
      empty: "No hay clientes en riesgo",
      hint: "Clientes cuyas sesiones finalizadas han caído a la mitad o menos en el último mes (con al menos 20 el mes anterior). Contactar para entender qué ha cambiado.",
      filter: pendingOf("churn"),
    },
    {
      key: "adoption",
      label: "Adopción",
      icon: TimerOff,
      empty: "No hay clientes con baja finalización",
      hint: "Clientes que inician muchas sesiones pero terminan muy pocas (25% o menos). Contactar para ver si tienen alguna dificultad.",
      filter: pendingOf("adoption"),
    },
    REVIEWED_TAB,
  ],
  reasons: ["no_active_subscription", "cancelled_with_access", "access_unverified"],
  kindTags: {
    high_use: { label: "Uso alto de sesiones", icon: Gauge, title: "En el top 5% de uso de sesiones: contactar para conocer sus necesidades" },
    churn: { label: "Riesgo de abandono", icon: TrendingDown, title: "Sus sesiones han caído a la mitad o menos en el último mes" },
    adoption: { label: "Baja finalización", icon: TimerOff, title: "Termina el 25% o menos de las sesiones que inicia" },
  },
  help: [
    { term: "Prioridad", text: "Alta si el centro está en el top 15% de uso de sesiones entre los clientes; Media si no. En Uso alto todas son Alta (top 5%)." },
    { term: "Uso alto", text: "Clientes verificados en el top 5% de uso; contactar para conocer sus necesidades." },
    { term: "Revisar", text: "Usan sesiones, pero hay que comprobar su suscripción. El icono junto a la prioridad dice qué." },
    { term: "Riesgo", text: "Clientes cuyas sesiones finalizadas han caído un 50% o más en el último mes." },
    { term: "Adopción", text: "Clientes que terminan el 25% o menos de las sesiones que inician (con al menos 20 iniciadas)." },
    { term: "Sesiones 60d", text: "Sesiones finalizadas en los últimos 60 días. Asignadas e iniciadas se ven en el modal, por separado." },
  ],
  scoreHints: {
    volume: "Percentil de sesiones finalizadas en 60 días frente al resto de clientes",
    consistency: "Días con sesiones sobre los 60 días de la ventana",
    trend: "Últimos 30 días frente a los 30 anteriores (50 = estable, 100 = el doble o más)",
  },
};
