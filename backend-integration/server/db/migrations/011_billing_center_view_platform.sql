-- ────── billing.center_billing: paid_until_platform (replaces the view of 010) ──────────────────────────────────────────────────
-- ── Runs AFTER applying db/data/2026-11_billing_products_mapping.sql (it reads billing.products.family; without the mapping every
-- ──   centre would be 'no_platform'). Re-runnable. Nothing else depends on the view, so it is dropped and created again.
-- ── Same rules as 010, plus:
-- ──   paid_until_platform: latest service_end of the valid recurring lines of a NeuronUP plan (family platform or legacy_licence,
-- ──     the old maintenance fees). paid_until (any recurring line: NeuronUP2GO, add-ons, Stimulus...) stays for reference.
-- ──   billing_status now goes by paid_until_platform: no_invoice | no_platform (valid invoices, recurring lines, but none of a
-- ──     NeuronUP plan: only NeuronUP2GO, add-ons...) | no_service_dates | up_to_date | renewal_due (ended in the last 30 days) | expired.
-- ── Lines without zoho_item_id or with a product not mapped yet count only for paid_until.
-- ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
BEGIN;

DROP VIEW IF EXISTS billing.center_billing;

CREATE VIEW billing.center_billing AS
WITH credited AS (
  SELECT invoice_number, SUM(amount_eur) AS credited_eur
  FROM billing.credit_notes
  WHERE status NOT IN ('void', 'draft') AND hubspot_deleted_at IS NULL
  GROUP BY 1
),
valid AS (
  SELECT i.*, COALESCE(c.credited_eur, 0) AS credited_eur
  FROM billing.invoices i
  LEFT JOIN credited c USING (invoice_number)
  WHERE i.hubspot_deleted_at IS NULL
    AND i.status NOT IN ('void', 'cancelled', 'draft')
    AND i.nup_center_id ~ '^[0-9]+$'
    AND NOT (c.credited_eur IS NOT NULL AND c.credited_eur >= i.amount_eur - 0.01)
),
refunded_lines AS (
  SELECT DISTINCT x.invoice_line_item_id
  FROM billing.credit_note_items x
  JOIN billing.credit_notes cn USING (credit_note_number)
  WHERE cn.status NOT IN ('void', 'draft') AND x.hubspot_deleted_at IS NULL AND x.invoice_line_item_id IS NOT NULL
),
lines AS (
  SELECT v.nup_center_id, v.invoice_date AS invoice_date_of_invoice, a.*
  FROM valid v
  JOIN billing.invoice_items a ON a.invoice_number = v.invoice_number
  WHERE a.hubspot_deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM refunded_lines r WHERE r.invoice_line_item_id = a.zoho_line_item_id)
),
invoice_agg AS (
  SELECT nup_center_id,
         COUNT(*) AS invoices_count,
         MIN(invoice_date) AS first_invoice_date,
         COUNT(*) FILTER (WHERE category LIKE 'RR-Renovaci%') AS renewals_count,
         ROUND(SUM(amount_eur - credited_eur) FILTER (WHERE invoice_date >= CURRENT_DATE - INTERVAL '12 months'), 2) AS net_invoiced_eur_12m,
         COUNT(*) FILTER (WHERE status IN ('sent', 'overdue', 'partially_paid')) AS pending_invoices,
         ROUND(SUM(amount_eur) FILTER (WHERE status IN ('sent', 'overdue', 'partially_paid')), 2) AS pending_invoices_eur,
         COUNT(*) FILTER (WHERE status = 'overdue') AS overdue_invoices
  FROM valid
  GROUP BY 1
),
last_invoice AS (
  SELECT DISTINCT ON (nup_center_id) nup_center_id, invoice_number, invoice_date, amount_eur, category, status
  FROM valid
  ORDER BY nup_center_id, invoice_date DESC NULLS LAST, invoice_number DESC
),
last_products AS (
  SELECT l.nup_center_id, string_agg(DISTINCT a.item_name, ' + ') AS products
  FROM last_invoice l
  JOIN lines a ON a.invoice_number = l.invoice_number
  GROUP BY 1
),
service AS (
  SELECT l.nup_center_id,
         MAX(l.service_end) AS paid_until,
         MAX(l.service_end) FILTER (WHERE p.family IN ('platform', 'legacy_licence')) AS paid_until_platform
  FROM lines l
  LEFT JOIN billing.products p USING (zoho_item_id)
  WHERE l.product_kind = 'Recurrente' AND l.service_end <= l.invoice_date_of_invoice + INTERVAL '3 years'
  GROUP BY 1
),
universe AS (
  SELECT nup_center_id FROM core.centers
  UNION
  SELECT nup_center_id FROM valid
)
SELECT u.nup_center_id,
       COALESCE(a.invoices_count, 0) AS invoices_count,
       a.first_invoice_date,
       li.invoice_date AS last_invoice_date,
       li.invoice_number AS last_invoice_number,
       ROUND(li.amount_eur, 2) AS last_invoice_eur,
       li.category AS last_invoice_category,
       li.status AS last_invoice_status,
       lp.products AS last_invoice_products,
       COALESCE(a.renewals_count, 0) AS renewals_count,
       a.net_invoiced_eur_12m,
       COALESCE(a.pending_invoices, 0) AS pending_invoices,
       a.pending_invoices_eur,
       COALESCE(a.overdue_invoices, 0) AS overdue_invoices,
       COALESCE(a.pending_invoices, 0) > 0 AS pending_payment,
       s.paid_until,
       s.paid_until_platform,
       CASE WHEN a.nup_center_id IS NULL THEN 'no_invoice'
            WHEN s.paid_until_platform IS NULL AND s.paid_until IS NOT NULL THEN 'no_platform'
            WHEN s.paid_until_platform IS NULL THEN 'no_service_dates'
            WHEN s.paid_until_platform >= CURRENT_DATE THEN 'up_to_date'
            WHEN s.paid_until_platform >= CURRENT_DATE - 30 THEN 'renewal_due'
            ELSE 'expired' END AS billing_status
FROM universe u
LEFT JOIN invoice_agg a USING (nup_center_id)
LEFT JOIN last_invoice li USING (nup_center_id)
LEFT JOIN last_products lp USING (nup_center_id)
LEFT JOIN service s USING (nup_center_id);

COMMIT;
