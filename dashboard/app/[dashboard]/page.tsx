import { notFound } from "next/navigation";
import { SiteHeader } from "../../components/site-header";
import DashboardFetcher from "./DashboardFetcher";
import { GeneralDashboard } from "@/components/Dashboards/GeneralDashboard ";

export async function generateStaticParams() {
  console.log("[BUILD/SSG] Generando parámetros estáticos para las rutas de dashboard...");
  return [{ dashboard: "general" }];
}

interface PageProps {
  params: Promise<{ dashboard: string }>;
}

export default async function DashboardPage({ params }: PageProps) {
  const { dashboard } = await params;

  console.log(`[ROUTE] Solicitud recibida para el dashboard: "${dashboard}"`);

  if (dashboard !== "general") {
    console.warn(`[ROUTE 404] Dashboard no válido: "${dashboard}". Redirigiendo a notFound().`);
    notFound();
  }

  console.log(`[ROUTE 200] Cargando componente para dashboard: "${dashboard}"`);

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          <div className="px-4 lg:px-6">
            <SiteHeader />
            <DashboardFetcher DashboardComponent={GeneralDashboard} title="General" />
          </div>
        </div>
      </div>
    </div>
  );
}