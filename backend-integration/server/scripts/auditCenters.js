// ────── Audit: what a centers table would get from each source (read-only) ──────────────────────────────────────────────────────────
// ─── Phase 2 of the database cleanup. Nothing is written anywhere: it only reads and prints counts.
// ─── The universe of centres is HubSpot: the companies with nup_center_id. Every centre with a subscription has one, but not every
// ─── company with nup_center_id has a subscription. The Ops API and the database are compared against it.
// ─── 1. HubSpot (search of the companies with nup_center_id, paged by hs_object_id): how many, nup_center_id repeated in several
// ───    companies, and how filled name / commercial_name / segmento / market_hubspot / currency are, with their values.
// ─── 2. Ops API (every page, no kind filter): centres with subscriptions, whether they are in HubSpot, and whether the
// ───    hubspotCompanyId of the Ops API is the same company HubSpot has for that nup_center_id. stripe / zoho IDs coverage.
// ─── 3. Database: centres with usage (daily_stats, 60 days) or subscriptions that are not in HubSpot.
// ─── Run (prod, real HubSpot token): docker exec server-michael node server/scripts/auditCenters.js
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const path = require('path');
const dotenv = require('dotenv');

const envFile = process.env.NODE_ENV === 'production' ? '../.env.production' : '../.env.development';
dotenv.config({ path: path.resolve(__dirname, envFile) });

const { pool } = require('../db/db');

const OPS_API_URL = 'https://api.neuronup.com/ops/subscriptions';
const OPS_API_TOKEN = process.env.OPS_API_TOKEN;
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const HUBSPOT_PROPERTIES = ['nup_center_id', 'name', 'commercial_name', 'segmento', 'market_hubspot', 'currency__por_definir_'];
const PAGE_SIZE = 200;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const pct = (n, total) => total ? `${Math.round(100 * n / total)}%` : '-';
const top = (counter, n = 15) => Object.entries(counter).sort((a, b) => b[1] - a[1]).slice(0, n)
  .map(([k, v]) => `${k === '' ? '(empty)' : k}: ${v}`).join(' | ');


// ────── 1. HubSpot: companies with nup_center_id ──────────────────────────────────────────────────────────────────────────────────
// ─── Search limit ~5 requests per second: 250 ms between pages. Keyset by hs_object_id (the search stops at 10k per query).
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function auditHubspot() {
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
    if (!response.ok) throw new Error(`HubSpot search (${response.status}): ${JSON.stringify(data).slice(0, 200)}`);

    for (const r of data.results) companies.push({ companyId: String(r.id), ...r.properties });
    if (companies.length % 5000 < PAGE_SIZE) console.log(`  HubSpot: ${companies.length} companies...`);
    if (data.results.length < PAGE_SIZE) break;
    lastId = data.results[data.results.length - 1].id;
    await delay(250);
  }

  const byCenter = new Map();  // nup_center_id → companies
  for (const c of companies) {
    const id = String(c.nup_center_id).trim();
    byCenter.set(id, [...(byCenter.get(id) || []), c]);
  }
  const repeated = [...byCenter.entries()].filter(([, cs]) => cs.length > 1);
  const nonNumeric = [...byCenter.keys()].filter(id => !/^\d+$/.test(id));

  const filled = Object.fromEntries(HUBSPOT_PROPERTIES.map(p => [p, 0]));
  const values = { segmento: {}, market_hubspot: {}, currency__por_definir_: {} };
  for (const c of companies) {
    for (const p of HUBSPOT_PROPERTIES) if (c[p]) filled[p]++;
    for (const p of Object.keys(values)) values[p][c[p] || ''] = (values[p][c[p] || ''] || 0) + 1;
  }

  console.log(`\n== 1. HubSpot: ${companies.length} companies with nup_center_id, ${byCenter.size} distinct nup_center_id ==`);
  console.log(`  nup_center_id in several companies: ${repeated.length}` +
    (repeated.length ? ` (e.g. ${repeated.slice(0, 5).map(([id, cs]) => `${id}: ${cs.map(c => c.companyId).join('+')}`).join('; ')})` : ''));
  console.log(`  nup_center_id not numeric: ${nonNumeric.length}${nonNumeric.length ? ` (e.g. ${nonNumeric.slice(0, 5).join(', ')})` : ''}`);
  for (const p of HUBSPOT_PROPERTIES) console.log(`  ${p.padEnd(24)} filled: ${filled[p]} (${pct(filled[p], companies.length)})`);
  for (const p of Object.keys(values)) console.log(`  ${p} values: ${top(values[p])}`);

  return byCenter;
}


