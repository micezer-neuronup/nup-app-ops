const { pool } = require('./db');


// ────── Query: Upsert billing rows ───────────────────────────────────────────────────────────────────────────────────────────────────────
// ─── Generic upsert for billing.invoices and billing.invoice_items (services/billingSync.js gives the columns and their pg types).
// ─── In batches of 1000 with unnest, one transaction. Only writes when something changed (ON CONFLICT ... WHERE ... IS DISTINCT FROM),
// ─── so updated_at means "last change"; hubspot_updated_at is not compared (Zoho / HubSpot touch records without changing them).
// ─── A row that comes back after being marked deleted gets hubspot_deleted_at = NULL. Returns how many rows were inserted or changed.
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function upsertBillingRows(table, key, columns, rows) {
  const names = columns.map(c => c.name);
  const compared = names.filter(n => n !== key && n !== 'hubspot_updated_at');
  const sql = `
    INSERT INTO ${table} AS t (${names.join(', ')})
    SELECT * FROM unnest(${columns.map((c, i) => `$${i + 1}::${c.type}[]`).join(', ')})
    ON CONFLICT (${key}) DO UPDATE SET
      ${names.filter(n => n !== key).map(n => `${n} = EXCLUDED.${n}`).join(',\n      ')},
      hubspot_deleted_at = NULL,
      updated_at = NOW()
    WHERE (${compared.map(n => `t.${n}`).join(', ')}, t.hubspot_deleted_at)
      IS DISTINCT FROM
          (${compared.map(n => `EXCLUDED.${n}`).join(', ')}, NULL::timestamptz)`;

  const client = await pool.connect();
  let changed = 0;
  try {
    await client.query('BEGIN');
    for (let i = 0; i < rows.length; i += 1000) {
      const batch = rows.slice(i, i + 1000);
      const result = await client.query(sql, names.map(n => batch.map(r => r[n] ?? null)));
      changed += result.rowCount;
    }
    await client.query('COMMIT');
    return changed;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}


// ────── Query: Mark records deleted in HubSpot ─────────────────────────────────────────────────────────────────────────────────────────────
// ─── Only after a full sync that finished well: every row whose HubSpot record was not seen gets hubspot_deleted_at. Returns the count.
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function markBillingDeleted(table, seenHubspotIds) {
  const result = await pool.query(
    `UPDATE ${table} SET hubspot_deleted_at = NOW(), updated_at = NOW()
     WHERE hubspot_deleted_at IS NULL AND NOT (hubspot_object_id = ANY($1::bigint[]))`,
    [seenHubspotIds]
  );
  return result.rowCount;
}

async function countBillingRows(table) {
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE hubspot_deleted_at IS NULL`);
  return rows[0].n;
}


// ────── Query: Refresh products ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// ─── One row per zoho_item_id seen in the articles (deleted ones left out). Only name / first_seen / last_seen / items_count:
// ─── family, catalogue, billing_period and notes are filled by hand and never touched here. name = the latest one used (trimmed).
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function refreshProducts() {
  const result = await pool.query(`
    INSERT INTO billing.products AS p (zoho_item_id, name, first_seen, last_seen, items_count)
    SELECT zoho_item_id,
           (array_agg(item_name ORDER BY invoice_date DESC NULLS LAST))[1],
           MIN(invoice_date), MAX(invoice_date), COUNT(*)::int
    FROM billing.invoice_items
    WHERE zoho_item_id IS NOT NULL AND hubspot_deleted_at IS NULL
    GROUP BY zoho_item_id
    ON CONFLICT (zoho_item_id) DO UPDATE SET
      name = EXCLUDED.name, first_seen = EXCLUDED.first_seen, last_seen = EXCLUDED.last_seen,
      items_count = EXCLUDED.items_count, updated_at = NOW()
    WHERE (p.name, p.first_seen, p.last_seen, p.items_count)
      IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.first_seen, EXCLUDED.last_seen, EXCLUDED.items_count)`);
  return result.rowCount;
}


// ────── Query: Sync watermark ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function getSyncState(object) {
  const { rows } = await pool.query(`SELECT * FROM billing.sync_state WHERE object = $1`, [object]);
  return rows[0] || null;
}

async function saveSyncState(object, lastModifiedAt, full) {
  await pool.query(
    `INSERT INTO billing.sync_state (object, last_modified_at, last_run_at, last_full_run_at)
     VALUES ($1, $2, NOW(), CASE WHEN $3 THEN NOW() END)
     ON CONFLICT (object) DO UPDATE SET
       last_modified_at = GREATEST(billing.sync_state.last_modified_at, EXCLUDED.last_modified_at),
       last_run_at = NOW(),
       last_full_run_at = COALESCE(EXCLUDED.last_full_run_at, billing.sync_state.last_full_run_at)`,
    [object, lastModifiedAt, full]
  );
}

module.exports = { upsertBillingRows, markBillingDeleted, countBillingRows, refreshProducts, getSyncState, saveSyncState };
