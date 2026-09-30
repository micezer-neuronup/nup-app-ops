"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { X, Search, User, Check, ListTodo, Briefcase, UserPlus } from "lucide-react";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || "";

interface Owner {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface AssignUpsellModalProps {
  open: boolean;
  onClose: () => void;
  opportunityId: number;
  centerName: string;
  currentObject?: string;
  currentOwnerId?: string;
  currentOwnerName?: string;
  onAssigned: (data: {
    upsellObject: string;
    upsellOwnerId: string;
    upsellOwnerName: string;
  }) => void;
}

// Opciones de objeto con iconos
const OBJECT_OPTIONS = [
  { value: "Task", label: "Tarea", icon: ListTodo, description: "Crear una tarea para el equipo" },
  { value: "Deal", label: "Deal", icon: Briefcase, description: "Crear una oportunidad de negocio" },
  { value: "Lead", label: "Lead", icon: UserPlus, description: "Crear un lead para seguimiento" },
];

export function AssignUpsellModal({
  open,
  onClose,
  opportunityId,
  centerName,
  currentObject = "",
  currentOwnerId = "",
  currentOwnerName = "",
  onAssigned,
}: AssignUpsellModalProps) {
  const [upsellObject, setUpsellObject] = useState(currentObject);
  const [selectedOwner, setSelectedOwner] = useState<Owner | null>(
    currentOwnerId && currentOwnerName
      ? {
          id: currentOwnerId,
          firstName: currentOwnerName.split(" ")[0] || "",
          lastName: currentOwnerName.split(" ").slice(1).join(" ") || "",
          email: "",
        }
      : null
  );
  const [ownerSearch, setOwnerSearch] = useState(currentOwnerName || "");
  const [owners, setOwners] = useState<Owner[]>([]);
  const [filteredOwners, setFilteredOwners] = useState<Owner[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingOwners, setLoadingOwners] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Cargar owners al abrir
  useEffect(() => {
    if (!open) return;
    const fetchOwners = async () => {
      setLoadingOwners(true);
      try {
        const res = await fetch(`${SERVER_URL}/api/hubspot/owners`, {
          headers: { "ngrok-skip-browser-warning": "true" },
        });
        if (!res.ok) throw new Error("Error fetching owners");
        const data = await res.json();
        setOwners(data);
        setFilteredOwners(data);
      } catch (err) {
        console.error("Error fetching owners:", err);
        setError("No se pudieron cargar los usuarios de HubSpot.");
      } finally {
        setLoadingOwners(false);
      }
    };
    fetchOwners();
  }, [open]);

  // Filtrar owners por búsqueda
  useEffect(() => {
    if (!ownerSearch.trim()) {
      setFilteredOwners(owners);
      return;
    }
    const term = ownerSearch.toLowerCase();
    setFilteredOwners(
      owners.filter(
        (o) =>
          o.firstName.toLowerCase().includes(term) ||
          o.lastName.toLowerCase().includes(term) ||
          o.email.toLowerCase().includes(term)
      )
    );
  }, [ownerSearch, owners]);

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${SERVER_URL}/api/commercial-opportunities/${opportunityId}/assign-upsell`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            upsellObject: upsellObject || "",
            upsellOwnerId: selectedOwner?.id || "",
            upsellOwnerName: selectedOwner
              ? `${selectedOwner.firstName} ${selectedOwner.lastName}`.trim()
              : "",
          }),
        }
      );
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Error assigning opportunity");
      }
      const data = await res.json();
      onAssigned(data);
      onClose();
    } catch (err: any) {
      setError(err.message || "Error al asignar la oportunidad");
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setUpsellObject("");
    setSelectedOwner(null);
    setOwnerSearch("");
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-background border border-border rounded-xl shadow-2xl p-6 m-4"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-xl font-bold mb-1">Asignar oportunidad</h2>
        <p className="text-sm text-muted-foreground mb-5">
          Centro: <span className="font-medium text-foreground">{centerName}</span>
        </p>

        <div className="space-y-6">
          {/* Selector de objeto (botones grandes) */}
          <div>
            <label className="text-sm font-medium block mb-2">
              ¿Qué quieres crear?
            </label>
            <div className="grid grid-cols-3 gap-3">
              {OBJECT_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isSelected = upsellObject === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setUpsellObject(opt.value)}
                    className={`relative flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all text-center ${
                      isSelected
                        ? "border-orange-500 bg-orange-500/10 shadow-md"
                        : "border-border bg-card hover:border-muted-foreground/30 hover:bg-muted/30"
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center">
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    )}
                    <Icon
                      className={`h-6 w-6 ${
                        isSelected ? "text-orange-500" : "text-muted-foreground"
                      }`}
                    />
                    <span
                      className={`text-sm font-semibold ${
                        isSelected ? "text-orange-500" : "text-foreground"
                      }`}
                    >
                      {opt.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground leading-tight">
                      {opt.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selector de owner */}
          <div className="relative" ref={dropdownRef}>
            <label className="text-sm font-medium block mb-2">
              <User className="h-3.5 w-3.5 inline mr-1.5" />
              Asignar a
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={ownerSearch}
                onChange={(e) => {
                  setOwnerSearch(e.target.value);
                  setShowDropdown(true);
                  if (!e.target.value) setSelectedOwner(null);
                }}
                onFocus={() => setShowDropdown(true)}
                placeholder={loadingOwners ? "Cargando usuarios..." : "Buscar usuario por nombre o email..."}
                disabled={loadingOwners}
                className="flex h-11 w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
              />
            </div>

            {showDropdown && !loadingOwners && (
              <div className="absolute z-20 mt-1 w-full bg-background border border-border rounded-md shadow-lg max-h-72 overflow-y-auto">
                {filteredOwners.length === 0 ? (
                  <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                    No se encontraron usuarios
                  </div>
                ) : (
                  filteredOwners.map((owner) => {
                    const isSelected = selectedOwner?.id === owner.id;
                    return (
                      <div
                        key={owner.id}
                        className={`flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 cursor-pointer text-sm border-b border-border/30 last:border-0 ${
                          isSelected ? "bg-orange-500/10" : ""
                        }`}
                        onClick={() => {
                          setSelectedOwner(owner);
                          setOwnerSearch(
                            `${owner.firstName} ${owner.lastName}`.trim()
                          );
                          setShowDropdown(false);
                        }}
                      >
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                          {owner.firstName?.[0]}
                          {owner.lastName?.[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground truncate">
                            {owner.firstName} {owner.lastName}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {owner.email}
                          </p>
                        </div>
                        {isSelected && (
                          <Check className="h-4 w-4 text-orange-500 shrink-0" />
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {selectedOwner && (
              <div className="flex items-center gap-2 mt-2 p-2 bg-green-500/10 border border-green-500/30 rounded-md">
                <Check className="h-4 w-4 text-green-600 shrink-0" />
                <span className="text-sm text-green-700 dark:text-green-400">
                  Asignado a:{" "}
                  <span className="font-semibold">
                    {selectedOwner.firstName} {selectedOwner.lastName}
                  </span>
                </span>
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-500 p-3 rounded-lg text-sm">
              ❌ {error}
            </div>
          )}

          {/* Botones */}
          <div className="flex gap-2 pt-2 border-t border-border">
            <Button variant="outline" onClick={handleClear} className="flex-1">
              Limpiar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
            >
              {loading ? "Guardando..." : "Guardar asignación"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

