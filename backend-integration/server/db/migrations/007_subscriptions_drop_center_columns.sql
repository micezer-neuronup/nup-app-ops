-- ────── subscriptions: centre data moves to centers ──────────────────────────────────────────────────────────────────────────────
-- ── Runs AFTER rebuilding the server with the code that no longer writes these columns (with the old code, the webhook and
-- ──   the Stripe backfill would fail on insert).
-- ── center_name, segment and market describe the centre, not the subscription: they live in centers (HubSpot company, migration
-- ──   006). Readers (HubSpot sync account_name, getSubscriptionByCenterId) join centers: COALESCE(name, commercial_name).
-- ── center_name was Stripe's customer billing name (manual subscriptions had none); segment and market were always empty.
-- ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
BEGIN;

ALTER TABLE subscriptions
  DROP COLUMN IF EXISTS center_name,
  DROP COLUMN IF EXISTS segment,
  DROP COLUMN IF EXISTS market;

COMMIT;
