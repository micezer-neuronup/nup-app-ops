// ────── HubSpot: reconcile subscriptions with the database ───────────────────────────────────────────────────────────────────────────
// ─── The database is the source of truth: if a HubSpot subscription doesn't match it, HubSpot is corrected (never the other way).
// ─── Until 07/11/2026 the sync skipped every subscription that was no longer live, so cancelled ones stayed "active" in HubSpot.
// ─── The sync now sends them, and this script catches whatever is still out of line, in both directions:
// ───   HubSpot record whose status / isforever / end date / start date differs from the database → mismatch → 'PENDING'.
// ───   Live subscription in the database without a HubSpot record → missing → 'PENDING' (the sync creates it).
// ───   Live subscription stuck in FAILED_NO_COMPANY → 'PENDING' again (the company may exist now).
// ───   HubSpot record that is not in the database → orphan: only reported, nothing is changed.
// ─── It also stores the HubSpot record ID of every matched subscription (hubspot_subscription_id), so the sync doesn't look it up.
// ─── Without --apply nothing is written (dry run): it prints the counts and a sample. The weekly cron in server.js runs it with
// ─── --apply; the 6-hourly HubSpot cron then sends the 'PENDING' ones (or by hand: node server/scripts/syncPendingToHubspot.js).
// ─── The search API returns at most 10k results per query, so it pages by hs_object_id (keyset), 200 per page.
// ─── Run: docker exec server-michael node server/scripts/reconcileHubspotStatuses.js [--apply]
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const path = require('path');
const dotenv = require('dotenv');

const envFile = process.env.NODE_ENV === 'production' ? '../.env.production' : '../.env.development';
dotenv.config({ path: path.resolve(__dirname, envFile) });

const { pool } = require('../db/db');
const { log } = require('../utils/logger');
const { ACCOUNT_SUB_OBJECT_ID, statusMap } = require('../services/hubspotServices');

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const APPLY = process.argv.includes('--apply');
const LIVE_STATES = ['active', 'trial', 'trialing', 'past_due'];
const PAGE_SIZE = 200;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Same format the sync sends (hubspotServices formatHsDate): YYYY-MM-DD, '' if empty
const day = (value) => {
  if (!value) return '';
  const d = new Date(value);
  return isNaN(d.getTime()) ? String(value).slice(0, 10) : d.toISOString().split('T')[0];
};


