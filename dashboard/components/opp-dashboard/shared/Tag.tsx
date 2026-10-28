import Image from "next/image";
import type { LucideIcon } from "lucide-react";

export type TagTone = "yellow" | "orange" | "green" | "cyan" | "neutral";

// Todas las etiquetas son neutras: el color del tipo solo aparece al pasar el ratón (borde + icono)
export const TONE_STYLES: Record<TagTone, { hoverBorder: string; hoverIcon: string }> = {
  yellow: { hoverBorder: "hover:border-yellow-500/70", hoverIcon: "group-hover/tag:text-yellow-500" },
  orange: { hoverBorder: "hover:border-orange-500/70", hoverIcon: "group-hover/tag:text-orange-500" },
  green: { hoverBorder: "hover:border-green-500/70", hoverIcon: "group-hover/tag:text-green-500" },
  cyan: { hoverBorder: "hover:border-[#00a4c2]/70", hoverIcon: "group-hover/tag:text-[#00a4c2]" },
  neutral: { hoverBorder: "hover:border-foreground/40", hoverIcon: "group-hover/tag:text-foreground" },
};

interface TagProps {
  tone: TagTone;
  label: string;
  icon?: LucideIcon;
  // Imagen (en /public) en lugar del icono, p. ej. el logo del módulo
  image?: string;
  count?: number | string;
  size?: "md" | "lg";
  title?: string;
  className?: string;
}

export function Tag({ tone, label, icon: Icon, image, count, size = "md", title, className = "" }: TagProps) {
  const t = TONE_STYLES[tone];
  const sizing = size === "lg" ? "h-10 px-3.5 gap-2 text-base" : "h-8 px-3 gap-1.5 text-sm";
  const iconSize = size === "lg" ? "h-5 w-5" : "h-4 w-4";

  return (
    <span
      title={title}
      className={`group/tag inline-flex items-center max-w-full min-w-0 rounded-md border border-border bg-muted/40 font-medium text-foreground whitespace-nowrap transition-colors ${t.hoverBorder} ${sizing} ${className}`}
    >
      {image ? (
        <Image src={image} alt="" width={20} height={20} className={`${iconSize} shrink-0 object-contain`} />
      ) : (
        Icon && <Icon className={`${iconSize} shrink-0 text-foreground/60 transition-colors ${t.hoverIcon}`} />
      )}
      <span className="truncate">{label}</span>
      {count !== undefined && <span className="font-bold">{count}</span>}
    </span>
  );
}
