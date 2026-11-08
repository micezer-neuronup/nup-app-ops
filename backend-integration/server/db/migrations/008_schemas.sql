-- ────── Schemas: tables grouped by domain ────────────────────────────────────────────────────────────────────────────────────────
-- ── Runs on its own, then RESTART the server right after (docker restart server-michael): the pg pool keeps open connections
-- ──   with the old search_path and they wouldn't find the moved tables. Python jobs open a new connection each run.
-- ── core:          centres and subscriptions (Stripe webhook, Ops API, HubSpot sync).
-- ── analytics:     Amplitude ingestion (events, daily_stats, feature requests, last fetch).
-- ── opportunities: the opportunities board (commercial_opportunity, opportunity_detections).
-- ── The code doesn't qualify table names: the database search_path finds them, so nothing has to change in the code.
-- ──   New queries can (and should) qualify them: core.subscriptions, analytics.daily_stats...
-- ── SET SCHEMA moves the indexes, constraints and owned sequences with each table. Foreign keys keep working across schemas.
-- ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
BEGIN;

CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS opportunities;

ALTER TABLE public.centers                SET SCHEMA core;
ALTER TABLE public.subscriptions          SET SCHEMA core;
ALTER TABLE public.subscription_items     SET SCHEMA core;
ALTER TABLE public.subscription_events    SET SCHEMA core;

ALTER TABLE public.events                 SET SCHEMA analytics;
ALTER TABLE public.daily_stats            SET SCHEMA analytics;
ALTER TABLE public.feature_requests       SET SCHEMA analytics;
ALTER TABLE public.fetch_metadata         SET SCHEMA analytics;

ALTER TABLE public.commercial_opportunity SET SCHEMA opportunities;
ALTER TABLE public.opportunity_detections SET SCHEMA opportunities;

-- New connections (server after the restart, Python jobs, psql) find the tables without the schema prefix
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET search_path = core, analytics, opportunities, public', current_database());
END $$;

COMMIT;
