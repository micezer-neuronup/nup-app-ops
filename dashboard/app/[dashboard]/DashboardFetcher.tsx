"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { GeneralDashboard } from "@/components/Dashboards/GeneralDashboard ";

// ────── DashboardFetcher.tsx ─────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────────────────────
// ─── Directive use client is necessary as we use Next.js AppRouter (app folder)
// ─── This means all ocmponents are Server Components but they cant use React Hooks
// ─── The directive allows to send the js to the browser to be interactive
// ─────────────────────────────────────────────────────────────────────────────────────────────
// ─── The interface is like a rulebook or strcit contract
// ─── The 1st rule says a component(Dashbaoard in this case) must be passed
// ─── The 2nd rule says a prop called title must be paased and it must be a string
// ─── When another file want to use DashboardFetcher, it must fufill both rules
// ─── If not met, DashboardFetcher will throw an error
// ─── The intefrace allows us to have resuable code that accepts various dashboards and titles
// ─────────────────────────────────────────────────────────────────────────────────────────────
// ─── The hook useSearchParams reads the URL in the browser
// ─── We use it to extract objectId and objectTypeId
// ─────────────────────────────────────────────────────────────────────────────────────────────
// ─── The DashboardFetcher function uses three states, data, loading and error
// ─── It has a defined useEffect with dependency on objectId and objectTypeId to run 
// ─── We then fetch the server endpoint with the ids so it can fetch Hubspot API 
// ─────────────────────────────────────────────────────────────────────────────────────────────
// ─── The return statement is a defensive implementation
// ─── We check all the possibilities: loading - error from server - null data - valid data
// ─────────────────────────────────────────────────────────────────────────────────────────────


const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL;



interface DashboardFetcherProps {
  DashboardComponent: React.ComponentType<any>;
  title: string;
}


export default function DashboardFetcher({ DashboardComponent, title }: DashboardFetcherProps) {
  const searchParams = useSearchParams();
  const objectId = searchParams.get("objectId");
  const objectTypeId = searchParams.get("objectTypeId");

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  useEffect(() => {
    if (!objectId || !objectTypeId) {
      setError("Faltan parámetros objectId o objectTypeId");
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        const res = await fetch(
          `${SERVER_URL}/api/company-data?objectId=${objectId}&objectTypeId=${objectTypeId}`,
          { headers: { "ngrok-skip-browser-warning": "true" } }
        );
        if (!res.ok) {
          throw new Error(`Error ${res.status}: ${res.statusText}`);
        }
        const json = await res.json();
        setData(json);
      } catch (err: any) {
        console.error("Error fetching company data:", err);
        setError(err.message || "Error al cargar los datos");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [objectId, objectTypeId]);


  
  if (loading) {
    return (
      <div className="flex h-[calc(100vh-200px)] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <div className="absolute inset-0 h-12 w-12 animate-ping rounded-full bg-primary/20" />
          </div>
          <p className="text-sm text-muted-foreground font-medium">
            Cargando datos del {title.toLowerCase()}...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[calc(100vh-200px)] items-center justify-center">
        <div className="text-center text-destructive">
          <p>Error: {error}</p>
          <p className="text-sm text-muted-foreground mt-2">
            Intenta recargar la página o contacta con el equipo de operaciones.
          </p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-[calc(100vh-200px)] items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">📊</div>
          <p className="text-muted-foreground">No hay datos disponibles</p>
        </div>
      </div>
    );
  }

  return <DashboardComponent data={data} />;
}