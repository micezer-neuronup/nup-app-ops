-- ────── Assessment opportunities: AI contact brief ──────────────────────────────────────────────────────────────────────────────
-- ── ai_brief: {"summary": "...", "points": ["...", "..."]} written by scripts/opportunities/ai_brief.py in the weekly job.
-- ── ai_brief_signature: kind|priority|trend_dir when it was generated. If it changes, the brief is regenerated.
-- ── ai_justification keeps the deterministic template as the fallback.
-- ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
BEGIN;

ALTER TABLE commercial_opportunity
  ADD COLUMN IF NOT EXISTS ai_brief jsonb,
  ADD COLUMN IF NOT EXISTS ai_brief_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_brief_signature text;

COMMIT;
