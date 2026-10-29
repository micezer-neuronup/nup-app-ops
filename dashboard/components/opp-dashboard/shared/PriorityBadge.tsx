import { ChevronsUp, ChevronUp, AlertTriangle, ShieldQuestion, ShieldOff, CalendarX2, FlaskConical, type LucideIcon } from "lucide-react";
import { Tag } from "./Tag";
import type { Opportunity } from "../types";

// ---------- MOTIVOS DE REVISIÓN (trigger_details.check_reasons, ver scoring.py) ----------
export type CheckReason =
  | "no_active_subscription"
  | "cancelled_with_access"
  | "access_unverified"
  | "test_all_unverified"
  | "had_test_all_before";

// blocking: hay que comprobarlo antes de vender (va a Revisar). Si no, es solo contexto (se queda en Pendientes con su icono).
export const REASON_META: Record<
  CheckReason,
  { label: string; description: string; icon: LucideIcon; className: string; blocking: boolean }
> = {
  no_active_subscription: {
    label: "Sin suscripción activa",
    description: "Usa la plataforma sin ninguna suscripción activa: confirmar si debería pagar o retirarle el acceso.",
    icon: ShieldOff,
    className: "text-red-500",
    blocking: true,
  },
  cancelled_with_access: {
    label: "Cancelada con acceso",
    description: "Canceló su suscripción, pero aún tiene acceso y la sigue usando.",
    icon: CalendarX2,
    className: "text-orange-500",
    blocking: true,
  },
  access_unverified: {
    label: "Acceso sin verificar",
    description: "Tiene acceso, pero no sabemos si su suscripción sigue activa: verificarlo antes de ofrecer.",
    icon: ShieldQuestion,
    className: "text-yellow-500",
    blocking: true,
  },
  test_all_unverified: {
    label: "test_all sin verificar",
    description: "Tiene test_all en una suscripción que no está verificada.",
    icon: FlaskConical,
    className: "text-yellow-500",
    blocking: true,
  },
  had_test_all_before: {
    label: "Tuvo test_all",
    description: "Tuvo test_all en una suscripción anterior y sigue usando tests: buen punto de partida para la conversación.",
    icon: AlertTriangle,
    className: "text-orange-500",
    blocking: false,
  },
};

// Motivos por los que hay que revisar la oportunidad antes de vender. Las anteriores a este cambio no traen
// check_reasons: si son de tipo review, cuentan como "tuvo test_all".
export function checkReasons(opp: Pick<Opportunity, "trigger_details" | "opportunity_kind">): CheckReason[] {
  let data = opp.trigger_details;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      data = null;
    }
  }
  if (Array.isArray(data?.check_reasons)) {
    return data.check_reasons.filter((r: string): r is CheckReason => r in REASON_META);
  }
  return opp.opportunity_kind === "review" ? ["had_test_all_before"] : [];
}

// Lee priority / track_reason de trigger_details (puede venir como string JSON)
export function getTrack(trigger: any): { priority: "alta" | "media" | null; reason: string | null } {
  let data = trigger;
  if (typeof trigger === "string") {
    try {
      data = JSON.parse(trigger);
    } catch {
      data = null;
    }
  }
  return {
    priority: data?.priority === "alta" || data?.priority === "media" ? data.priority : null,
    reason: typeof data?.track_reason === "string" ? data.track_reason : null,
  };
}

// compact: solo "Alta" / "Media" (en la tabla, donde la cabecera ya dice "Prioridad")
export function PriorityBadge({ trigger, compact = false }: { trigger: any; compact?: boolean }) {
  const { priority, reason } = getTrack(trigger);
  if (!priority) return null;
  const prefix = compact ? "" : "Prioridad ";

  return priority === "alta" ? (
    <Tag tone="green" icon={ChevronsUp} label={`${prefix}Alta`} title={reason || undefined} />
  ) : (
    <Tag tone="cyan" icon={ChevronUp} label={`${prefix}Media`} title={reason || undefined} />
  );
}


// Solo los motivos que obligan a revisar antes de vender (deciden la pestaña Revisar)
export const reviewReasons = (opp: Pick<Opportunity, "trigger_details" | "opportunity_kind">) =>
  checkReasons(opp).filter((r) => REASON_META[r].blocking);