// ────── HubSpot: every subscription record ──────────────────────────────────────────────────────────────────────────────────────
// ─── All the records of the subscription object (any status), with the properties the sync writes and we compare.
// ─── Search API limit: ~5 requests per second, so 250 ms between pages.
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function fetchHubspotRecords() {
  const records = [];
  let lastId = '0';

  while (true) {
    const response = await fetch(`https://api.hubapi.com/crm/v3/objects/${ACCOUNT_SUB_OBJECT_ID}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${HUBSPOT_TOKEN}` },
      body: JSON.stringify({
        filterGroups: [{ filters: [{ propertyName: 'hs_object_id', operator: 'GT', value: lastId }] }],
        sorts: [{ propertyName: 'hs_object_id', direction: 'ASCENDING' }],
        properties: ['subscription_id_unique', 'status', 'isforever', 'subscription_finish_date', 'start_date'],
        limit: PAGE_SIZE,
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(`HubSpot search failed (${response.status}): ${JSON.stringify(data).slice(0, 300)}`);

    for (const r of data.results) {
      records.push({ hubspotId: r.id, ...r.properties });
    }
    log('INFO', 'RECONCILE', `HubSpot: ${records.length} records so far`);

    if (data.results.length < PAGE_SIZE) break;
    lastId = data.results[data.results.length - 1].id;
    await delay(250);
  }

  return records;
}


// ────── Differences of one record ───────────────────────────────────────────────────────────────────────────────────────────────
// ─── The fields the sync writes and that matter for the state of the subscription. Empty list = aligned.
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function differences(rec, row) {
  const diffs = [];
  const expectedStatus = statusMap[String(row.current_state).toLowerCase()] || null;
  if ((rec.status || null) !== expectedStatus) diffs.push(`status ${rec.status} → ${expectedStatus}`);
  const expectedForever = row.is_forever ? 'true' : 'false';
  if (String(rec.isforever) !== expectedForever) diffs.push(`isforever ${rec.isforever} → ${expectedForever}`);
  if (day(rec.subscription_finish_date) !== day(row.cancelation_date)) {
    diffs.push(`finish ${day(rec.subscription_finish_date) || '-'} → ${day(row.cancelation_date) || '-'}`);
  }
  if (day(rec.start_date) !== day(row.start_date)) diffs.push(`start ${day(rec.start_date) || '-'} → ${day(row.start_date) || '-'}`);
  return diffs;
}


// ────── Main ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function main() {
  log('INFO', 'RECONCILE', `Reconciling HubSpot subscriptions with the database${APPLY ? ' [APPLY]' : ' [DRY RUN]'}...`);

  try {
    const records = await fetchHubspotRecords();
    const inHubspot = new Map(records.filter(r => r.subscription_id_unique).map(r => [r.subscription_id_unique, r]));

    const { rows } = await pool.query(
      `SELECT subscription_id, current_state, is_forever, cancelation_date, start_date, source,
              nup_center_id, hubspot_subscription_id, hubspot_sync_status
       FROM subscriptions
       WHERE subscription_id = ANY($1) OR current_state = ANY($2)`,
      [[...inHubspot.keys()], LIVE_STATES]
    );
    const db = new Map(rows.map(r => [r.subscription_id, r]));

    const mismatches = [];   // { id, hubspotId, diffs }
    const missing = [];      // live in the database, no HubSpot record
    const retryNoCompany = [];
    const orphans = records.filter(r => !r.subscription_id_unique || !db.has(r.subscription_id_unique));
    const idsToStore = [];   // matched records whose hubspot_subscription_id is not stored yet

    for (const [id, rec] of inHubspot) {
      const row = db.get(id);
      if (!row) continue;
      if (row.hubspot_subscription_id !== rec.hubspotId) idsToStore.push([id, rec.hubspotId]);
      const diffs = differences(rec, row);
      if (diffs.length > 0) mismatches.push({ id, hubspotId: rec.hubspotId, source: row.source, diffs });
    }
    for (const row of rows) {
      if (!LIVE_STATES.includes(row.current_state) || inHubspot.has(row.subscription_id)) continue;
      if (row.hubspot_sync_status === 'FAILED_NO_COMPANY') retryNoCompany.push(row.subscription_id);
      else missing.push(row.subscription_id);
    }

    // Counts by kind of difference (first difference of each record)
    const byDiff = {};
    for (const m of mismatches) {
      const key = `${m.diffs.map(d => d.split(' ')[0]).join('+')} (${m.source === 'backend' ? 'manual' : m.source})`;
      byDiff[key] = (byDiff[key] || 0) + 1;
    }

    log('INFO', 'RECONCILE', `HubSpot records: ${records.length} | Mismatch: ${mismatches.length} | ` +
      `Live without HubSpot record: ${missing.length} | FAILED_NO_COMPANY to retry: ${retryNoCompany.length} | ` +
      `Not in the database: ${orphans.length} | Record IDs to store: ${idsToStore.length}`);
    for (const [kind, count] of Object.entries(byDiff).sort((a, b) => b[1] - a[1])) {
      log('INFO', 'RECONCILE', `  ${kind}: ${count}`);
    }
    for (const m of mismatches.slice(0, 10)) log('INFO', 'RECONCILE', `  e.g. ${m.id}: ${m.diffs.join(', ')}`);
    for (const id of missing.slice(0, 10)) log('INFO', 'RECONCILE', `  live without HubSpot record: ${id}`);
    for (const o of orphans.slice(0, 10)) {
      log('INFO', 'RECONCILE', `  not in the database: ${o.subscription_id_unique || '(no subscription_id_unique)'} (record ${o.hubspotId}, ${o.status})`);
    }

    if (!APPLY) {
      log('INFO', 'RECONCILE', 'Dry run: nothing written. Run with --apply to mark them for the sync.');
      return;
    }

    for (const [id, hubspotId] of idsToStore) {
      await pool.query(`UPDATE subscriptions SET hubspot_subscription_id = $2 WHERE subscription_id = $1`, [id, String(hubspotId)]);
    }
    const toSync = [...mismatches.map(m => m.id), ...missing, ...retryNoCompany];
    const result = await pool.query(
      `UPDATE subscriptions SET hubspot_sync_status = 'PENDING' WHERE subscription_id = ANY($1)`,
      [toSync]
    );
    log('INFO', 'RECONCILE', `Stored ${idsToStore.length} record IDs. Marked ${result.rowCount} subscriptions as 'PENDING' ` +
      `(sent by the HubSpot cron, or now with: node server/scripts/syncPendingToHubspot.js).`);

  } catch (error) {
    log('ERROR', 'RECONCILE', `Fatal error: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
    process.exit(process.exitCode || 0);
  }
}

main();
