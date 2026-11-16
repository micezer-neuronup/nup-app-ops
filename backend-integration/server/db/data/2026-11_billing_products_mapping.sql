-- ────── billing.products: family / catalogue / billing_period (rules) ────────────────────────────────────────────────────────────
-- ── Fills the hand-kept columns of billing.products with rules on the product name (the sync never touches them). Re-runnable:
-- ──   the rules are the source; to change one product, change or add a rule here and run it again (hand edits are overwritten).
-- ── Preview by default (ROLLBACK, nothing written); with -v apply=1 it commits:
-- ──   psql -U michael -d michael_db -f backend-integration/server/db/data/2026-11_billing_products_mapping.sql            (preview)
-- ──   psql -U michael -d michael_db -v apply=1 -f backend-integration/server/db/data/2026-11_billing_products_mapping.sql (apply)
-- ── The first digits of zoho_item_id are the Zoho organisation (8747… NeuronUP S.L., 9608… Academy, 5154… probably NeuronUP MX):
-- ──   the same product has a different id in each one, so the rules go by name and catch every organisation.
-- ── family: platform (NeuronUP plans, any module / tier) | neuronup2go | addon (extra professionals, Pro features, student and
-- ──   teacher access) | onboarding | legacy_licence (*Cuota Mantenimiento, *Licencia…) | academy | event | stimulus | hardware | services.
-- ── catalogue (only platform, neuronup2go, addon, onboarding): '2026' if first seen from 01/11/2025 (new catalogue), else 'legacy'.
-- ── billing_period: one_off for academy / event / hardware / services / onboarding; else from the name (Anual / Mensual); else from
-- ──   the data: most lines 'Puntual' → one_off, usual service length 11-13 months → annual, 1 month → monthly.
-- ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
\pset pager off
BEGIN;

WITH stats AS (
  SELECT zoho_item_id,
         mode() WITHIN GROUP (ORDER BY ROUND((service_end - service_start) / 30.0)) AS months,
         AVG(CASE WHEN product_kind = 'Puntual' THEN 1.0 ELSE 0 END) AS one_off_share
  FROM billing.invoice_items
  WHERE zoho_item_id IS NOT NULL AND hubspot_deleted_at IS NULL
  GROUP BY 1
),
families AS (
  SELECT p.zoho_item_id, p.name, p.first_seen,
         CASE
           WHEN p.zoho_item_id LIKE '960878%' OR p.name ~* '^(Curso|Especialista|Experto|Máster|CU EXPERTO|Prácticas)' THEN 'academy'
           WHEN p.name ~* 'Hub|Evento|Ponencia|Conferencia'               THEN 'event'
           WHEN p.name ~* 'Stimulus'                                      THEN 'stimulus'
           WHEN p.name ~* 'Tablet|Pantalla'                               THEN 'hardware'
           WHEN p.name ~* 'Auditor'                                       THEN 'services'
           WHEN p.name ~* 'Onboarding'                                    THEN 'onboarding'
           WHEN p.name ~* 'NeuronUP2GO|NUP2GO'                            THEN 'neuronup2go'
           WHEN p.name ~* 'extra|FUNCIONALIDADES|Acceso Estudiante|Acceso Docente|PROFESSIONELS' THEN 'addon'
           WHEN p.name ~* '^\*(Cuota|Licencia)|Maintenance Fee'           THEN 'legacy_licence'
           WHEN p.name ~* 'NeuronUP|Adultos|Adults|Kids|digital|papel|Neuorrehab' THEN 'platform'
         END AS family
  FROM billing.products p
),
mapping AS (
  SELECT f.zoho_item_id, f.family,
         CASE WHEN f.family IN ('platform', 'neuronup2go', 'addon', 'onboarding')
              THEN CASE WHEN f.first_seen >= DATE '2025-11-01' THEN '2026' ELSE 'legacy' END
         END AS catalogue,
         CASE WHEN f.family IN ('academy', 'event', 'hardware', 'services', 'onboarding') THEN 'one_off'
              WHEN f.name ~* 'anual|annual'          THEN 'annual'
              WHEN f.name ~* 'mensual|monthly'       THEN 'monthly'
              WHEN s.one_off_share > 0.5             THEN 'one_off'
              WHEN s.months BETWEEN 11 AND 13        THEN 'annual'
              WHEN s.months = 1                      THEN 'monthly'
         END AS billing_period
  FROM families f
  LEFT JOIN stats s USING (zoho_item_id)
)
UPDATE billing.products p
SET family = m.family, catalogue = m.catalogue, billing_period = m.billing_period, updated_at = NOW()
FROM mapping m
WHERE p.zoho_item_id = m.zoho_item_id
  AND (p.family, p.catalogue, p.billing_period) IS DISTINCT FROM (m.family, m.catalogue, m.billing_period);

\echo '── Summary'
SELECT family, catalogue, billing_period, COUNT(*) AS products, SUM(items_count) AS lines
FROM billing.products GROUP BY 1, 2, 3 ORDER BY 1 NULLS FIRST, 2, 3;

\echo '── Every product (family NULL first: no rule matched)'
SELECT family, catalogue, billing_period, zoho_item_id, name, first_seen, last_seen, items_count
FROM billing.products ORDER BY family NULLS FIRST, catalogue, billing_period, items_count DESC;

\if :{?apply}
COMMIT;
\echo 'Applied.'
\else
ROLLBACK;
\echo 'Preview only, nothing written. To apply: add -v apply=1'
\endif
