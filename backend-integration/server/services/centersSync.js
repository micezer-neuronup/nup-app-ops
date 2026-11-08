// ────── Centers: sync from HubSpot and the Ops API ────────────────────────────────────────────────────────────────────────────────────
// ─── Fills the centers table (migration 006). Used by the daily cron in server.js and by scripts/syncCenters.js (manual run).
// ─── 1. HubSpot: every company with nup_center_id (search paged by hs_object_id, 200 per page; ~265 pages on prod).
// ───    If HubSpot fails the run stops and nothing is written: HubSpot is the list of centres.
// ─── 2. Ops API (every page, no kind filter): stripeCustomerId and zohoBooksContactId of the centres with subscriptions.
// ───    If the Ops API fails the run goes on: those two IDs keep their stored value (COALESCE in upsertCenters).
// ───    Its hubspotCompanyId is not used (stale after merges in HubSpot).
// ─── 3. upsertCenters (db/dbCenters.js): only writes what changed.
// ─── The log lists the non-numeric nup_center_id of HubSpot (left out: other products' ids, phones...) and the centres with a live subscription
// ─── that have no company in HubSpot (the HubSpot sync can't send their subscriptions: FAILED_NO_COMPANY).
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const { pool } = require('../db/db');
const { upsertCenters } = require('../db/dbCenters');
const { log } = require('../utils/logger');

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const OPS_API_URL = 'https://api.neuronup.com/ops/subscriptions';
const OPS_API_TOKEN = process.env.OPS_API_TOKEN;
const HUBSPOT_PROPERTIES = ['nup_center_id', 'name', 'commercial_name', 'segmento', 'market_hubspot', 'currency__por_definir_',
                            'hs_lastmodifieddate'];
const PAGE_SIZE = 200;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const clean = (value) => (value == null || String(value).trim() === '') ? null : String(value).trim();


// ────── HubSpot companies with nup_center_id ──────────────────────────────────────────────────────────────────────────────────────
// ─── Search limit ~5 requests per second: 250 ms between pages. Keyset by hs_object_id (the search stops at 10k per query).
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function fetchHubspotCompanies() {
  const companies = [];
  let lastId = '0';

  while (true) {
    const response = await fetch('https://api.hubapi.com/crm/v3/objects/companies/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${HUBSPOT_TOKEN}` },
      body: JSON.stringify({
        filterGroups: [{ filters: [
          { propertyName: 'nup_center_id', operator: 'HAS_PROPERTY' },
          { propertyName: 'hs_object_id', operator: 'GT', value: lastId },
        ] }],
        sorts: [{ propertyName: 'hs_object_id', direction: 'ASCENDING' }],
        properties: HUBSPOT_PROPERTIES,
        limit: PAGE_SIZE,
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(`HubSpot search failed (${response.status}): ${JSON.stringify(data).slice(0, 200)}`);

    for (const r of data.results) companies.push({ id: String(r.id), ...r.properties });
    if (data.results.length < PAGE_SIZE) break;
    lastId = data.results[data.results.length - 1].id;
    await delay(250);
  }

  return companies;
}


// ────── Ops API: Stripe and Zoho IDs per centre ───────────────────────────────────────────────────────────────────────────────────
async function fetchOpsCenterIds() {
  const ids = new Map();  // nup_center_id → { stripe, zoho }
  for (let page = 1; ; page++) {
    const response = await fetch(`${OPS_API_URL}?page=${page}`, {
      headers: { 'X-Api-Token': OPS_API_TOKEN, 'Content-Type': 'application/json' }
    });
    if (!response.ok) throw new Error(`Ops API page ${page}: ${response.status}`);
    const data = await response.json();
    if (!data || data.length === 0) break;

    for (const s of data) {
      if (s.center?.id == null) continue;
      const key = String(s.center.id);
      const current = ids.get(key) || { stripe: null, zoho: null };
      ids.set(key, {
        stripe: current.stripe || clean(s.center.stripeCustomerId),
        zoho: current.zoho || clean(s.center.zohoBooksContactId),
      });
    }
    await delay(50);
  }
  return ids;
}


async function runCentersSync() {
  log('INFO', 'CENTERS-SYNC', 'Starting centers sync (HubSpot + Ops API)...');

  const companies = await fetchHubspotCompanies();

  let opsIds = new Map();
  try {
    opsIds = await fetchOpsCenterIds();
  } catch (error) {
    log('WARN', 'CENTERS-SYNC', `Ops API failed, Stripe / Zoho IDs keep their stored value: ${error.message}`);
  }

  const nonNumeric = [];
  const centers = [];
  for (const c of companies) {
    const nupCenterId = clean(c.nup_center_id);
    if (!nupCenterId || !/^\d+$/.test(nupCenterId)) {
      nonNumeric.push(`${c.nup_center_id} (company ${c.id})`);
      continue;
    }
    const ops = opsIds.get(nupCenterId);
    centers.push({
      nup_center_id: nupCenterId,
      hubspot_company_id: c.id,
      name: clean(c.name),
      commercial_name: clean(c.commercial_name),
      segment: clean(c.segmento),
      market: clean(c.market_hubspot),
      currency: clean(c.currency__por_definir_)?.toUpperCase() || null,
      stripe_customer_id: ops?.stripe || null,
      zoho_contact_id: ops?.zoho || null,
      hubspot_updated_at: c.hs_lastmodifieddate || null,
    });
  }

  const changed = await upsertCenters(centers);

  const { rows: liveWithoutCompany } = await pool.query(`
    SELECT DISTINCT s.nup_center_id
    FROM subscriptions s
    LEFT JOIN centers c ON c.nup_center_id = s.nup_center_id
    WHERE s.current_state IN ('active', 'trial', 'past_due') AND s.nup_center_id IS NOT NULL
      AND (c.nup_center_id IS NULL OR c.hubspot_company_id IS NULL)
    ORDER BY 1
  `);

  log('INFO', 'CENTERS-SYNC', `Done. HubSpot companies: ${companies.length} | Centres: ${centers.length} | ` +
    `Inserted or changed: ${changed} | Non-numeric nup_center_id left out: ${nonNumeric.length} | ` +
    `Ops API centres: ${opsIds.size} | Live subscriptions without HubSpot company: ${liveWithoutCompany.length}`);
  if (nonNumeric.length) log('INFO', 'CENTERS-SYNC', `Non-numeric nup_center_id left out (Stimulus, HUB…, VP-INV…, NA-…, phones: not NeuronUP centre ids): ${nonNumeric.slice(0, 100).join(', ')}`);
  if (liveWithoutCompany.length) {
    log('INFO', 'CENTERS-SYNC', `Centres with a live subscription and no HubSpot company: ${liveWithoutCompany.slice(0, 100).map(r => r.nup_center_id).join(', ')}${liveWithoutCompany.length > 100 ? ' ...' : ''}`);
  }

  return { companies: companies.length, centers: centers.length, changed, nonNumeric: nonNumeric.length, liveWithoutCompany: liveWithoutCompany.length };
}

module.exports = { runCentersSync };
