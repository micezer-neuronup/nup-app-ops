-- ────── subscriptions: billing fields from the invoices (Zoho, billing schema) ──────────────────────────────────────────────────
-- ── Runs BEFORE rebuilding the server (only adds columns; the new code fills them).
-- ── The money fields of the subscriptions now have one source: billing.center_billing (Zoho invoices copied from HubSpot).
-- ──   They are facts of the centre, copied to every LIVE subscription of the centre (active, past_due, trial) by
-- ──   applyBillingToSubscriptions (db/dbBilling.js) after each billing sync. Subscriptions that are not live keep their last value.
-- ──   Stripe no longer writes pending_payment, last_invoice_* or number_of_renovations (webhook, backfill).
-- ── New columns:
-- ──   number_of_renovations: renewal invoices of the centre (RR-Renovación-*). subscription_items.number_of_renovations is no
-- ──     longer written; HubSpot and the dashboard read this one.
-- ──   paid_until: latest paid date of a NeuronUP plan (center_billing.paid_until_platform). It doesn't change current_state,
-- ──     cancelation_date or is_forever: the state still comes from Stripe and the Ops API.
-- ──   billing_status: up_to_date | renewal_due | expired | no_platform | no_service_dates | no_invoice.
-- ── Existing columns with a new meaning: last_invoice_amount is the EUR amount before tax (amount_eur), last_invoice_status the
-- ──   normalised Zoho status (paid, sent, overdue, partially_paid, refunded...), pending_payment = sent / overdue / partially paid.
-- ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
BEGIN;

ALTER TABLE core.subscriptions
  ADD COLUMN IF NOT EXISTS number_of_renovations integer,
  ADD COLUMN IF NOT EXISTS paid_until date,
  ADD COLUMN IF NOT EXISTS billing_status text;

COMMIT;
