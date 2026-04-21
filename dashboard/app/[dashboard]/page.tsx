import { notFound } from "next/navigation";
import { SiteHeader } from "../../components/site-header";
import { Nup2go_dashboard } from "../../components/Dashboards/Nup2go_dashboard ";
import { HealthScore_dashboard } from "../../components/Dashboards/HealthScore_dashboard ";
import { Center_dashboard } from "@/components/Dashboards/Center_dashboard ";
import { Subscription_dashboard } from "@/components/Dashboards/Subscription_dashboard";
import DashboardFetcher from "./DashboardFetcher"; // we'll create this

const dashboards = {
  nup2go: {
    component: Nup2go_dashboard,
    title: "NUP2GO"
  },
  center: {
    component: Center_dashboard,
    title: "Centro"
  },
  subscription: {
    component: Subscription_dashboard,
    title: "Suscripción"
  },
  healthscore: {
    component: HealthScore_dashboard,
    title: "Health Score"
  }
} as const;

type DashboardSlug = keyof typeof dashboards;

export async function generateStaticParams() {
  return [
    { dashboard: "nup2go" },
    { dashboard: "center" },
    { dashboard: "subscription" },
    { dashboard: "health-score" } // note: slug matches key
  ];
}

interface PageProps {
  params: Promise<{ dashboard: string }>;
}

export default async function DashboardPage({ params }: PageProps) {
  const { dashboard } = await params;

  if (!dashboards[dashboard as DashboardSlug]) {
    notFound();
  }

  const { component: Component, title } = dashboards[dashboard as DashboardSlug];

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          <div className="px-4 lg:px-6">
            <SiteHeader />
            {/* Client wrapper that fetches data and passes to Component */}
            <DashboardFetcher
              DashboardComponent={Component}
              title={title}
            />
          </div>
        </div>
      </div>
    </div>
  );
}