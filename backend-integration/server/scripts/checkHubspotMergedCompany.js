// ────── Check: what HubSpot returns for a merged company id (read-only) ──────────────────────────────────────────────────────────────
// ─── The Ops API keeps, for ~165 centres, the hubspotCompanyId of a company that was merged into another one. This shows, for one or
// ─── more of those ids, whether anything that uses the old id still works. Nothing is written.
// ───   1. GET /crm/v3/objects/companies/{old id}: does it answer, and with which id (the old one, or the surviving company)?
// ───   2. Batch read by the old id: same question (it is what most integrations use).
// ───   3. Search of the surviving company by hs_merged_object_ids: does it list the old id?
// ─── Run (prod): docker exec server-michael node server/scripts/checkHubspotMergedCompany.js <old company id> [<old company id>...]
// ─── The old ids are the 'Ops …' ids of the 'merged into …' rows of auditHubspotCompanyLinks.js.
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const path = require('path');
const dotenv = require('dotenv');

const envFile = process.env.NODE_ENV === 'production' ? '../.env.production' : '../.env.development';
dotenv.config({ path: path.resolve(__dirname, envFile) });

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const PROPS = ['nup_center_id', 'hs_merged_object_ids', 'createdate'];

const hs = async (url, body) => {
  const response = await fetch(`https://api.hubapi.com${url}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${HUBSPOT_TOKEN}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
};

async function check(oldId) {
  console.log(`\n── company ${oldId}`);

  const single = await hs(`/crm/v3/objects/companies/${oldId}?properties=${PROPS.join(',')}`);
  if (single.status === 200) {
    const p = single.data.properties || {};
    console.log(`  1. GET by id: 200 | returned id ${single.data.id}${String(single.data.id) !== oldId ? ' (DIFFERENT: HubSpot redirects to the surviving company)' : ' (same id)'}` +
      ` | nup_center_id ${p.nup_center_id || '-'} | created ${p.createdate || '-'} | merged ids: ${p.hs_merged_object_ids || '-'}`);
  } else {
    console.log(`  1. GET by id: ${single.status} ${String(single.data.message || '').slice(0, 120)}`);
  }

  const batch = await hs(`/crm/v3/objects/companies/batch/read`, { properties: PROPS, inputs: [{ id: oldId }] });
  const got = (batch.data.results || [])[0];
  console.log(`  2. batch read: ${batch.status}${got ? ` | returned id ${got.id}${String(got.id) !== oldId ? ' (surviving company)' : ' (same id)'}` : ' | nothing returned'}`);

  const search = await hs(`/crm/v3/objects/companies/search`, {
    filterGroups: [{ filters: [{ propertyName: 'hs_merged_object_ids', operator: 'CONTAINS_TOKEN', value: oldId }] }],
    properties: PROPS, limit: 5,
  });
  const found = search.data.results || [];
  console.log(`  3. search hs_merged_object_ids contains ${oldId}: ${search.status} | ` +
    (found.length ? found.map(c => `company ${c.id} (nup_center_id ${c.properties.nup_center_id || '-'})`).join(', ') : 'none'));
}

async function main() {
  const ids = process.argv.slice(2).filter(id => /^\d+$/.test(id));
  if (!ids.length) {
    console.log('Usage: node server/scripts/checkHubspotMergedCompany.js <old company id> [<old company id>...]');
    process.exit(1);
  }
  console.log('HubSpot merged company check (read-only)...');
  try {
    for (const id of ids) await check(id);
  } catch (error) {
    console.error(`Fatal error: ${error.message}`);
    process.exitCode = 1;
  } finally {
    process.exit(process.exitCode || 0);
  }
}

main();
