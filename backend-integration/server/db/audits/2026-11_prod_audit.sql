-- ────── Prod data audit (read-only) ──────────────────────────────────────────────────────────────────────────────────────────────
-- ── Phase 0 of the database cleanup (centers, subscriptions, schemas). Nothing is written: everything runs inside a
-- ──   READ ONLY transaction that is rolled back at the end.
-- ── Run:   docker exec -i postgres-michael psql -U <db_user> -d michael_db -P pager=off < this_file > audit_output.txt
-- ── Schema (separately):   docker exec postgres-michael pg_dump -U <db_user> -d michael_db --schema-only > prod_schema.sql
-- ── Each block mirrors a check done on dev (06/11/2026); dev values in the comments to compare.
-- ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
BEGIN TRANSACTION READ ONLY;

\echo '== 1. Tables: estimated rows and size (dev: no events table, only events_v2 empty) =='
SELECT n.nspname AS schema, c.relname AS table_name, c.reltuples::bigint AS est_rows,
       pg_size_pretty(pg_total_relation_size(c.oid)) AS size
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p') AND n.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY pg_total_relation_size(c.oid) DESC;

\echo '== 2. Indexes (dev: none on nup_center_id / subscription_items.subscription_id / commercial_opportunity) =='
SELECT tablename, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename;

\echo '== 3. subscriptions: % filled per column, by source (dev: see plan) =='
\x on
SELECT CASE WHEN source = 'backend' THEN 'manual' ELSE COALESCE(source, 'NULL') END AS src,
  COUNT(*) AS n,
  ROUND(100.0 * COUNT(hubspot_subscription_id) / COUNT(*)) AS hubspot_subscription_id,
  ROUND(100.0 * COUNT(nup_center_id) / COUNT(*)) AS nup_center_id,
  ROUND(100.0 * COUNT(segment) / COUNT(*)) AS segment,
  ROUND(100.0 * COUNT(manages_own_payment) / COUNT(*)) AS manages_own_payment,
  ROUND(100.0 * COUNT(center_name) / COUNT(*)) AS center_name,
  ROUND(100.0 * COUNT(start_date) / COUNT(*)) AS start_date,
  ROUND(100.0 * COUNT(precancelled_date) / COUNT(*)) AS precancelled_date,
  ROUND(100.0 * COUNT(cancelation_date) / COUNT(*)) AS cancelation_date,
  ROUND(100.0 * COUNT(revoked_access_date) / COUNT(*)) AS revoked_access_date,
  ROUND(100.0 * COUNT(current_state) / COUNT(*)) AS current_state,
  ROUND(100.0 * COUNT(currency) / COUNT(*)) AS currency,
  ROUND(100.0 * COUNT(creation_source) / COUNT(*)) AS creation_source,
  ROUND(100.0 * COUNT(payment_method_type) / COUNT(*)) AS payment_method_type,
  ROUND(100.0 * COUNT(market) / COUNT(*)) AS market,
  ROUND(100.0 * COUNT(is_forever) / COUNT(*)) AS is_forever,
  ROUND(100.0 * COUNT(pending_payment) / COUNT(*)) AS pending_payment,
  ROUND(100.0 * COUNT(last_invoice_status) / COUNT(*)) AS last_invoice_status,
  ROUND(100.0 * COUNT(last_invoice_amount) / COUNT(*)) AS last_invoice_amount,
  ROUND(100.0 * COUNT(last_invoice_date) / COUNT(*)) AS last_invoice_date,
  ROUND(100.0 * COUNT(hubspot_sync_status) / COUNT(*)) AS hubspot_sync_status,
  ROUND(100.0 * COUNT(backend_subscription_id) / COUNT(*)) AS backend_subscription_id,
  ROUND(100.0 * COUNT(access) / COUNT(*)) AS access,
  MAX(updated_at)::date AS last_updated
FROM subscriptions GROUP BY 1 ORDER BY 2 DESC;

