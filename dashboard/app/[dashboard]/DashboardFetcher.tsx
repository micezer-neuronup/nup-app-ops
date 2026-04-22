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


//======================================//
// Unified Dashaboard Fetcher Function //
//====================================//
export default function DashboardFetcher({ DashboardComponent, title }: DashboardFetcherProps) {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId");
  const objectId = searchParams.get("objectId");
  const objectTypeId = searchParams.get("objectTypeId");

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      return;
    }

      //=========================================//
     // Server Fetch Logic and Session Recovery //
    //=========================================//
    const fetchData = async () => {
      try {
        let res = await fetch(`${SERVER_URL}/api/session-data?sessionId=${sessionId}`, {
          headers: { "ngrok-skip-browser-warning": "true" },
        });

        if (res.status === 404) {
          console.log("Session expired, regenerating...");
          const newRes = await fetch(
            `${SERVER_URL}/api/company?objectId=${objectId}&objectTypeId=${objectTypeId}`,
            { headers: { "ngrok-skip-browser-warning": "true" } }
          );
          const { sessionId: newSessionId } = await newRes.json();
          window.history.replaceState(
            {},
            "",
            `?sessionId=${newSessionId}&objectId=${objectId}&objectTypeId=${objectTypeId}`
          );
          
          res = await fetch(`${SERVER_URL}/api/session-data?sessionId=${newSessionId}`, {
            headers: { "ngrok-skip-browser-warning": "true" },
          });
          const newData = await res.json();
          setData(newData);
        } else {
          const data = await res.json();
          setData(data);
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [sessionId, objectId, objectTypeId]);

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

  return <GeneralDashboard  data={data} />;
}