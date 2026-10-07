'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Mail, Phone, Calendar, TrendingUp, CheckCircle, X, Copy, ArrowUp, ArrowRight,
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
  const isEmailCopied = copiedField?.id === opp.id && copiedField?.field === 'email';
  const isPhoneCopied = copiedField?.id === opp.id && copiedField?.field === 'phone';

  const scoreColor =
    (opp.score || 0) >= 80
      ? 'text-green-500 border-green-500'
      : (opp.score || 0) >= 60
      ? 'text-yellow-500 border-yellow-500'
      : 'text-red-500 border-red-500';

  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - ((opp.score || 0) / 100) * circumference;
  const totalDetections = opp.detections?.length || 0;

  return (
    <Card
      className={`cursor-pointer hover:bg-muted/20 transition-colors border ${
        isReviewed ? 'border-muted/30 bg-muted/10' : 'border-border bg-card'
      } rounded-lg`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 relative w-14 h-14">
            <svg className="w-14 h-14 transform -rotate-90">
              <circle
                cx="28" cy="28" r={radius}
                stroke="currentColor" strokeWidth="3" fill="none"
                className="text-muted/30"
              />
              <circle
                cx="28" cy="28" r={radius}
                stroke="currentColor" strokeWidth="3" fill="none"
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

          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-foreground truncate">
                {opp.center_name || `Centro ${opp.center_id}`}
              </p>
              <Badge variant="outline" className="text-xs font-normal text-muted-foreground border-muted-foreground/20">
                {opp.product}
              </Badge>
              <Badge
                className={`text-[10px] font-medium border ${
                  isReviewed
                    ? 'bg-muted/30 text-muted-foreground border-muted'
                    : 'bg-primary/10 text-primary border-primary/20'
                }`}
              >
                {isReviewed ? 'Revisada' : 'Pendiente'}
              </Badge>
              {!isReviewed && totalDetections > 0 && (
                <Badge className="text-[10px] font-medium border-green-500/30 bg-green-500/10 text-green-500 animate-pulse flex items-center gap-1">
                  <ArrowUp className="h-3 w-3" />
                  +{totalDetections} nuevos usos
                </Badge>
              )}
              {opp.upsell_object && (
                <Badge className="text-[10px] font-medium border-blue-500/30 bg-blue-500/10 text-blue-500">
                  {opp.upsell_object}
                  {opp.upsell_owner_name && ` · ${opp.upsell_owner_name}`}
                </Badge>
              )}


              <Badge
  variant="outline"
  className="text-xs font-normal border-primary/20 bg-primary/5 text-primary"
>
  {opp.product}
</Badge>
{opp.opportunity_kind === 'review' && (
  <Badge className="text-xs font-medium border-yellow-500/30 bg-yellow-500/10 text-yellow-600">
    ⚠️ Revisar
  </Badge>
)}
<span className="text-sm text-muted-foreground">ID: {opp.center_id}</span>
            </div>

            





            <div className="flex flex-wrap items-center gap-1.5">
              <div className="flex items-center gap-1 bg-muted/30 rounded-md px-2 py-0.5 text-sm text-foreground/80">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="truncate max-w-[120px]">{opp.email || '-'}</span>
                <Button
                  variant="ghost" size="icon"
                  className="h-5 w-5 rounded-full hover:bg-primary/10 text-muted-foreground hover:text-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (opp.email) onCopy(opp.id, 'email', opp.email);
                  }}
                  title="Copiar email"
                >
                  {isEmailCopied ? <CheckCircle className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                </Button>
              </div>

              <div className="flex items-center gap-1 bg-muted/30 rounded-md px-2 py-0.5 text-sm text-foreground/80">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="truncate max-w-[120px]">{opp.phone || '-'}</span>
                <Button
                  variant="ghost" size="icon"
                  className="h-5 w-5 rounded-full hover:bg-primary/10 text-muted-foreground hover:text-primary"
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

            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1 font-medium text-foreground/80">
                <TrendingUp className="h-3.5 w-3.5" />
                <span className="text-base font-bold text-foreground">{opp.total_tests_60d}</span> tests (60d)
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {formatDate(opp.created_at)}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 ml-2 shrink-0">
            <Button
              variant="ghost" size="sm"
              className="h-9 px-3 rounded-md text-orange-400 hover:text-orange-300 hover:bg-orange-400/10 gap-1.5 text-xs font-medium"
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
              className="h-9 px-3 rounded-md text-orange-400 hover:text-orange-300 hover:bg-orange-400/10 gap-1.5 text-xs font-medium"
              onClick={(e) => {
                e.stopPropagation();
                onAssignUpsell(opp);
              }}
            >
              <Calendar className="h-4 w-4" />
              {opp.upsell_object ? 'Editar asignación' : 'Asignar oportunidad'}
            </Button>

            {!isReviewed ? (
              <Button
                variant="ghost" size="sm"
                className="h-9 px-3 rounded-md text-green-500 hover:text-green-400 hover:bg-green-500/10 gap-1.5 text-xs font-medium"
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
                className="h-9 px-3 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 gap-1.5 text-xs font-medium"
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
              className="h-9 px-3 rounded-md text-green-500 hover:text-green-400 hover:bg-green-500/10 gap-1.5 text-xs font-medium animate-pulse"
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
        </div>
      </CardContent>
    </Card>
  );
}