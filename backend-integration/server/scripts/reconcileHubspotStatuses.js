// ────── HubSpot: reconcile subscription statuses ────────────────────────────────────────────────────────────────────────────────────
// ─── One-off (can be repeated). Until 07/11/2026 the sync skipped every subscription that was no longer live, so a subscription
// ─── that was active in HubSpot and was cancelled later stayed "active" there. The sync now sends cancellations, but only for
// ─── subscriptions that change from now on: this script finds the old ones.
// ─── How: lists from HubSpot the subscription records with a live status (active / trial / past_due), and compares each one
// ─── with our database (subscription_id_unique = subscriptions.subscription_id):
// ───   our status differs (e.g. canceled in the database, active in HubSpot) → mismatch: marked 'PENDING' for the sync, and
// ───     its HubSpot record ID saved, so the sync doesn't have to look it up.
// ───   not in our database → orphan: only reported, nothing is changed.
// ─── Without --apply nothing is written (dry run): it prints the counts and a sample.
// ─── The search API returns at most 10k results per query, so it pages by hs_object_id (keyset), 200 per page.
// ─── Run: docker exec server-michael node server/scripts/reconcileHubspotStatuses.js [--apply]
// ───   then, with --apply: node server/scripts/syncPendingToHubspot.js
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
const LIVE_HUBSPOT_STATUSES = ['active', 'trial', 'past_due'];
const PAGE_SIZE = 200;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));


// ────── HubSpot: live subscription records ──────────────────────────────────────────────────────────────────────────────────────
// ─── Every record of the subscription object whose status is live, with its unique id and status.
// ─── Search API limit: ~5 requests per second, so 250 ms between pages.
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function fetchLiveHubspotRecords() {
  const records = [];
  let lastId = '0';

  while (true) {
    const response = await fetch(`https://api.hubapi.com/crm/v3/objects/${ACCOUNT_SUB_OBJECT_ID}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${HUBSPOT_TOKEN}` },
      body: JSON.stringify({
        filterGroups: [{
          filters: [
            { propertyName: 'status', operator: 'IN', values: LIVE_HUBSPOT_STATUSES },
            { propertyName: 'hs_object_id', operator: 'GT', value: lastId },
          ]
        }],
        sorts: [{ propertyName: 'hs_object_id', direction: 'ASCENDING' }],
        properties: ['subscription_id_unique', 'status'],
        limit: PAGE_SIZE,
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(`HubSpot search failed (${response.status}): ${JSON.stringify(data).slice(0, 300)}`);

    for (const r of data.results) {
      records.push({ hubspotId: r.id, subscriptionId: r.properties.subscription_id_unique, status: r.properties.status });
    }
    log('INFO', 'RECONCILE', `HubSpot: ${records.length} live records so far`);

    if (data.results.length < PAGE_SIZE) break;
    lastId = data.results[data.results.length - 1].id;
    await delay(250);
  }

  return records;
}


// ────── Main ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function main() {
  log('INFO', 'RECONCILE', `Reconciling HubSpot subscription statuses${APPLY ? ' [APPLY]' : ' [DRY RUN]'}...`);

  try {
    const records = await fetchLiveHubspotRecords();

    const ids = records.map(r => r.subscriptionId).filter(Boolean);
    const { rows } = await pool.query(
      `SELECT subscription_id, current_state, source, hubspot_sync_status FROM subscriptions WHERE subscription_id = ANY($1)`,
      [ids]
    );
    const db = new Map(rows.map(r => [r.subscription_id, r]));

    const mismatches = [];
    const orphans = [];
    for (const rec of records) {
      const row = rec.subscriptionId ? db.get(rec.subscriptionId) : null;
      if (!row) { orphans.push(rec); continue; }
      const expected = statusMap[String(row.current_state).toLowerCase()];
      if (expected !== rec.status) mismatches.push({ ...rec, dbState: row.current_state, source: row.source });
    }

    // Counts by "HubSpot status → our state"
    const byPair = {};
    for (const m of mismatches) {
      const key = `${m.status} → ${m.dbState} (${m.source === 'backend' ? 'manual' : m.source})`;
      byPair[key] = (byPair[key] || 0) + 1;
    }

    log('INFO', 'RECONCILE', `Live in HubSpot: ${records.length} | In our database: ${records.length - orphans.length} | ` +
      `Mismatch: ${mismatches.length} | Not in our database: ${orphans.length}`);
    for (const [pair, count] of Object.entries(byPair).sort((a, b) => b[1] - a[1])) {
      log('INFO', 'RECONCILE', `  HubSpot ${pair}: ${count}`);
    }
    for (const m of mismatches.slice(0, 10)) {
      log('INFO', 'RECONCILE', `  e.g. ${m.subscriptionId}: HubSpot ${m.status}, database ${m.dbState} (record ${m.hubspotId})`);
    }
    for (const o of orphans.slice(0, 10)) {
      log('INFO', 'RECONCILE', `  not in database: ${o.subscriptionId || '(no subscription_id_unique)'} (record ${o.hubspotId}, ${o.status})`);
    }

    if (!APPLY) {
      log('INFO', 'RECONCILE', 'Dry run: nothing written. Run with --apply to mark the mismatches for the sync.');
      return;
    }

    let marked = 0;
    for (const m of mismatches) {
      const result = await pool.query(
        `UPDATE subscriptions SET hubspot_sync_status = 'PENDING', hubspot_subscription_id = $2
         WHERE subscription_id = $1`,
        [m.subscriptionId, String(m.hubspotId)]
      );
      marked += result.rowCount;
    }
    log('INFO', 'RECONCILE', `Marked ${marked} subscriptions as 'PENDING'. Now run: node server/scripts/syncPendingToHubspot.js`);

  } catch (error) {
    log('ERROR', 'RECONCILE', `Fatal error: ${error.message}`);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

main();
