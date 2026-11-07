-- ────── subscriptions: is_forever computed by Postgres, unused columns dropped ───────────────────────────────────────────────────
-- ── Runs RIGHT AFTER rebuilding the server with the code that no longer writes these columns. With the old code running,
-- ──   inserts would fail ("cannot insert a non-DEFAULT value into column is_forever").
-- ── is_forever: live (active / past_due / trial) and without an end date. The same as the old formulas (Stripe: not
-- ──   cancelled, no ended_at, no cancel_at; manual: alive, no period end, not cancelled), but it can't contradict the state
-- ──   anymore: on prod 25215 cancelled Stripe subscriptions had is_forever = true (07/11/2026).
-- ── subscription_items.is_forever is dropped: it was always the parent's. Readers use subscriptions.is_forever.
-- ── manages_own_payment: never filled, and there is no source (parent / child centres are not in any system).
-- ── creation_source: duplicated source ('manual' = 'backend').
-- ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
BEGIN;

ALTER TABLE subscriptions DROP COLUMN IF EXISTS is_forever;
ALTER TABLE subscriptions
  ADD COLUMN is_forever boolean
    GENERATED ALWAYS AS (current_state IN ('active', 'past_due', 'trial') AND cancelation_date IS NULL) STORED;

ALTER TABLE subscription_items DROP COLUMN IF EXISTS is_forever;

ALTER TABLE subscriptions
  DROP COLUMN IF EXISTS manages_own_payment,
  DROP COLUMN IF EXISTS creation_source;

COMMIT;
