-- ────── billing: Zoho invoices, credit notes and their articles (from HubSpot) ─────────────────────────────────────────────────────
-- ── Runs BEFORE rebuilding the server (only adds a schema and tables; the new code fills them).
-- ── Zoho sends every invoice, credit note and their articles to HubSpot (custom objects, kept updated with webhooks).
-- ──   services/billingSync.js copies them here (daily cron; full on Sundays; by hand: server/scripts/syncBilling.js [--full]).
-- ── Keys and links (audits of 12/11 and 16/11/2026):
-- ──   invoice = id_factura_zoho; article = zoho_line_item_id; article.zoho_invoice_number = invoice.invoice_id (114/114).
-- ──   credit note = creditnote_zoho_id; credit_note.invoice_number = invoice.invoice_id (100/100, one invoice per credit note).
-- ──   credit note article = id; its creditnote_number = credit note id (CN…) and its invoice_item_id = the invoice LINE it refunds.
-- ──   The centre of an article is the one of its invoice (JOIN): the article's own nup_center_id is ~90 % filled.
-- ── Amounts: invoice amount = Σ article item_total (before tax; tax only in article tax_amount, to confirm with
-- ──   db/audits/2026-11_billing_checks.sql). Credit notes have no tax: sub_total = Σ item_total; amount_eur = Σ item_total_eur.
-- ── invoice_number is not unique: Academy (another Zoho organisation) could repeat numbers. Checked in the billing checks.
-- ── Text columns are text (no length limit): Zoho values vary (lists of ids, free text) and a too long value stops the whole sync.
-- ── products: one row per zoho_item_id. name / first_seen / last_seen / items_count are refreshed by the sync; family, catalogue,
-- ──   billing_period and notes are filled by hand (old products vs the 2026 catalogue) and the sync never touches them.
-- ── hubspot_deleted_at: set by the full sync when a record is no longer in HubSpot; cleared if it comes back.
-- ── Then RESTART the server (the rebuild does it): the pg pool keeps connections with the old search_path.
-- ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
BEGIN;

CREATE SCHEMA IF NOT EXISTS billing;

CREATE TABLE IF NOT EXISTS billing.invoices (
  zoho_invoice_id           text PRIMARY KEY,
  invoice_number            text,
  hubspot_object_id         bigint NOT NULL,
  nup_center_id             text,
  sociedad                  text,
  status                    text,
  status_raw                text,
  invoice_date              date,
  currency                  text,
  amount                    numeric,
  amount_eur                numeric,
  exchange_rate             numeric,
  credit_note_amount_eur    numeric,
  credit_note_date          date,
  category                  text,
  invoice_group             text,
  sales_channel             text,
  product_type              text,
  payment_method            text,
  preceding_zoho_invoice_id text,
  hubspot_deal_id           text,
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
  zoho_line_item_id   text PRIMARY KEY,
  hubspot_object_id   bigint NOT NULL,
  invoice_number      text,
  zoho_item_id        text,
  item_name           text,
  item_description    text,
  custom_item         text,
  product_kind        text,
  item_type           text,
  quantity            numeric,
  price               numeric,
  discount_pct        numeric,
  discount_amount     numeric,
  tax_name            text,
  tax_pct             numeric,
  tax_amount          numeric,
  total               numeric,
  total_eur           numeric,
  currency            text,
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

CREATE TABLE IF NOT EXISTS billing.credit_notes (
  zoho_credit_note_id     text PRIMARY KEY,
  credit_note_number      text,
  hubspot_object_id       bigint NOT NULL,
  invoice_number          text,
  zoho_invoice_id         text,
  nup_center_id           text,
  sociedad                text,
  status                  text,
  credit_note_date        date,
  issued_date             date,
  currency                text,
  sub_total               numeric,
  amount_eur              numeric,
  exchange_rate           numeric,
  total_refunded_amount   numeric,
  is_cancellation         boolean,
  type                    text,
  credit_type             text,
  sales_channel           text,
  hubspot_updated_at      timestamptz,
  hubspot_deleted_at      timestamptz,
  created_at              timestamptz NOT NULL DEFAULT NOW(),
  updated_at              timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_credit_notes_credit_note_number ON billing.credit_notes (credit_note_number);
CREATE INDEX IF NOT EXISTS idx_credit_notes_invoice_number ON billing.credit_notes (invoice_number);
CREATE INDEX IF NOT EXISTS idx_credit_notes_nup_center_id ON billing.credit_notes (nup_center_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_hubspot_object_id ON billing.credit_notes (hubspot_object_id);

CREATE TABLE IF NOT EXISTS billing.credit_note_items (
  zoho_line_item_id       text PRIMARY KEY,
  hubspot_object_id       bigint NOT NULL,
  credit_note_number      text,
  invoice_line_item_id    text,
  zoho_item_id            text,
  item_name               text,
  item_description        text,
  quantity                numeric,
  price                   numeric,
  tax_name                text,
  total                   numeric,
  total_eur               numeric,
  currency                text,
  exchange_rate           numeric,
  credit_note_date        date,
  hubspot_updated_at      timestamptz,
  hubspot_deleted_at      timestamptz,
  created_at              timestamptz NOT NULL DEFAULT NOW(),
  updated_at              timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_credit_note_items_credit_note_number ON billing.credit_note_items (credit_note_number);
CREATE INDEX IF NOT EXISTS idx_credit_note_items_invoice_line_item_id ON billing.credit_note_items (invoice_line_item_id);
CREATE INDEX IF NOT EXISTS idx_credit_note_items_hubspot_object_id ON billing.credit_note_items (hubspot_object_id);

CREATE TABLE IF NOT EXISTS billing.products (
  zoho_item_id    text PRIMARY KEY,
  name            text,
  first_seen      date,
  last_seen       date,
  items_count     integer NOT NULL DEFAULT 0,
  family          text,
  catalogue       text CHECK (catalogue IN ('legacy', '2026')),
  billing_period  text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT NOW(),
  updated_at      timestamptz NOT NULL DEFAULT NOW()
);

-- Watermark of the incremental sync: the latest hs_lastmodifieddate of a run that finished well, per HubSpot object
CREATE TABLE IF NOT EXISTS billing.sync_state (
  object            text PRIMARY KEY,
  last_modified_at  timestamptz,
  last_run_at       timestamptz,
  last_full_run_at  timestamptz
);

DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET search_path = core, analytics, opportunities, billing, public', current_database());
END $$;

COMMIT;
