-- ────── michael_db: full schema ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- ── The whole structure of the database as it is after migrations 001-008 (taken from the prod pg_dump of 07/11/2026 plus the
-- ──   migrations applied since). It is only for a NEW, empty database: an existing one is updated with db/migrations/.
-- ── Run: psql -U michael -d michael_db -f backend-integration/server/db/schema.sql
-- ── When a migration changes the structure, update this file in the same change, so both stay the same.
-- ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
BEGIN;

CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS opportunities;

DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET search_path = core, analytics, opportunities, public', current_database());
END $$;


-- ────── core: centres and subscriptions ─────────────────────────────────────────────────────────────────────────────────────────────

-- One row per centre: HubSpot companies with numeric nup_center_id + Stripe / Zoho IDs from the Ops API (services/centersSync.js)
CREATE TABLE core.centers (
  nup_center_id       varchar(50) PRIMARY KEY CHECK (nup_center_id ~ '^[0-9]+$'),
  hubspot_company_id  varchar(50) UNIQUE,
  name                varchar(255),
  commercial_name     varchar(255),
  segment             varchar(100),
  market              varchar(50),
  currency            varchar(10),
  stripe_customer_id  varchar(255),
  zoho_contact_id     varchar(50),
  hubspot_updated_at  timestamptz,
  created_at          timestamptz NOT NULL DEFAULT NOW(),
  updated_at          timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_centers_market ON core.centers (market);
CREATE INDEX idx_centers_segment ON core.centers (segment);
CREATE INDEX idx_centers_stripe_customer_id ON core.centers (stripe_customer_id);

-- Stripe (subscription_id = sub_…) and manual (subscription_id = Ops API id, source 'backend') subscriptions
CREATE TABLE core.subscriptions (
  subscription_id             varchar(255) PRIMARY KEY,
  hubspot_subscription_id     varchar(255),
  nup_center_id               varchar(255),
  start_date                  timestamptz,
  precancelled_date           timestamptz,
  cancelation_date            timestamptz,
  revoked_access_date         timestamptz,
  current_state               varchar(50),
  currency                    varchar(10),
  source                      varchar(50),
  payment_method_type         varchar(100),
  pending_payment             boolean,
  last_invoice_status         varchar(100),
  last_invoice_amount         numeric(10,2),
  last_invoice_date           date,
  hubspot_sync_status         varchar(20) DEFAULT 'PENDING',
  updated_at                  timestamptz DEFAULT CURRENT_TIMESTAMP,
  backend_subscription_id     varchar(255),
  access                      varchar(50),
  migrated_to_subscription_id varchar(255) REFERENCES core.subscriptions(subscription_id) ON DELETE SET NULL,
  -- Computed by Postgres: live and without an end date (migration 005)
  is_forever                  boolean GENERATED ALWAYS AS
                                (current_state IN ('active', 'past_due', 'trial') AND cancelation_date IS NULL) STORED
);
CREATE INDEX idx_subscriptions_nup_center_id ON core.subscriptions (nup_center_id);
CREATE INDEX idx_subscriptions_backend_subscription_id ON core.subscriptions (backend_subscription_id);

CREATE TABLE core.subscription_items (
  item_id               varchar(255) PRIMARY KEY,
  hubspot_item_id       varchar(255),
  subscription_id       varchar(255) REFERENCES core.subscriptions(subscription_id) ON DELETE CASCADE,
  nup_center_id         varchar(255),
  product_id            varchar(255),
  product_name          varchar(255),
  billing_interval      varchar(50),
  payment_frequency     varchar(50),
  unit_price            numeric(10,2),
  features              jsonb,
  quantity              integer,
  number_of_renovations integer DEFAULT 0,
  start_date            timestamptz,
  current_period_start  timestamptz,
  current_period_end    timestamptz,
  status                varchar(50),
  precancelled_date     timestamptz,
  updated_at            timestamptz DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_subscription_items_subscription_id ON core.subscription_items (subscription_id);
CREATE INDEX idx_subscription_items_nup_center_id ON core.subscription_items (nup_center_id);

-- Raw Stripe webhook payloads
CREATE TABLE core.subscription_events (
  event_id        varchar(255) PRIMARY KEY,
  subscription_id varchar(255),
  event_type      varchar(255),
  raw_payload     jsonb,
  created_at      timestamptz DEFAULT CURRENT_TIMESTAMP
);


-- ────── analytics: Amplitude ingestion ──────────────────────────────────────────────────────────────────────────────────────────────

-- Raw Amplitude events (purged every few months: what has to be kept goes to daily_stats)
CREATE TABLE analytics.events (
  event_id_amplitude varchar PRIMARY KEY,
  center_id          varchar,
  user_id            varchar,
  patient_id         varchar,
  event_type         varchar,
  event_timestamp    timestamp,
  session_id         bigint,
  device_id          varchar,
  platform           varchar,
  event_properties   jsonb,
  user_properties    jsonb,
  inserted_at        timestamp DEFAULT NOW()
);
CREATE INDEX idx_events_center_timestamp ON analytics.events (center_id, event_timestamp);
CREATE INDEX idx_events_event_properties ON analytics.events USING gin (event_properties);
CREATE INDEX idx_events_type ON analytics.events (event_type);

-- One row per centre and day (scripts/amplitude/daily_events.py)
CREATE TABLE analytics.daily_stats (
  id                     serial PRIMARY KEY,
  center_id              varchar(255) NOT NULL,
  stat_date              date NOT NULL,
  active_therapists      integer DEFAULT 0,
  total_logins           integer DEFAULT 0,
  activities_started     integer DEFAULT 0,
  sessions_created       integer DEFAULT 0,
  sessions_assigned      integer DEFAULT 0,
  sessions_started       integer DEFAULT 0,
  sessions_finished      integer DEFAULT 0,
  tests_started          integer DEFAULT 0,
  tests_finished         integer DEFAULT 0,
  reports_created        integer DEFAULT 0,
  exercises_downloaded   integer DEFAULT 0,
  materials_downloaded   integer DEFAULT 0,
  features_requested     integer DEFAULT 0,
  sessions_home_started  integer DEFAULT 0,
  sessions_home_finished integer DEFAULT 0,
  session_patients       integer DEFAULT 0,
  UNIQUE (center_id, stat_date)
);

CREATE TABLE analytics.feature_requests (
  id           serial PRIMARY KEY,
  center_id    varchar(255) NOT NULL,
  feature_name varchar(255) NOT NULL,
  requested_at timestamp NOT NULL,
  status       varchar(50) DEFAULT 'pending'
);

-- Last Amplitude fetch (single row, id = 1)
CREATE TABLE analytics.fetch_metadata (
  id                   integer PRIMARY KEY,
  last_fetch_timestamp timestamp,
  updated_at           timestamp
);


-- ────── opportunities: the opportunities board ─────────────────────────────────────────────────────────────────────────────────────

CREATE TABLE opportunities.commercial_opportunity (
  id                      serial PRIMARY KEY,
  center_id               varchar(50) NOT NULL,
  type                    varchar(20) DEFAULT 'upsell',
  product                 varchar(50) DEFAULT 'assessments',
  trigger_source          varchar(30) DEFAULT 'usage_metric',
  trigger_details         jsonb,
  ai_justification        text,
  status                  varchar(20) DEFAULT 'pending'
                            CHECK (status IN ('pending', 'completed', 'converted', 'expired')),
  created_at              timestamp DEFAULT NOW(),
  updated_at              timestamp DEFAULT NOW(),
  reported_at             timestamp,
  total_tests_60d         integer NOT NULL,
  active_days_60d         integer NOT NULL,
  avg_daily_60d           numeric(5,2) NOT NULL,
  score                   integer DEFAULT 0,
  hubspot_task_id         varchar(255),
  upsell_object           varchar(20),
  upsell_owner_id         varchar(50),
  upsell_owner_name       varchar(255),
  score_base              integer DEFAULT 0,
  opportunity_kind        varchar(20) DEFAULT 'upgrade',
  current_total_tests_60d integer,
  current_active_days_60d integer,
  current_avg_daily_60d   numeric(5,2),
  ai_brief                jsonb,
  ai_brief_at             timestamptz,
  ai_brief_signature      text,
  last_detected_at        timestamp
);
CREATE INDEX idx_commercial_opportunity_center_id ON opportunities.commercial_opportunity (center_id);
CREATE INDEX idx_commercial_opportunity_created_at ON opportunities.commercial_opportunity (created_at DESC);
CREATE INDEX idx_commercial_opportunity_score ON opportunities.commercial_opportunity (score DESC);
CREATE INDEX idx_commercial_opportunity_status ON opportunities.commercial_opportunity (status);

-- Daily detections of an assessment opportunity (assessment/daily_usage_detector.py)
CREATE TABLE opportunities.opportunity_detections (
  id              serial PRIMARY KEY,
  opportunity_id  integer NOT NULL REFERENCES opportunities.commercial_opportunity(id) ON DELETE CASCADE,
  detected_at     timestamp NOT NULL,
  total_tests_day integer NOT NULL,
  created_at      timestamp DEFAULT NOW()
);
CREATE INDEX idx_opportunity_detections_detected_at ON opportunities.opportunity_detections (detected_at DESC);
CREATE INDEX idx_opportunity_detections_opportunity_id ON opportunities.opportunity_detections (opportunity_id);

COMMIT;
