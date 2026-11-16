-- ────── billing: Zoho invoices and articles (from HubSpot) ───────────────────────────────────────────────────────────────────────
-- ── Runs BEFORE rebuilding the server (only adds a schema and tables; the new code fills them).
-- ── Zoho sends every invoice and its articles to HubSpot (custom objects 2-145603246 and 2-202420827, kept updated with webhooks).
-- ──   services/billingSync.js copies them here (daily cron; full on Sundays; by hand: server/scripts/syncBilling.js [--full]).
-- ── Keys (audit of 12/11/2026): invoice = id_factura_zoho (Zoho id); article = zoho_line_item_id. An article belongs to the invoice
-- ──   whose invoice_id (INV-…) equals its zoho_invoice_number (114/114 in the audit), so no HubSpot associations are needed.
-- ──   The centre of an article is the one of its invoice (JOIN): the article's own nup_center_id is ~90 % filled.
-- ── invoice_number is not unique: Academy (another Zoho organisation) could repeat numbers. Checked in db/audits/2026-11_billing_checks.sql.
-- ── products: one row per zoho_item_id. name / first_seen / last_seen / items_count are refreshed by the sync; family, catalogue,
-- ──   billing_period and notes are filled by hand (old products vs the 2026 catalogue) and the sync never touches them.
-- ── hubspot_deleted_at: set by the full sync when a record is no longer in HubSpot; cleared if it comes back.
-- ── Then RESTART the server (the rebuild does it): the pg pool keeps connections with the old search_path.
-- ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
BEGIN;

CREATE SCHEMA IF NOT EXISTS billing;

CREATE TABLE IF NOT EXISTS billing.invoices (
  zoho_invoice_id           varchar(50) PRIMARY KEY,
  invoice_number            varchar(50),
  hubspot_object_id         bigint NOT NULL,
  nup_center_id             varchar(50),
  sociedad                  varchar(100),
  status                    varchar(20),
  status_raw                varchar(50),
  invoice_date              date,
  currency                  varchar(10),
  amount                    numeric,
  amount_eur                numeric,
  exchange_rate             numeric,
  credit_note_amount_eur    numeric,
  credit_note_date          date,
  category                  varchar(100),
  invoice_group             varchar(10),
  sales_channel             varchar(50),
  product_type              varchar(50),
  payment_method            varchar(50),
  preceding_zoho_invoice_id varchar(50),
  hubspot_deal_id           varchar(50),
  hubspot_updated_at        timestamptz,
  hubspot_deleted_at        timestamptz,
  created_at                timestamptz NOT NULL DEFAULT NOW(),
  updated_at                timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON billing.invoices (invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_nup_center_id ON billing.invoices (nup_center_id);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_date ON billing.invoices (invoice_date);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON billing.invoices (status);
CREATE INDEX IF NOT EXISTS idx_invoices_hubspot_object_id ON billing.invoices (hubspot_object_id);

CREATE TABLE IF NOT EXISTS billing.invoice_items (
  zoho_line_item_id   varchar(50) PRIMARY KEY,
  hubspot_object_id   bigint NOT NULL,
  invoice_number      varchar(50),
  zoho_item_id        varchar(50),
  item_name           varchar(255),
  item_description    text,
  custom_item         varchar(255),
  product_kind        varchar(20),
  item_type           varchar(20),
  quantity            numeric,
  price               numeric,
  discount_pct        numeric,
  discount_amount     numeric,
  tax_name            varchar(50),
  tax_pct             numeric,
  tax_amount          numeric,
  total               numeric,
  total_eur           numeric,
  currency            varchar(10),
  invoice_date        date,
  service_start       date,
  service_end         date,
  hubspot_updated_at  timestamptz,
  hubspot_deleted_at  timestamptz,
  created_at          timestamptz NOT NULL DEFAULT NOW(),
  updated_at          timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_number ON billing.invoice_items (invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoice_items_zoho_item_id ON billing.invoice_items (zoho_item_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_service_end ON billing.invoice_items (service_end);
CREATE INDEX IF NOT EXISTS idx_invoice_items_hubspot_object_id ON billing.invoice_items (hubspot_object_id);

CREATE TABLE IF NOT EXISTS billing.products (
  zoho_item_id    varchar(50) PRIMARY KEY,
  name            varchar(255),
  first_seen      date,
  last_seen       date,
  items_count     integer NOT NULL DEFAULT 0,
  family          varchar(100),
  catalogue       varchar(20) CHECK (catalogue IN ('legacy', '2026')),
  billing_period  varchar(20),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  updated_at      timestamptz NOT NULL DEFAULT NOW()
);

-- Watermark of the incremental sync: the latest hs_lastmodifieddate of a run that finished well, per HubSpot object
CREATE TABLE IF NOT EXISTS billing.sync_state (
  object            varchar(30) PRIMARY KEY,
  last_modified_at  timestamptz,
  last_run_at       timestamptz,
  last_full_run_at  timestamptz
);

DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET search_path = core, analytics, opportunities, billing, public', current_database());
END $$;

COMMIT;
