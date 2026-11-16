-- ────── billing.center_billing: billing state of each centre (view) ─────────────────────────────────────────────────────────────
-- ── Runs at any moment (only creates a view; nothing reads it yet). Re-runnable (CREATE OR REPLACE).
-- ── One row per centre: every centre of core.centers plus the ones that only appear in invoices (numeric nup_center_id).
-- ── Valid invoices: not deleted in HubSpot, not void / cancelled / draft, and not fully cancelled by credit notes (cancel and
-- ──   re-issue is common since mid-2025: the original is credited in full and a new invoice is issued).
-- ── Valid lines: lines of valid invoices that no credit note line refunds (credit_note_items.invoice_line_item_id).
-- ── Columns:
-- ──   invoices_count, first_invoice_date, last_invoice_*: from valid invoices. last_invoice_products: names of its valid lines.
-- ──   renewals_count: valid invoices with category RR-Renovación-*.
-- ──   net_invoiced_eur_12m: valid invoices of the last 12 months minus their partial credit notes (EUR, before tax).
-- ──   pending_invoices / pending_invoices_eur / overdue_invoices: valid invoices sent, overdue or partially paid (the amount is the
-- ──     invoice amount, not the remaining balance: HubSpot doesn't give the balance). pending_payment = pending_invoices > 0.
-- ──   paid_until: latest service_end of the valid recurring lines (ends more than 3 years after the invoice are data errors, left out).
-- ──   billing_status: no_invoice | up_to_date (paid_until ≥ today) | renewal_due (ended in the last 30 days) |
-- ──     expired (ended earlier) | no_service_dates (valid invoices but no recurring line with dates).
-- ── Invoices belong to a centre, not to a subscription: this view doesn't say which subscription an invoice pays.
-- ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
BEGIN;

CREATE OR REPLACE VIEW billing.center_billing AS
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
  SELECT nup_center_id, MAX(service_end) AS paid_until
  FROM lines
  WHERE product_kind = 'Recurrente' AND service_end <= invoice_date_of_invoice + INTERVAL '3 years'
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
       CASE WHEN a.nup_center_id IS NULL THEN 'no_invoice'
            WHEN s.paid_until IS NULL THEN 'no_service_dates'
            WHEN s.paid_until >= CURRENT_DATE THEN 'up_to_date'
            WHEN s.paid_until >= CURRENT_DATE - 30 THEN 'renewal_due'
            ELSE 'expired' END AS billing_status
FROM universe u
LEFT JOIN invoice_agg a USING (nup_center_id)
LEFT JOIN last_invoice li USING (nup_center_id)
LEFT JOIN last_products lp USING (nup_center_id)
LEFT JOIN service s USING (nup_center_id);

COMMIT;
