"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { GeneralDashboard } from "@/components/Dashboards/GeneralDashboard ";


//======================//
// Initialization: Env //
//====================//
const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL;


//===============================//
// Dashboard Prop Name Reciever //
//=============================//
interface DashboardFetcherProps {
  DashboardComponent: React.ComponentType<any>;
  title: string;
}


//=======================================//
// Fucntion: Unified Dashaboard Fetcher //
//=====================================//
export default function DashboardFetcher({ DashboardComponent, title }: DashboardFetcherProps) {
  const searchParams = useSearchParams();
  const objectId = searchParams.get("objectId");
  const objectTypeId = searchParams.get("objectTypeId");

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

    //============================================================//
   // UseEffect: Dependency on objectId and objectTypeId to run  //
  //============================================================//
  useEffect(() => {
    if (!objectId || !objectTypeId) {
      setError("Faltan parámetros objectId o objectTypeId");
      setLoading(false);
      return;
    }

      //===============================================================//
     // Fetch: Call to server endpoint with data to fetch Hubspot API //
    //===============================================================//
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

  return <GeneralDashboard data={data} />;
}