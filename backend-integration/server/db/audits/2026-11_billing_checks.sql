-- ────── Billing: checks after the first load (read-only) ──────────────────────────────────────────────────────────────────────────
-- ── Run after the first full sync (server/scripts/syncBilling.js --full). Nothing is written.
-- ── Run: psql -U michael -d michael_db -f backend-integration/server/db/audits/2026-11_billing_checks.sql
-- ── 1. Volumes. 2. Keys and links invoice ↔ articles. 3. Does amount include taxes? 4. Invoice dates.
-- ── 5. Service dates (end of manual subscriptions?). 6. Categories (renewals?). 7. Products (mapping old vs 2026 catalogue).
-- ── 8. Live subscriptions vs invoices. 9. Credit notes: links, amounts, and net invoiced per year.
-- ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
\pset pager off

\echo '── 1. Volumes'
SELECT 'invoices' AS t, COUNT(*) AS rows, COUNT(*) FILTER (WHERE hubspot_deleted_at IS NOT NULL) AS deleted,
       COUNT(*) FILTER (WHERE nup_center_id IS NULL) AS without_centre, MIN(invoice_date), MAX(invoice_date)
FROM billing.invoices
UNION ALL
SELECT 'invoice_items', COUNT(*), COUNT(*) FILTER (WHERE hubspot_deleted_at IS NOT NULL), NULL, MIN(invoice_date), MAX(invoice_date)
FROM billing.invoice_items;

SELECT sociedad, status, status_raw, COUNT(*) FROM billing.invoices GROUP BY 1, 2, 3 ORDER BY 1, 4 DESC;
SELECT COUNT(*) AS non_numeric_centre FROM billing.invoices WHERE nup_center_id !~ '^[0-9]+$';
SELECT COUNT(*) AS centre_not_in_centers
FROM billing.invoices i LEFT JOIN core.centers c ON c.nup_center_id = i.nup_center_id
WHERE i.nup_center_id ~ '^[0-9]+$' AND c.nup_center_id IS NULL;

\echo '── 2. Keys and links'
SELECT invoice_number, COUNT(*), string_agg(DISTINCT sociedad, ', ') AS sociedades
FROM billing.invoices GROUP BY 1 HAVING COUNT(*) > 1 ORDER BY 2 DESC LIMIT 20;
SELECT COUNT(*) AS duplicated_invoice_numbers FROM (SELECT invoice_number FROM billing.invoices GROUP BY 1 HAVING COUNT(*) > 1) d;
SELECT COUNT(*) AS orphan_articles, COUNT(DISTINCT a.invoice_number) AS their_invoice_numbers
FROM billing.invoice_items a LEFT JOIN billing.invoices i ON i.invoice_number = a.invoice_number
WHERE i.invoice_number IS NULL;
SELECT COUNT(*) AS invoices_without_articles
FROM billing.invoices i WHERE NOT EXISTS (SELECT 1 FROM billing.invoice_items a WHERE a.invoice_number = i.invoice_number);

\echo '── 3. Does amount include taxes? (sum of the articles total, with and without tax_amount, against amount; 1 cent tolerance)'
\echo '      The 16/11 example (2026-00008791) says no: amount 873.60 = item_total, tax_amount 183.46 apart'
WITH t AS (
  SELECT i.zoho_invoice_id, EXTRACT(YEAR FROM i.invoice_date)::int AS year, i.amount,
         SUM(a.total) AS items_total, SUM(a.total + COALESCE(a.tax_amount, 0)) AS items_total_tax
  FROM billing.invoices i JOIN billing.invoice_items a ON a.invoice_number = i.invoice_number
  WHERE a.hubspot_deleted_at IS NULL
  GROUP BY 1, 2, 3
)
SELECT year, COUNT(*) AS invoices,
       COUNT(*) FILTER (WHERE ABS(amount - items_total_tax) <= 0.01) AS amount_eq_items_plus_tax,
       COUNT(*) FILTER (WHERE ABS(amount - items_total) <= 0.01) AS amount_eq_items_no_tax,
       COUNT(*) FILTER (WHERE ABS(amount - items_total_tax) > 0.01 AND ABS(amount - items_total) > 0.01) AS neither
FROM t GROUP BY 1 ORDER BY 1;

\echo '── 4. Invoice date: invoice zoho_invoice_created_date vs article zoho_invoice_invoice_date'
SELECT COUNT(DISTINCT i.zoho_invoice_id) AS invoices,
       COUNT(DISTINCT i.zoho_invoice_id) FILTER (WHERE a.invoice_date = i.invoice_date) AS same_date,
       COUNT(DISTINCT i.zoho_invoice_id) FILTER (WHERE a.invoice_date <> i.invoice_date) AS different_date
FROM billing.invoices i JOIN billing.invoice_items a ON a.invoice_number = i.invoice_number;

\echo '── 5. Service dates per year (recurring articles)'
SELECT EXTRACT(YEAR FROM invoice_date)::int AS year, product_kind, item_type, COUNT(*) AS articles,
       COUNT(service_start) AS with_start, COUNT(service_end) AS with_end,
       COUNT(*) FILTER (WHERE service_end < service_start) AS end_before_start,
       COUNT(*) FILTER (WHERE service_end > invoice_date + INTERVAL '3 years') AS end_over_3y
FROM billing.invoice_items WHERE hubspot_deleted_at IS NULL
GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;
SELECT (service_end - service_start) / 30 AS months, COUNT(*) FROM billing.invoice_items
WHERE service_start IS NOT NULL AND service_end IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 15;

