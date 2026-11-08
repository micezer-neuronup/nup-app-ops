// ────── Audit: Ops API hubspotCompanyId vs the HubSpot company of each centre (read-only) ─────────────────────────────────────────────
// ─── auditCenters.js found ~165 centres whose hubspotCompanyId in the Ops API is not the HubSpot company with that nup_center_id.
// ─── This classifies each one. Nothing is written.
// ───   1. Ops API (every page): hubspotCompanyId of each centre with subscriptions.
// ───   2. HubSpot batch read of those companies (100 per call, including archived), with nup_center_id and hs_merged_object_ids.
// ───      Same nup_center_id → linked fine (not printed).
// ───   3. For the rest, the company HubSpot has for that nup_center_id (search), and the case:
// ───      merged:      the Ops company was merged into another one (the current company lists it in hs_merged_object_ids).
// ───      archived:    the Ops company is archived (deleted) in HubSpot.
// ───      not found:   the Ops company doesn't exist at all.
// ───      other centre: the Ops company exists and is active, but has another nup_center_id (or none).
// ───      no company:  HubSpot has no company with that nup_center_id.
// ─── Run: docker exec server-michael node server/scripts/auditHubspotCompanyLinks.js
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const path = require('path');
const dotenv = require('dotenv');

const envFile = process.env.NODE_ENV === 'production' ? '../.env.production' : '../.env.development';
dotenv.config({ path: path.resolve(__dirname, envFile) });

const OPS_API_URL = 'https://api.neuronup.com/ops/subscriptions';
const OPS_API_TOKEN = process.env.OPS_API_TOKEN;
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const PROPS = ['nup_center_id', 'name', 'hs_merged_object_ids', 'createdate'];

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const hs = (url, body) => fetch(url, {
  method: body ? 'POST' : 'GET',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${HUBSPOT_TOKEN}` },
  body: body ? JSON.stringify(body) : undefined,
});


async function fetchOpsCompanies() {
  const centers = new Map();  // nup_center_id → Ops hubspotCompanyId
  for (let page = 1; ; page++) {
    const response = await fetch(`${OPS_API_URL}?page=${page}`, { headers: { 'X-Api-Token': OPS_API_TOKEN, 'Content-Type': 'application/json' } });
    if (!response.ok) throw new Error(`Ops API page ${page}: ${response.status}`);
    const data = await response.json();
    if (!data || data.length === 0) break;
    for (const s of data) {
      if (s.center?.id != null && s.center.hubspotCompanyId) centers.set(String(s.center.id), String(s.center.hubspotCompanyId));
    }
    if (page % 100 === 0) console.log(`  Ops API: page ${page}...`);
    await delay(50);
  }
  return centers;
}


// Batch read by id. archived=true also returns deleted ones. Merged ids come back as the surviving record.
async function batchReadCompanies(ids, archived) {
  const byId = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const response = await hs(`https://api.hubapi.com/crm/v3/objects/companies/batch/read?archived=${archived}`,
      { properties: PROPS, inputs: chunk.map(id => ({ id })) });
    const data = await response.json();
    if (!response.ok && response.status !== 207) throw new Error(`batch read (${response.status}): ${JSON.stringify(data).slice(0, 200)}`);
    for (const r of data.results || []) {
      byId.set(String(r.id), r);
      for (const merged of String(r.properties.hs_merged_object_ids || '').split(';').filter(Boolean)) {
        if (chunk.includes(merged)) byId.set(merged, { ...r, mergedFrom: merged });
      }
    }
    if ((i / 100) % 50 === 0) console.log(`  HubSpot batch read${archived ? ' (archived)' : ''}: ${Math.min(i + 100, ids.length)} / ${ids.length}...`);
    await delay(120);
  }
  return byId;
}


async function companyOfCenter(centerId) {
  const response = await hs('https://api.hubapi.com/crm/v3/objects/companies/search', {
    filterGroups: [{ filters: [{ propertyName: 'nup_center_id', operator: 'EQ', value: centerId }] }],
    properties: PROPS, limit: 5,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`search ${centerId} (${response.status})`);
  return data.results || [];
}


async function main() {
  console.log('HubSpot company links audit (read-only)...');
  try {
    const centers = await fetchOpsCompanies();
    const opsIds = [...new Set(centers.values())];
    const active = await batchReadCompanies(opsIds, false);

    const suspects = [...centers.entries()].filter(([centerId, companyId]) => {
      const c = active.get(companyId);
      return !c || c.mergedFrom || String(c.properties.nup_center_id || '').trim() !== centerId;
    });
    console.log(`\nCentres with an Ops hubspotCompanyId: ${centers.size} | linked fine: ${centers.size - suspects.length} | to check: ${suspects.length}`);

    const missing = suspects.map(([, companyId]) => companyId).filter(id => !active.has(id));
    const archived = missing.length ? await batchReadCompanies(missing, true) : new Map();

    const cases = {};
    const rows = [];
    for (const [centerId, opsCompanyId] of suspects) {
      const own = await companyOfCenter(centerId);
      await delay(250);
      const ownIds = own.map(o => o.id).join('+') || '-';
      const ops = active.get(opsCompanyId);

      let kind;
      if (ops?.mergedFrom) kind = own.some(o => o.id === ops.id) ? 'merged into the centre company' : 'merged into another company';
      else if (ops) kind = own.length ? 'other centre' : 'other centre (and no company for this centre)';
      else if (archived.has(opsCompanyId)) kind = 'archived';
      else kind = 'not found';
      if (!own.length && !kind.includes('no company')) kind += ' + no company for this centre';

      cases[kind] = (cases[kind] || 0) + 1;
      const opsInfo = ops ? `${ops.properties.name} (nup ${ops.properties.nup_center_id || '-'})` :
        archived.has(opsCompanyId) ? `${archived.get(opsCompanyId).properties.name} (archived)` : '-';
      rows.push(`${centerId} | Ops ${opsCompanyId}: ${opsInfo} | HubSpot ${ownIds}${own[0] ? `: ${own[0].properties.name}` : ''} | ${kind}`);
    }

    console.log('\nCases:');
    for (const [kind, n] of Object.entries(cases).sort((a, b) => b[1] - a[1])) console.log(`  ${kind}: ${n}`);
    console.log('\ncentre | Ops company | HubSpot company of the centre | case');
    for (const r of rows) console.log(`  ${r}`);
  } catch (error) {
    console.error(`Fatal error: ${error.message}`);
    process.exitCode = 1;
  } finally {
    process.exit(process.exitCode || 0);
  }
}

main();
