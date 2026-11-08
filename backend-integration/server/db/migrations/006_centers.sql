-- ────── centers: one row per NeuronUP centre ─────────────────────────────────────────────────────────────────────────────────────
-- ── Runs BEFORE rebuilding the server (only adds a table; the new code reads it).
-- ── The universe of centres is HubSpot: every company with a numeric nup_center_id (52665 on prod, 08/11/2026). Every centre
-- ──   with a subscription has one, but not every company with nup_center_id has a subscription.
-- ── Filled by services/centersSync.js (daily cron, or by hand: server/scripts/syncCenters.js):
-- ──   HubSpot company: hubspot_company_id (the company that HAS the nup_center_id), name, commercial_name, segment (segmento,
-- ──     filled little by little in HubSpot, null while empty), market (market_hubspot), currency (currency__por_definir_, upper).
-- ──   Ops API (only centres with subscriptions): stripe_customer_id, zoho_contact_id.
-- ── The Ops API hubspotCompanyId is NOT used: after a merge in HubSpot it keeps the id of the company that disappeared
-- ──   (~165 centres on prod), so the company is always the one HubSpot has for the nup_center_id.
-- ── Non-numeric nup_center_id in HubSpot (phones, NIFs... 75 on prod) are left out and listed in the sync log.
-- ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
BEGIN;

CREATE TABLE IF NOT EXISTS centers (
  nup_center_id       varchar(50) PRIMARY KEY CHECK (nup_center_id ~ '^[0-9]+$'),
  hubspot_company_id  varchar(50) UNIQUE,
  name                varchar(255),
  commercial_name     varchar(255),
  segment             varchar(100),
  market              varchar(50),
  currency            varchar(10),
  stripe_customer_id  varchar(255),
  zoho_contact_id     varchar(50),
  hubspot_updated_at  timestamptz,
  created_at          timestamptz NOT NULL DEFAULT NOW(),
  updated_at          timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_centers_market ON centers (market);
CREATE INDEX IF NOT EXISTS idx_centers_segment ON centers (segment);
CREATE INDEX IF NOT EXISTS idx_centers_stripe_customer_id ON centers (stripe_customer_id);

COMMIT;
