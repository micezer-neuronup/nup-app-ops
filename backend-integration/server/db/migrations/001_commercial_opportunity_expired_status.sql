-- ────── Assessment opportunities v2 ──────────────────────────────────────────────────────────────────────────────────────────────
-- ── Adds the 'expired' status: a pending opportunity whose usage fell below the floor (see scripts/opportunities/scoring.py).
-- ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
BEGIN;

ALTER TABLE commercial_opportunity DROP CONSTRAINT commercial_opportunity_status_check;

ALTER TABLE commercial_opportunity ADD CONSTRAINT commercial_opportunity_status_check
  CHECK (status::text = ANY (ARRAY['pending', 'completed', 'converted', 'expired']::text[]));

COMMIT;
