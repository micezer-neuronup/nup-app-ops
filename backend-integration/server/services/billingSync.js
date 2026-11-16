// ────── Billing: Zoho invoices and articles from HubSpot ───────────────────────────────────────────────────────────────────────────────
// ─── Zoho sends every invoice and its articles to HubSpot (custom objects, kept updated with webhooks); this copies them into the
// ─── billing schema (migration 009). Used by the daily cron in server.js and by scripts/syncBilling.js (manual run).
// ─── 1. Invoices, then articles: HubSpot search paged by hs_object_id (keyset, 200 per page: the search stops at 10k per query).
// ───    Incremental: only records with hs_lastmodifieddate ≥ the watermark of the last good run (billing.sync_state) minus OVERLAP.
// ───    Full (--full, Sundays, or no watermark yet): every record, and the rows no longer in HubSpot get hubspot_deleted_at.
// ───    If HubSpot fails the object stops, nothing is written for it and the watermark doesn't move (the next run catches up).
// ─── 2. Mapping: HubSpot properties → columns (text trimmed, empty → null; status normalised and kept raw). Duplicated keys in
// ───    HubSpot (two records with the same Zoho id): the most recently modified wins, and they are counted in the log.
// ─── 3. upsertBillingRows (db/dbBilling.js): only writes what changed. Then products is refreshed from the articles.
// ─── An article belongs to the invoice whose invoice_number equals its zoho_invoice_number; the centre comes from the invoice.
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const { upsertBillingRows, markBillingDeleted, countBillingRows, refreshProducts,
        getSyncState, saveSyncState } = require('../db/dbBilling');
const { log } = require('../utils/logger');

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const PAGE_SIZE = 200;
const OVERLAP_MS = 60 * 60 * 1000;   // incremental re-reads the last hour before the watermark (records modified during a run)
const MIN_SEEN_RATIO = 0.9;          // full sync: no deletions are marked if HubSpot returned less than 90 % of the stored rows

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const text = (v) => (v == null || String(v).trim() === '') ? null : String(v).trim();
const num = (v) => { const t = text(v); if (t == null) return null; const n = Number(t); return Number.isFinite(n) ? n : null; };
const date = (v) => { const t = text(v); return t && /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null; };

// Zoho status (mixed languages) → one value. Unknown ones are 'other' and listed in the log
const STATUS = {
  'paid': 'paid', 'sent': 'sent', 'vencido': 'overdue', 'overdue': 'overdue', 'partially paid': 'partially_paid',
  'cancelada': 'cancelled', 'anulado': 'void', 'void': 'void', 'reembolsada': 'refunded', 'draft': 'draft',
};


// ────── Objects: HubSpot properties → columns ─────────────────────────────────────────────────────────────────────────────────────
// ─── columns: name and pg type of each column (the unnest of the upsert). map: HubSpot record → row.
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const INVOICES = {
  object: 'invoices',
  hubspotId: '2-145603246',
  table: 'billing.invoices',
  key: 'zoho_invoice_id',
  properties: ['id_factura_zoho', 'invoice_id', 'nup_center_id', 'sociedad', 'status', 'zoho_invoice_created_date', 'currency',
               'amount', 'amount_a_eur', 'zoho_exchange_rate', 'credit_note_amount_eur', 'credit_note_date', 'categoria_factura',
               'invoice_group', 'canal_comercial', 'tipo_de_producto', 'zoho_forma_pago', 'preceding_invoice_id', 'deal_id_hubspot',
               'hs_lastmodifieddate'],
  columns: [
    { name: 'zoho_invoice_id', type: 'text' }, { name: 'invoice_number', type: 'text' }, { name: 'hubspot_object_id', type: 'bigint' },
    { name: 'nup_center_id', type: 'text' }, { name: 'sociedad', type: 'text' }, { name: 'status', type: 'text' },
    { name: 'status_raw', type: 'text' }, { name: 'invoice_date', type: 'date' }, { name: 'currency', type: 'text' },
    { name: 'amount', type: 'numeric' }, { name: 'amount_eur', type: 'numeric' }, { name: 'exchange_rate', type: 'numeric' },
    { name: 'credit_note_amount_eur', type: 'numeric' }, { name: 'credit_note_date', type: 'date' }, { name: 'category', type: 'text' },
    { name: 'invoice_group', type: 'text' }, { name: 'sales_channel', type: 'text' }, { name: 'product_type', type: 'text' },
    { name: 'payment_method', type: 'text' }, { name: 'preceding_zoho_invoice_id', type: 'text' }, { name: 'hubspot_deal_id', type: 'text' },
    { name: 'hubspot_updated_at', type: 'timestamptz' },
  ],
  map: (id, p, unknownStatus) => {
    const raw = text(p.status);
    const status = raw ? (STATUS[raw.toLowerCase()] || 'other') : null;
    if (status === 'other') unknownStatus.add(raw);
    return {
      zoho_invoice_id: text(p.id_factura_zoho),
      invoice_number: text(p.invoice_id),
      hubspot_object_id: id,
      nup_center_id: text(p.nup_center_id),
      sociedad: text(p.sociedad),
      status,
      status_raw: raw,
      invoice_date: date(p.zoho_invoice_created_date),
      currency: text(p.currency)?.toUpperCase() || null,
      amount: num(p.amount),
      amount_eur: num(p.amount_a_eur),
      exchange_rate: num(p.zoho_exchange_rate),
      credit_note_amount_eur: num(p.credit_note_amount_eur),
      credit_note_date: date(p.credit_note_date),
      category: text(p.categoria_factura),
      invoice_group: text(p.invoice_group),
      sales_channel: text(p.canal_comercial),
      product_type: text(p.tipo_de_producto),
      payment_method: text(p.zoho_forma_pago),
      preceding_zoho_invoice_id: text(p.preceding_invoice_id),
      hubspot_deal_id: text(p.deal_id_hubspot),
      hubspot_updated_at: text(p.hs_lastmodifieddate),
    };
  },
};

