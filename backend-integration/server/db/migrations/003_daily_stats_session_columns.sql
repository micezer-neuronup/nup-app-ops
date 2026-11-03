-- ────── daily_stats: session detail for the Sesiones module ─────────────────────────────────────────────────────────────────────
-- ── The raw events table is purged every few months, so what the opportunities need is kept per day here.
-- ── sessions_home_started / sessions_home_finished: 'Session - Started' / 'Session - Finished' with event_properties.home = true
-- ──   (session done at home, not in the center).
-- ── session_patients: distinct patients with a started or finished session that day. It can't be added up across days
-- ──   (the same patient counts once per day), so it is used as an average per active day, not as unique patients.
-- ── Filled by scripts/amplitude/daily_events.py. Past days: scripts/amplitude/backfill.py
-- ──   (downloads the events again from Amplitude and recalculates daily_stats for each day).
-- ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
BEGIN;

ALTER TABLE daily_stats
  ADD COLUMN IF NOT EXISTS sessions_home_started integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sessions_home_finished integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS session_patients integer DEFAULT 0;

COMMIT;
