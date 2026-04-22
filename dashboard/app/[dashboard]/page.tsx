import { notFound } from "next/navigation";
import { SiteHeader } from "../../components/site-header";
import DashboardFetcher from "./DashboardFetcher";
import { GeneralDashboard } from "@/components/Dashboards/GeneralDashboard ";

// Keep generateStaticParams if needed, but you can simplify
export async function generateStaticParams() {
  return [{ dashboard: "general" }];
}

interface PageProps {
  params: Promise<{ dashboard: string }>;
}

export default async function DashboardPage({ params }: PageProps) {
  const { dashboard } = await params;
  // Optional: if you still want to handle unknown dashboards
  if (dashboard !== "general") notFound();

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