const ARTICLES = {
  object: 'articles',
  hubspotId: '2-202420827',
  table: 'billing.invoice_items',
  key: 'zoho_line_item_id',
  properties: ['zoho_line_item_id', 'zoho_invoice_number', 'zoho_item_id', 'item_name', 'item_description', 'item_personalizado',
               'tipo_producto', 'item_type', 'quantity', 'item_price', 'discount_percentage', 'discount_amount', 'tax_name',
               'tax_percentage', 'tax_amount', 'item_total', 'item_total_eur', 'currency_code', 'zoho_invoice_invoice_date',
               'fecha_inicio', 'fecha_fin', 'hs_lastmodifieddate'],
  columns: [
    { name: 'zoho_line_item_id', type: 'text' }, { name: 'hubspot_object_id', type: 'bigint' }, { name: 'invoice_number', type: 'text' },
    { name: 'zoho_item_id', type: 'text' }, { name: 'item_name', type: 'text' }, { name: 'item_description', type: 'text' },
    { name: 'custom_item', type: 'text' }, { name: 'product_kind', type: 'text' }, { name: 'item_type', type: 'text' },
    { name: 'quantity', type: 'numeric' }, { name: 'price', type: 'numeric' }, { name: 'discount_pct', type: 'numeric' },
    { name: 'discount_amount', type: 'numeric' }, { name: 'tax_name', type: 'text' }, { name: 'tax_pct', type: 'numeric' },
    { name: 'tax_amount', type: 'numeric' }, { name: 'total', type: 'numeric' }, { name: 'total_eur', type: 'numeric' },
    { name: 'currency', type: 'text' }, { name: 'invoice_date', type: 'date' }, { name: 'service_start', type: 'date' },
    { name: 'service_end', type: 'date' }, { name: 'hubspot_updated_at', type: 'timestamptz' },
  ],
  map: (id, p) => ({
    zoho_line_item_id: text(p.zoho_line_item_id),
    hubspot_object_id: id,
    invoice_number: text(p.zoho_invoice_number),
    zoho_item_id: text(p.zoho_item_id),
    item_name: text(p.item_name),
    item_description: text(p.item_description),
    custom_item: text(p.item_personalizado),
    product_kind: text(p.tipo_producto),
    item_type: text(p.item_type),
    quantity: num(p.quantity),
    price: num(p.item_price),
    discount_pct: num(p.discount_percentage),
    discount_amount: num(p.discount_amount),
    tax_name: text(p.tax_name),
    tax_pct: num(p.tax_percentage),
    tax_amount: num(p.tax_amount),
    total: num(p.item_total),
    total_eur: num(p.item_total_eur),
    currency: text(p.currency_code)?.toUpperCase() || null,
    invoice_date: date(p.zoho_invoice_invoice_date),
    service_start: date(p.fecha_inicio),
    service_end: date(p.fecha_fin),
    hubspot_updated_at: text(p.hs_lastmodifieddate),
  }),
};


