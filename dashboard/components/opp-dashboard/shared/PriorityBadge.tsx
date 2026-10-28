import { ChevronsUp, ChevronUp } from "lucide-react";
import { Tag } from "./Tag";

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

export function PriorityBadge({ trigger }: { trigger: any }) {
  const { priority, reason } = getTrack(trigger);
  if (!priority) return null;

  return priority === "alta" ? (
    <Tag tone="green" icon={ChevronsUp} label="Prioridad Alta" title={reason || undefined} />
  ) : (
    <Tag tone="cyan" icon={ChevronUp} label="Prioridad Media" title={reason || undefined} />
  );
}
