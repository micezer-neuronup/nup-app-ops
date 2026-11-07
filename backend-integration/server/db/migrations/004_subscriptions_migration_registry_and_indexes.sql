-- ────── subscriptions: manual → Stripe registry, item centres and indexes ───────────────────────────────────────────────────────
-- ── Runs BEFORE rebuilding the server: everything here is compatible with the current code (only adds things).
-- ── migrated_to_subscription_id: on a manual subscription (source 'backend'), the Stripe subscription it moved to.
-- ──   The Ops API keeps the same record and changes its kind from manual to stripe, so the Stripe row carries the manual id
-- ──   in backend_subscription_id. NOT NULL = the manual subscription migrated to Stripe. Kept up to date by
-- ──   scripts/fullBackfillManual.js (closeMigratedManualSubs), which also closes the manual row if it was still live.
-- ── Items without centre: Stripe items created before the Ops API knew the subscription kept nup_center_id NULL, as
-- ──   fullBackfillStripe.js did not update it on conflict (1009 on prod, 07/11/2026). They take their subscription's centre.
-- ── Indexes: nup_center_id and the subscription/backend ids are used in every join (opportunities, HubSpot, dashboard).
-- ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
BEGIN;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS migrated_to_subscription_id varchar(255)
    REFERENCES subscriptions(subscription_id) ON DELETE SET NULL;

-- Existing pairs (56 on prod). If a manual id has several Stripe rows, the most recent one.
UPDATE subscriptions m
SET migrated_to_subscription_id = s.subscription_id
FROM (
  SELECT DISTINCT ON (backend_subscription_id) backend_subscription_id, subscription_id
  FROM subscriptions
  WHERE source = 'stripe' AND backend_subscription_id IS NOT NULL
  ORDER BY backend_subscription_id, start_date DESC NULLS LAST
) s
WHERE m.source = 'backend'
  AND s.backend_subscription_id = m.subscription_id
  AND m.migrated_to_subscription_id IS DISTINCT FROM s.subscription_id;

UPDATE subscription_items i
SET nup_center_id = s.nup_center_id
FROM subscriptions s
WHERE s.subscription_id = i.subscription_id
  AND i.nup_center_id IS NULL
  AND s.nup_center_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_nup_center_id ON subscriptions (nup_center_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_backend_subscription_id ON subscriptions (backend_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscription_items_subscription_id ON subscription_items (subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscription_items_nup_center_id ON subscription_items (nup_center_id);

COMMIT;