// ────── HubSpot search (keyset by hs_object_id) ───────────────────────────────────────────────────────────────────────────────────
// ─── Search limit ~5 requests per second: 250 ms between pages. 429 / 5xx are retried up to 4 times (5 s, 10 s, 15 s, 20 s).
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function searchPage(objectId, properties, lastId, sinceMs) {
  const filters = [{ propertyName: 'hs_object_id', operator: 'GT', value: lastId }];
  if (sinceMs != null) filters.push({ propertyName: 'hs_lastmodifieddate', operator: 'GTE', value: String(sinceMs) });

  for (let attempt = 1; ; attempt++) {
    const response = await fetch(`https://api.hubapi.com/crm/v3/objects/${objectId}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${HUBSPOT_TOKEN}` },
      body: JSON.stringify({
        filterGroups: [{ filters }],
        sorts: [{ propertyName: 'hs_object_id', direction: 'ASCENDING' }],
        properties,
        limit: PAGE_SIZE,
      })
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) return data.results || [];
    if ((response.status === 429 || response.status >= 500) && attempt <= 4) {
      await delay(5000 * attempt);
      continue;
    }
    throw new Error(`HubSpot search ${objectId} failed (${response.status}): ${JSON.stringify(data).slice(0, 200)}`);
  }
}

async function fetchAll(spec, sinceMs) {
  const records = [];
  let lastId = '0';
  while (true) {
    const page = await searchPage(spec.hubspotId, spec.properties, lastId, sinceMs);
    records.push(...page);
    if (page.length < PAGE_SIZE) break;
    lastId = page[page.length - 1].id;
    await delay(250);
  }
  return records;
}


// ────── One object: fetch, map, upsert, deletions, watermark ──────────────────────────────────────────────────────────────────────
async function syncObject(spec, { full }) {
  const state = await getSyncState(spec.object);
  const isFull = full || !state?.last_modified_at;
  const sinceMs = isFull ? null : new Date(state.last_modified_at).getTime() - OVERLAP_MS;

  const records = await fetchAll(spec, sinceMs);

  // Map; drop records without key; on duplicated keys keep the most recently modified
  const unknownStatus = new Set();
  const byKey = new Map();
  let withoutKey = 0;
  let duplicates = 0;
  let maxModified = null;
  for (const r of records) {
    const row = spec.map(String(r.id), r.properties || {}, unknownStatus);
    if (row.hubspot_updated_at && (!maxModified || row.hubspot_updated_at > maxModified)) maxModified = row.hubspot_updated_at;
    if (!row[spec.key]) { withoutKey++; continue; }
    const current = byKey.get(row[spec.key]);
    if (current) {
      duplicates++;
      if ((current.hubspot_updated_at || '') >= (row.hubspot_updated_at || '')) continue;
    }
    byKey.set(row[spec.key], row);
  }
  const rows = [...byKey.values()];

  const changed = await upsertBillingRows(spec.table, spec.key, spec.columns, rows);

  // Deletions: only on a full run, and only if HubSpot gave a plausible amount of records
  let deleted = 0;
  let deletionsSkipped = false;
  if (isFull) {
    const stored = await countBillingRows(spec.table);
    if (rows.length >= stored * MIN_SEEN_RATIO) {
      deleted = await markBillingDeleted(spec.table, rows.map(r => r.hubspot_object_id));
    } else {
      deletionsSkipped = true;
    }
  }

  await saveSyncState(spec.object, maxModified, isFull);

  log('INFO', 'BILLING-SYNC', `${spec.object}: ${isFull ? 'full' : `since ${new Date(sinceMs).toISOString()}`} | ` +
    `HubSpot records: ${records.length} | Inserted or changed: ${changed} | Without key: ${withoutKey} | ` +
    `Duplicated keys: ${duplicates}${isFull ? ` | Marked deleted: ${deleted}` : ''}`);
  if (deletionsSkipped) {
    log('WARN', 'BILLING-SYNC', `${spec.object}: HubSpot returned ${rows.length} records, less than ${MIN_SEEN_RATIO * 100} % of the stored ones; no deletions marked`);
  }
  if (unknownStatus.size) {
    log('WARN', 'BILLING-SYNC', `${spec.object}: unknown status values stored as 'other': ${[...unknownStatus].join(', ')}`);
  }

  return { records: records.length, changed, withoutKey, duplicates, deleted };
}


async function runBillingSync({ full = false } = {}) {
  log('INFO', 'BILLING-SYNC', `Starting billing sync (${full ? 'full' : 'incremental'})...`);
  const invoices = await syncObject(INVOICES, { full });
  const articles = await syncObject(ARTICLES, { full });
  const products = await refreshProducts();
  log('INFO', 'BILLING-SYNC', `Done. Products inserted or changed: ${products}`);
  return { invoices, articles, products };
}

module.exports = { runBillingSync };
