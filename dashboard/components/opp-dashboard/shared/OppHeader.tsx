import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { SiteHeader } from "../../layout/site-header";

interface OppHeaderProps {
  title: string;
  backHref?: string;
  // Imagen (en /public) a la derecha del título, p. ej. el logo del módulo
  titleImage?: string;
  // Zona izquierda tras el título (p. ej. buscador)
  left?: ReactNode;
  // Zona derecha antes del SiteHeader (p. ej. contadores)
  right?: ReactNode;
  // Fila extra solo en móvil (p. ej. buscador a ancho completo)
  mobile?: ReactNode;
}

// Cabecera común de la home, el tablero y los placeholders de módulos
export function OppHeader({ title, backHref, titleImage, left, right, mobile }: OppHeaderProps) {
  return (
    <header className="border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70 sticky top-0 z-50">
      <div className="max-w-[1900px] mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between h-20 gap-3 md:gap-4">
          <div className="flex items-center gap-3 md:gap-4 min-w-0">
            {backHref && (
              <Link
                href={backHref}
                className="inline-flex items-center gap-2 h-10 px-3.5 text-sm font-semibold rounded-md border bg-card text-card-foreground hover:bg-muted transition-colors shadow-sm shrink-0"
              >
                <ArrowLeft className="h-4 w-4" />
                Volver
              </Link>
            )}
            <Image
              src="/Icono_NeuronUP-positivo.png"
              alt="NeuronUP"
              width={56}
              height={56}
              className="h-10 md:h-14 w-auto object-contain shrink-0"
              preload
            />
            <h1 className="min-w-0 text-xl md:text-2xl font-semibold leading-tight text-foreground truncate">{title}</h1>
            {titleImage && (
              <Image
                src={titleImage}
                alt=""
                width={40}
                height={40}
                className="h-8 md:h-10 w-auto object-contain shrink-0"
              />
            )}
            {left}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {right}
            <SiteHeader />
          </div>
        </div>
        {mobile && <div className="md:hidden pb-3">{mobile}</div>}
      </div>
    </header>
  );
}