\echo '== 3b. Same, only live subscriptions (active / past_due / trial) =='
SELECT CASE WHEN source = 'backend' THEN 'manual' ELSE COALESCE(source, 'NULL') END AS src,
  COUNT(*) AS n,
  ROUND(100.0 * COUNT(nup_center_id) / COUNT(*)) AS nup_center_id,
  ROUND(100.0 * COUNT(center_name) / COUNT(*)) AS center_name,
  ROUND(100.0 * COUNT(start_date) / COUNT(*)) AS start_date,
  ROUND(100.0 * COUNT(cancelation_date) / COUNT(*)) AS cancelation_date,
  ROUND(100.0 * COUNT(revoked_access_date) / COUNT(*)) AS revoked_access_date,
  ROUND(100.0 * COUNT(currency) / COUNT(*)) AS currency,
  ROUND(100.0 * COUNT(payment_method_type) / COUNT(*)) AS payment_method_type,
  ROUND(100.0 * COUNT(last_invoice_date) / COUNT(*)) AS last_invoice_date,
  ROUND(100.0 * COUNT(access) / COUNT(*)) AS access
FROM subscriptions WHERE current_state IN ('active', 'past_due', 'trial') GROUP BY 1 ORDER BY 2 DESC;

\echo '== 4. subscription_items: % filled per column, by source of the subscription =='
SELECT CASE WHEN s.source = 'backend' THEN 'manual' ELSE COALESCE(s.source, 'NULL') END AS src,
  COUNT(*) AS n,
  ROUND(100.0 * COUNT(i.hubspot_item_id) / COUNT(*)) AS hubspot_item_id,
  ROUND(100.0 * COUNT(i.nup_center_id) / COUNT(*)) AS nup_center_id,
  ROUND(100.0 * COUNT(i.product_id) / COUNT(*)) AS product_id,
  ROUND(100.0 * COUNT(i.product_name) / COUNT(*)) AS product_name,
  ROUND(100.0 * COUNT(i.billing_interval) / COUNT(*)) AS billing_interval,
  ROUND(100.0 * COUNT(i.payment_frequency) / COUNT(*)) AS payment_frequency,
  ROUND(100.0 * COUNT(i.unit_price) / COUNT(*)) AS unit_price,
  ROUND(100.0 * COUNT(i.features) / COUNT(*)) AS features,
  ROUND(100.0 * COUNT(i.quantity) / COUNT(*)) AS quantity,
  ROUND(100.0 * COUNT(i.number_of_renovations) / COUNT(*)) AS number_of_renovations,
  ROUND(100.0 * COUNT(i.start_date) / COUNT(*)) AS start_date,
  ROUND(100.0 * COUNT(i.current_period_start) / COUNT(*)) AS current_period_start,
  ROUND(100.0 * COUNT(i.current_period_end) / COUNT(*)) AS current_period_end,
  ROUND(100.0 * COUNT(i.is_forever) / COUNT(*)) AS is_forever,
  ROUND(100.0 * COUNT(i.status) / COUNT(*)) AS status,
  ROUND(100.0 * COUNT(i.precancelled_date) / COUNT(*)) AS precancelled_date,
  ROUND(100.0 * COUNT(i.backend_item_id) / COUNT(*)) AS backend_item_id
FROM subscription_items i LEFT JOIN subscriptions s USING (subscription_id) GROUP BY 1 ORDER BY 2 DESC;
\x off

\echo '== 5. State x is_forever x has end date (dev: 23k stripe canceled with is_forever = true) =='
SELECT source, current_state, is_forever, (cancelation_date IS NOT NULL) AS has_end, COUNT(*),
       MAX(updated_at)::date AS last_updated
FROM subscriptions GROUP BY 1, 2, 3, 4 ORDER BY 1, 5 DESC;

\echo '== 6. Inconsistencies (dev: 23 manual + 13 stripe active past their end; 25181 forever with end) =='
SELECT source,
  COUNT(*) FILTER (WHERE current_state = 'active' AND cancelation_date < NOW())  AS active_but_ended,
  COUNT(*) FILTER (WHERE current_state = 'canceled' AND cancelation_date > NOW()) AS canceled_but_future_end,
  COUNT(*) FILTER (WHERE is_forever AND cancelation_date IS NOT NULL)            AS forever_with_end,
  COUNT(*) FILTER (WHERE is_forever AND current_state LIKE '%canceled%')         AS forever_but_canceled
