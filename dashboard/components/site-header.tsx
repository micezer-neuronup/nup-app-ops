import { Separator } from "@/components/ui/separator";
import { ModeSwitcher } from "./mode-switcher";

export function SiteHeader() {
  return (
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        {/* Aqui se pasa el header de la sección solicitada*/}
        {/* <h1 className="text-base font-medium">COMPANIA - NUP2GO</h1>*/}
        <div className="ml-auto flex items-center gap-2">
         <ModeSwitcher />
        </div>
      </div>
  );
}