\echo '── 6. Categories per year (renewals: RR-Renovación-…)'
SELECT EXTRACT(YEAR FROM invoice_date)::int AS year, COUNT(*) AS invoices, COUNT(category) AS with_category,
       COUNT(*) FILTER (WHERE category LIKE 'RR-Renovaci%') AS renewals, COUNT(invoice_group) AS with_group
FROM billing.invoices GROUP BY 1 ORDER BY 1;
SELECT category, COUNT(*) FROM billing.invoices GROUP BY 1 ORDER BY 2 DESC;

\echo '── 7. Products (for the old vs 2026 mapping)'
SELECT zoho_item_id, name, first_seen, last_seen, items_count FROM billing.products ORDER BY last_seen DESC, items_count DESC;

\echo '── 8. Live subscriptions vs invoices of the last 13 months (by source)'
SELECT s.source, COUNT(DISTINCT s.nup_center_id) AS live_centres,
       COUNT(DISTINCT s.nup_center_id) FILTER (WHERE EXISTS (
         SELECT 1 FROM billing.invoices i WHERE i.nup_center_id = s.nup_center_id
           AND i.invoice_date >= CURRENT_DATE - INTERVAL '13 months' AND i.hubspot_deleted_at IS NULL)) AS with_recent_invoice
FROM core.subscriptions s
WHERE s.current_state IN ('active', 'past_due', 'trial') AND s.nup_center_id IS NOT NULL
GROUP BY 1;

\echo '── 9. Credit notes'
SELECT COUNT(*) AS credit_notes, COUNT(*) FILTER (WHERE hubspot_deleted_at IS NOT NULL) AS deleted,
       COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM billing.invoices i WHERE i.invoice_number = cn.invoice_number)) AS invoice_not_found,
       COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM billing.credit_note_items x WHERE x.credit_note_number = cn.credit_note_number)) AS without_articles,
       MIN(credit_note_date), MAX(credit_note_date)
FROM billing.credit_notes cn;
SELECT status, type, credit_type, is_cancellation, COUNT(*) FROM billing.credit_notes GROUP BY 1, 2, 3, 4 ORDER BY 5 DESC;
SELECT COUNT(*) AS cn_articles,
       COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM billing.credit_notes cn WHERE cn.credit_note_number = x.credit_note_number)) AS credit_note_not_found,
       COUNT(*) FILTER (WHERE x.invoice_line_item_id IS NOT NULL
                          AND NOT EXISTS (SELECT 1 FROM billing.invoice_items a WHERE a.zoho_line_item_id = x.invoice_line_item_id)) AS invoice_line_not_found,
       COUNT(*) FILTER (WHERE x.zoho_item_id IS DISTINCT FROM (SELECT a.zoho_item_id FROM billing.invoice_items a
                                                                WHERE a.zoho_line_item_id = x.invoice_line_item_id)) AS different_product_than_the_line
FROM billing.credit_note_items x;

-- credit note sub_total / amount_eur = Σ its articles (1 cent)
WITH t AS (
  SELECT cn.credit_note_number, cn.sub_total, cn.amount_eur, SUM(x.total) AS items_total, SUM(x.total_eur) AS items_total_eur
  FROM billing.credit_notes cn JOIN billing.credit_note_items x ON x.credit_note_number = cn.credit_note_number
  GROUP BY 1, 2, 3
)
SELECT COUNT(*) AS credit_notes_with_articles,
       COUNT(*) FILTER (WHERE ABS(sub_total - items_total) <= 0.01) AS sub_total_ok,
       COUNT(*) FILTER (WHERE ABS(amount_eur - items_total_eur) <= 0.01) AS amount_eur_ok
FROM t;

-- invoice credit_note_amount_eur = Σ amount_eur of its credit notes (void and draft left out)
WITH c AS (
  SELECT invoice_number, SUM(amount_eur) AS cn_eur, COUNT(*) AS n
  FROM billing.credit_notes WHERE status NOT IN ('void', 'draft') AND hubspot_deleted_at IS NULL GROUP BY 1
)
SELECT COUNT(*) AS invoices_with_credit_notes, COUNT(*) FILTER (WHERE c.n > 1) AS with_several,
       COUNT(*) FILTER (WHERE ABS(COALESCE(i.credit_note_amount_eur, 0) - c.cn_eur) <= 0.01) AS field_ok,
       COUNT(*) FILTER (WHERE i.credit_note_amount_eur IS NULL) AS field_empty,
       COUNT(*) FILTER (WHERE c.cn_eur >= i.amount_eur - 0.01) AS fully_credited,
       string_agg(DISTINCT i.status_raw, ', ') AS invoice_statuses
FROM c JOIN billing.invoices i ON i.invoice_number = c.invoice_number;

-- Net invoiced per year (EUR, before tax): invoices (not void / cancelled / draft) minus their credit notes
SELECT EXTRACT(YEAR FROM i.invoice_date)::int AS year, COUNT(*) AS invoices,
       ROUND(SUM(i.amount_eur)) AS invoiced_eur,
       ROUND(SUM(COALESCE(c.cn_eur, 0))) AS credited_eur,
       ROUND(SUM(i.amount_eur - COALESCE(c.cn_eur, 0))) AS net_eur
FROM billing.invoices i
LEFT JOIN (SELECT invoice_number, SUM(amount_eur) AS cn_eur FROM billing.credit_notes
           WHERE status NOT IN ('void', 'draft') AND hubspot_deleted_at IS NULL GROUP BY 1) c ON c.invoice_number = i.invoice_number
WHERE i.status NOT IN ('void', 'cancelled', 'draft') AND i.hubspot_deleted_at IS NULL
GROUP BY 1 ORDER BY 1;