FROM subscriptions GROUP BY 1;

\echo '== 7. Live Stripe items without period (dev: 0% current_period_* on all stripe items) =='
SELECT s.current_state, COUNT(*) AS items,
       COUNT(*) FILTER (WHERE i.current_period_end IS NULL)   AS no_period_end,
       COUNT(*) FILTER (WHERE i.current_period_start IS NULL) AS no_period_start
FROM subscription_items i JOIN subscriptions s USING (subscription_id)
WHERE s.source = 'stripe' AND s.current_state IN ('active', 'past_due', 'trial')
GROUP BY 1;

\echo '== 8. Subscriptions without nup_center_id, by state (dev: 3687, all canceled/expired) =='
SELECT source, current_state, COUNT(*) FROM subscriptions WHERE nup_center_id IS NULL GROUP BY 1, 2 ORDER BY 3 DESC;

\echo '== 9. Items whose centre differs from their subscription (dev: 242) and subscriptions without items (dev: 6) =='
SELECT (SELECT COUNT(*) FROM subscription_items i JOIN subscriptions s USING (subscription_id)
        WHERE i.nup_center_id IS DISTINCT FROM s.nup_center_id) AS items_center_mismatch,
       (SELECT COUNT(*) FROM subscriptions s
        WHERE NOT EXISTS (SELECT 1 FROM subscription_items i WHERE i.subscription_id = s.subscription_id)) AS subs_without_items;

\echo '== 10. Live subscriptions per centre (dev: 2475 with 1, 67 with 2, 5 with 3+) =='
SELECT n_live, COUNT(*) AS centers FROM (
  SELECT nup_center_id, COUNT(*) FILTER (WHERE current_state IN ('active', 'past_due', 'trial')) AS n_live
  FROM subscriptions WHERE nup_center_id IS NOT NULL GROUP BY 1
) x GROUP BY 1 ORDER BY 1;

\echo '== 11. HubSpot sync status by state (dev: 35610 FAILED_NO_COMPANY, dev uses the HubSpot sandbox) =='
SELECT current_state, hubspot_sync_status, COUNT(*) FROM subscriptions GROUP BY 1, 2 ORDER BY 1, 3 DESC;

\echo '== 12. Value distributions =='
SELECT 'creation_source' AS col, creation_source AS value, COUNT(*) FROM subscriptions GROUP BY 2
UNION ALL SELECT 'access', access, COUNT(*) FROM subscriptions GROUP BY 2
UNION ALL SELECT 'payment_method_type', payment_method_type, COUNT(*) FROM subscriptions GROUP BY 2
UNION ALL SELECT 'currency', currency, COUNT(*) FROM subscriptions GROUP BY 2
UNION ALL SELECT 'segment', segment, COUNT(*) FROM subscriptions GROUP BY 2
UNION ALL SELECT 'market', market, COUNT(*) FROM subscriptions GROUP BY 2
UNION ALL SELECT 'last_invoice_status', last_invoice_status, COUNT(*) FROM subscriptions GROUP BY 2
ORDER BY 1, 3 DESC;

\echo '== 13. Centres with usage but no subscription row at all (last 60 days) =='
SELECT COUNT(DISTINCT d.center_id) AS centers_with_usage,
       COUNT(DISTINCT d.center_id) FILTER (WHERE NOT EXISTS (
         SELECT 1 FROM subscriptions s WHERE s.nup_center_id = d.center_id::text)) AS without_any_subscription
FROM daily_stats d WHERE d.stat_date >= CURRENT_DATE - 60;

\echo '== 14. subscription_events: volume and last event (nothing reads it) =='
SELECT event_type, COUNT(*), MAX(created_at)::date AS last FROM subscription_events GROUP BY 1 ORDER BY 2 DESC;

ROLLBACK;
