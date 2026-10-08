'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Mail, Phone, Calendar, TrendingUp, CheckCircle, X, Copy, ArrowUp, ArrowRight, Info,
} from 'lucide-react';
import { HubSpotIcon } from './shared/HubSpotIcon';
import type { Opportunity } from './types';

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
};

interface Props {
  opp: Opportunity;
  onMarkReviewed: (id: number) => void;
  onMarkPending?: (id: number) => void;
  onClick: () => void;
  onCopy: (id: number, field: string, value: string) => void;
  copiedField: { id: number; field: string } | null;
  onAssignUpsell: (opp: Opportunity) => void;
  isReviewed?: boolean;
}

export function OpportunityCard({
  opp,
  onMarkReviewed,
  onMarkPending,
  onClick,
  onCopy,
  copiedField,
  onAssignUpsell,
  isReviewed = false,
}: Props) {
  const [flipped, setFlipped] = useState(false);

  const isEmailCopied = copiedField?.id === opp.id && copiedField?.field === 'email';
  const isPhoneCopied = copiedField?.id === opp.id && copiedField?.field === 'phone';
  const isNupCopied = copiedField?.id === opp.id && copiedField?.field === 'nup_id';

  const scoreColor =
    (opp.score || 0) >= 80
      ? 'text-green-500 border-green-500'
      : (opp.score || 0) >= 60
      ? 'text-yellow-500 border-yellow-500'
      : 'text-red-500 border-red-500';

  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - ((opp.score || 0) / 100) * circumference;
  const totalDetections = opp.detections?.length || 0;

  return (
    <div
      className="relative w-full [perspective:1200px]"
      style={{ minHeight: '230px' }}
    >
      <div
        className={`relative w-full h-full transition-transform duration-500 [transform-style:preserve-3d] ${
          flipped ? '[transform:rotateY(180deg)]' : ''
        }`}
      >
        {/* ================= CARA FRONTAL ================= */}
        <div className="[backface-visibility:hidden]">
          <Card
            className={`cursor-pointer transition-all border ${
              isReviewed
                ? 'border-border/50 bg-muted/10 hover:border-[#00a4c2]/40'
                : 'border-border bg-card hover:border-[#00a4c2]/60 hover:bg-[#00a4c2]/[0.03]'
            } rounded-lg overflow-hidden`}
            onClick={onClick}
          >
            <CardContent className="p-3 flex flex-col gap-3 relative">
              {/* Botón "i" en la esquina superior derecha */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFlipped(true);
                }}
                className="absolute top-2 right-2 z-10 inline-flex items-center justify-center h-6 w-6 rounded-full bg-[#00a4c2]/10 hover:bg-[#00a4c2]/25 border border-[#00a4c2]/30 text-[#00a4c2] transition-colors"
                title="Ver explicación de la card"
                aria-label="Ver explicación"
              >
                <Info className="h-3.5 w-3.5" />
              </button>

              {/* ===== FILA SUPERIOR: score + info principal ===== */}
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 relative w-14 h-14">
                  <svg className="w-14 h-14 transform -rotate-90">
                    <circle
                      cx="28" cy="28" r={radius}
                      stroke="currentColor" strokeWidth="3.5" fill="none"
                      className="text-muted/30"
                    />
                    <circle
                      cx="28" cy="28" r={radius}
                      stroke="currentColor" strokeWidth="3.5" fill="none"
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                      className={`${scoreColor} transition-all duration-500`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className={`text-sm font-bold ${scoreColor}`}>{opp.score || 0}%</span>
                  </div>
                </div>

                <div className="flex-1 min-w-0 space-y-2 pr-6">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-foreground text-base truncate">
                      {opp.center_name || `Centro ${opp.center_id}`}
                    </p>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCopy(opp.id, 'nup_id', String(opp.center_id));
                      }}
                      className="inline-flex items-center gap-1 rounded-md bg-[#00a4c2]/10 hover:bg-[#00a4c2]/20 border border-[#00a4c2]/20 hover:border-[#00a4c2]/40 px-2 py-0.5 text-xs font-medium text-foreground transition-colors"
                      title="Copiar nup_id"
                    >
                      <span className="text-[#00a4c2]">nup_id:</span>
                      <span className="font-semibold">{opp.center_id}</span>
                      {isNupCopied ? (
                        <CheckCircle className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3 text-[#00a4c2]" />
                      )}
                    </button>

                    {totalDetections > 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-green-500/15 border border-green-500/40 px-2.5 py-1">
                        <ArrowUp className="h-4 w-4 text-green-500" />
                        <span className="text-base font-bold text-green-500 leading-none">
                          +{totalDetections}
                        </span>
                        <span className="text-xs font-semibold text-green-500/90">
                          usos nuevos
                        </span>
                      </span>
                    )}

                    {opp.upsell_object && (
                      <Badge className="text-[11px] font-medium border-[#00a4c2]/40 bg-[#00a4c2]/15 text-[#00a4c2]">
                        {opp.upsell_object}
                        {opp.upsell_owner_name && ` · ${opp.upsell_owner_name}`}
                      </Badge>
                    )}

                    {opp.opportunity_kind === 'review' && (
                      <Badge className="text-[11px] font-medium border-yellow-500/40 bg-yellow-500/15 text-yellow-500">
                        ⚠️ Revisar
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                      <TrendingUp className="h-4 w-4 text-foreground/70" />
                      <span className="text-xl font-bold text-foreground leading-none">
                        {opp.total_tests_60d}
                      </span>
                      <span className="text-xs font-medium text-foreground/80 self-end pb-0.5">
                        tests (60d)
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-4 w-4 text-foreground/70" />
                      <span className="text-sm font-semibold text-foreground">
                        {formatDate(opp.created_at)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5 bg-muted/40 rounded-md px-2 py-1 text-sm text-foreground hover:bg-[#00a4c2]/10 transition-colors">
                      <Mail className="h-3.5 w-3.5 text-foreground/70" />
                      <span className="truncate max-w-[180px]">{opp.email || '-'}</span>
                      <Button
                        variant="ghost" size="icon"
                        className="h-5 w-5 rounded-full hover:bg-[#00a4c2]/15 text-foreground/70 hover:text-[#00a4c2]"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (opp.email) onCopy(opp.id, 'email', opp.email);
                        }}
                        title="Copiar email"
                      >
                        {isEmailCopied ? <CheckCircle className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                      </Button>
                    </div>

                    <div className="flex items-center gap-1.5 bg-muted/40 rounded-md px-2 py-1 text-sm text-foreground hover:bg-[#00a4c2]/10 transition-colors">
                      <Phone className="h-3.5 w-3.5 text-foreground/70" />
                      <span className="truncate max-w-[140px]">{opp.phone || '-'}</span>
                      <Button
                        variant="ghost" size="icon"
                        className="h-5 w-5 rounded-full hover:bg-[#00a4c2]/15 text-foreground/70 hover:text-[#00a4c2]"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (opp.phone) onCopy(opp.id, 'phone', opp.phone);
                        }}
                        title="Copiar teléfono"
                      >
                        {isPhoneCopied ? <CheckCircle className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* ===== BOTONES ABAJO ===== */}
              <div className="flex items-center gap-1 border-t border-border/50 pt-2">
                <Button
                  variant="ghost" size="sm"
                  className="flex-1 h-8 px-2 rounded-md text-orange-400 hover:text-orange-300 hover:bg-orange-400/10 gap-1.5 text-xs font-medium"
                  onClick={(e) => {
                    e.stopPropagation();
                    const companyId = opp.hubspot_company_id;
                    const portalId = opp.hubspot_portal_id || '143501970';
                    const uiDomain = 'app-eu1.hubspot.com';
                    if (companyId) {
                      window.open(`https://${uiDomain}/contacts/${portalId}/record/0-2/${companyId}/`, '_blank');
                    } else {
                      alert('No se encontró el ID de HubSpot para este centro.');
                    }
                  }}
                  title="Ver en HubSpot"
                >
                  <HubSpotIcon className="h-4 w-4" />
                  HubSpot
                </Button>

                <Button
                  variant="ghost" size="sm"
                  className="flex-1 h-8 px-2 rounded-md text-orange-400 hover:text-orange-300 hover:bg-orange-400/10 gap-1.5 text-xs font-medium"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAssignUpsell(opp);
                  }}
                >
                  <Calendar className="h-4 w-4" />
                  {opp.upsell_object ? 'Editar' : 'Asignar'}
                </Button>

                {!isReviewed ? (
                  <Button
                    variant="ghost" size="sm"
                    className="flex-1 h-8 px-2 rounded-md text-green-500 hover:text-green-400 hover:bg-green-500/10 gap-1.5 text-xs font-medium"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMarkReviewed(opp.id);
                    }}
                    title="Marcar como revisado"
                  >
                    <CheckCircle className="h-4 w-4" />
                    Revisar
                  </Button>
                ) : (
                  <Button
                    variant="ghost" size="sm"
                    className="flex-1 h-8 px-2 rounded-md text-foreground/80 hover:text-red-500 hover:bg-red-500/10 gap-1.5 text-xs font-medium"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMarkPending?.(opp.id);
                    }}
                    title="Volver a pendiente"
                  >
                    <X className="h-4 w-4" />
                    Deshacer
                  </Button>
                )}

                <Button
                  variant="ghost" size="sm"
                  className="flex-1 h-8 px-2 rounded-md text-[#00a4c2] hover:text-[#33b8d0] hover:bg-[#00a4c2]/10 gap-1.5 text-xs font-medium"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClick();
                  }}
                  title="Abrir detalles"
                >
                  <ArrowRight className="h-4 w-4" />
                  Detalles
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ================= CARA TRASERA (explicación) ================= */}
        <div
          className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]"
        >
          <Card className="border-[#00a4c2]/40 bg-gradient-to-br from-[#00a4c2] to-[#008aa3] text-white rounded-lg overflow-hidden h-full">
            <CardContent className="p-4 h-full flex flex-col gap-3 relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFlipped(false);
                }}
                className="absolute top-2 right-2 z-10 inline-flex items-center justify-center h-6 w-6 rounded-full bg-white/15 hover:bg-white/30 text-white transition-colors"
                title="Volver"
                aria-label="Cerrar explicación"
              >
                <X className="h-3.5 w-3.5" />
              </button>

              <div className="flex items-center gap-2">
                <Info className="h-4 w-4" />
                <h3 className="text-sm font-semibold">¿Qué significa esta card?</h3>
              </div>

              <ul className="text-xs space-y-2 leading-relaxed overflow-y-auto pr-1 flex-1">
                <li className="flex gap-2">
                  <span className="font-bold min-w-[70px]">Score</span>
                  <span className="text-white/90">
                    Puntuación global de la oportunidad (0-100%). Verde ≥80, amarillo ≥60, rojo &lt;60.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold min-w-[70px]">nup_id</span>
                  <span className="text-white/90">
                    Identificador del centro en NeuronUP. Pulsa para copiarlo.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold min-w-[70px]">Usos nuevos</span>
                  <span className="text-white/90">
                    Número de detecciones nuevas registradas en los últimos días que han disparado la oportunidad.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold min-w-[70px]">Tests (60d)</span>
                  <span className="text-white/90">
                    Total de tests realizados por el centro en los últimos 60 días.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold min-w-[70px]">Fecha</span>
                  <span className="text-white/90">
                    Fecha en que se generó la oportunidad.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold min-w-[70px]">Email / Tel.</span>
                  <span className="text-white/90">
                    Datos de contacto del centro. Pulsa el icono de copiar para copiarlos.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold min-w-[70px]">Botones</span>
                  <span className="text-white/90">
                    <b>HubSpot</b>: abre la ficha del centro. <b>Asignar</b>: asigna la oportunidad a un comercial. <b>Revisar</b>: marca como revisada. <b>Detalles</b>: abre el modal con toda la información.
                  </span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}