// ────── 2. Ops API against HubSpot ──────────────────────────────────────────────────────────────────────────────────────────────
async function auditOps(byCenter) {
  const centers = new Map();   // id → { hubspot:Set, stripe:Set, zoho:Set, accounts:Set }
  let page = 1;
  let subs = 0;

  while (true) {
    const response = await fetch(`${OPS_API_URL}?page=${page}`, {
      headers: { 'X-Api-Token': OPS_API_TOKEN, 'Content-Type': 'application/json' }
    });
    if (!response.ok) throw new Error(`Ops API page ${page}: ${response.status}`);
    const data = await response.json();
    if (!data || data.length === 0) break;

    for (const s of data) {
      subs++;
      const id = s.center?.id;
      if (id == null) continue;
      const key = String(id);
      if (!centers.has(key)) centers.set(key, { hubspot: new Set(), stripe: new Set(), zoho: new Set(), accounts: new Set() });
      const c = centers.get(key);
      if (s.center.hubspotCompanyId) c.hubspot.add(String(s.center.hubspotCompanyId));
      if (s.center.stripeCustomerId) c.stripe.add(s.center.stripeCustomerId);
      if (s.center.zohoBooksContactId) c.zoho.add(String(s.center.zohoBooksContactId));
      if (s.account) c.accounts.add(s.account);
    }
    if (page % 100 === 0) console.log(`  Ops API: page ${page}...`);
    page++;
    await delay(50);
  }

  const total = centers.size;
  let inHubspot = 0, sameCompany = 0, otherCompany = 0, opsWithoutCompany = 0;
  const otherExamples = [];
  for (const [id, c] of centers) {
    const companies = byCenter.get(id);
    if (!companies) continue;
    inHubspot++;
    if (c.hubspot.size === 0) { opsWithoutCompany++; continue; }
    if (companies.some(co => c.hubspot.has(co.companyId))) sameCompany++;
    else {
      otherCompany++;
      if (otherExamples.length < 5) otherExamples.push(`${id}: Ops ${[...c.hubspot].join('+')} vs HubSpot ${companies.map(co => co.companyId).join('+')}`);
    }
  }
  const count = (fn) => [...centers.values()].filter(fn).length;
  const accounts = {};
  for (const c of centers.values()) for (const a of c.accounts) accounts[a] = (accounts[a] || 0) + 1;

  console.log(`\n== 2. Ops API: ${subs} subscriptions, ${total} centres with subscriptions ==`);
  console.log(`  in HubSpot (by nup_center_id): ${inHubspot} (${pct(inHubspot, total)}), not in HubSpot: ${total - inHubspot}`);
  console.log(`  Ops hubspotCompanyId = the HubSpot company with that nup_center_id: ${sameCompany}`);
  console.log(`  Ops hubspotCompanyId = another company: ${otherCompany}${otherExamples.length ? ` (${otherExamples.join('; ')})` : ''}`);
  console.log(`  in HubSpot but without hubspotCompanyId in the Ops API: ${opsWithoutCompany}`);
  console.log(`  with stripeCustomerId: ${count(c => c.stripe.size > 0)} (${pct(count(c => c.stripe.size > 0), total)}), ` +
    `more than one: ${count(c => c.stripe.size > 1)}`);
  console.log(`  with zohoBooksContactId: ${count(c => c.zoho.size > 0)} (${pct(count(c => c.zoho.size > 0), total)}), ` +
    `more than one: ${count(c => c.zoho.size > 1)}`);
  console.log(`  accounts: ${top(accounts)} | more than one account: ${count(c => c.accounts.size > 1)}`);
}


// ────── 3. Database against HubSpot ─────────────────────────────────────────────────────────────────────────────────────────────
async function auditDatabase(byCenter) {
  const known = [...byCenter.keys()];
  const { rows: [r] } = await pool.query(`
    SELECT
      (SELECT COUNT(DISTINCT center_id) FROM daily_stats WHERE stat_date >= CURRENT_DATE - 60) AS usage_centers,
      (SELECT COUNT(DISTINCT center_id) FROM daily_stats WHERE stat_date >= CURRENT_DATE - 60 AND center_id::text <> ALL($1)) AS usage_not_in_hubspot,
      (SELECT COUNT(DISTINCT nup_center_id) FROM subscriptions WHERE nup_center_id IS NOT NULL) AS sub_centers,
      (SELECT COUNT(DISTINCT nup_center_id) FROM subscriptions WHERE nup_center_id IS NOT NULL AND nup_center_id <> ALL($1)) AS subs_not_in_hubspot,
      (SELECT COUNT(DISTINCT nup_center_id) FROM subscriptions WHERE current_state IN ('active','trial','past_due') AND nup_center_id IS NOT NULL) AS live_centers,
      (SELECT COUNT(DISTINCT nup_center_id) FROM subscriptions WHERE current_state IN ('active','trial','past_due') AND nup_center_id IS NOT NULL AND nup_center_id <> ALL($1)) AS live_not_in_hubspot
  `, [known]);

  console.log(`\n== 3. Database against HubSpot ==`);
  console.log(`  centres with usage (60 days): ${r.usage_centers}, not in HubSpot: ${r.usage_not_in_hubspot}`);
  console.log(`  centres with subscriptions:  ${r.sub_centers}, not in HubSpot: ${r.subs_not_in_hubspot}`);
  console.log(`  centres with a live subscription: ${r.live_centers}, not in HubSpot: ${r.live_not_in_hubspot}`);
}


async function main() {
  console.log('Centers audit (read-only)...');
  try {
    const byCenter = await auditHubspot();
    await auditOps(byCenter);
    await auditDatabase(byCenter);
  } catch (error) {
    console.error(`Fatal error: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
    process.exit(process.exitCode || 0);
  }
}

main();
