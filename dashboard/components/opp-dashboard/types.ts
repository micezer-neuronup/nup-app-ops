export interface Detection {
  detected_at: string;
  total_tests_day: number;
}

export interface Opportunity {
  id: number;
  center_id: string;
  product: string;
  status: 'pending' | 'completed';
  created_at: string;
  total_tests_60d: number;
  active_days_60d: number;
  avg_daily_60d: number;
  ai_justification: string;
  score: number;
  detections: Detection[];
  trigger_details?: any;
  hubspot_company_id?: string;
  hubspot_portal_id?: string;
  hubspot_ui_domain?: string;
  center_name?: string;
  email?: string;
  phone?: string;
  segment?: string;
  market?: string;
  hubspot_task_id?: string | null;
  upsell_object?: string | null;
  upsell_owner_id?: string | null;
  upsell_owner_name?: string | null;
  opportunity_kind?: 'upgrade' | 'review';
}