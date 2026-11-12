// ────── Audit: HubSpot invoices and articles (read-only) ───────────────────────────────────────────────────────────────────────────
// ─── Zoho sends every invoice to HubSpot (and keeps it updated with webhooks). Before deciding what to store in our database,
// ─── this shows how it is modelled. Nothing is written anywhere.
// ─── 1. Objects: the custom objects of invoices (2-145603246) and articles (2-202420827); object type IDs passed as arguments
// ───    are added (node ... 2-XXXX). Needs the crm.objects.custom.read scope.
// ─── 2. Per object: total records, every property (native or custom), fill rate in a sample of the most recently modified records
// ───    (up to SAMPLE), and the top values of enumeration / number / date / bool properties. Text properties only show fill and
// ───    distinct count (no customer data printed).
// ─── 3. Invoices: associations of a sample (companies, articles, our subscription and item objects, deals, contacts) and the
// ───    properties that could link
// ───    them to a centre or a subscription (nup, stripe, zoho, subscription, center, sub_).
// ─── 4. Records modified in the last 24 h / 7 days (size of an incremental sync by hs_lastmodifieddate).
// ─── 5. Values of the low-cardinality text properties (categories: ≤ 15 distinct; names, emails and URLs are never printed).
// ─── 6. Identifiers: format of invoice_id / id_factura_zoho, and whether the article's zoho_invoice_number / nup_center_id match
// ───    the invoice it is associated with.
// ─── 7. Articles history: per year, invoices, invoices with articles, articles, and the most used products (the catalogue
// ───    changed in 2026, the old invoices may not have articles).
// ─── Run (prod, real HubSpot token): docker exec server-michael node server/scripts/auditHubspotInvoices.js
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const path = require('path');
const dotenv = require('dotenv');

const envFile = process.env.NODE_ENV === 'production' ? '../.env.production' : '../.env.development';
dotenv.config({ path: path.resolve(__dirname, envFile) });

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const SAMPLE = 1000;
const LINK_HINT = /nup|stripe|zoho|subscri|center|centro|sub_/i;
const SENSITIVE = /customer|email|vendedor|created_by|url|comments/i;  // never print their values
const MAX_CATEGORY_VALUES = 15;
const INVOICE_OBJECT = { id: '2-145603246', label: 'invoices (custom)' };
const ARTICLE_OBJECT = { id: '2-202420827', label: 'articles (custom)' };
// Our subscription / subscription item objects (hubspotServices.js ACCOUNT_SUB_OBJECT_ID / ITEM_OBJECT_ID)
const ASSOCIATIONS = ['companies', ARTICLE_OBJECT.id, '2-203896755', '2-203892072', 'deals', 'contacts'];

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const hs = async (url, body) => {
  const response = await fetch(`https://api.hubapi.com${url}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${HUBSPOT_TOKEN}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  await delay(150);
  return { ok: response.ok, status: response.status, data };
};


// ────── 1. Objects ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function discoverObjects() {
  const objects = [];
  const extra = process.argv.slice(2).map(id => ({ id, label: `object ${id} (by hand)` }));
  for (const obj of [INVOICE_OBJECT, ARTICLE_OBJECT, ...extra]) {
    const r = await hs(`/crm/v3/objects/${obj.id}?limit=1`);
    console.log(`  ${obj.label} ${obj.id}: ${r.ok ? 'accessible' : `not accessible (${r.status}: ${String(r.data.message || '').slice(0, 150)})`}`);
    if (r.ok) objects.push(obj);
  }
  return objects;
}


// ────── 2. Properties and fill rate ─────────────────────────────────────────────────────────────────────────────────────────────
async function auditObject(obj) {
  console.log(`\n================ ${obj.label} (${obj.id}) ================`);

  const props = await hs(`/crm/v3/properties/${obj.id}`);
  if (!props.ok) { console.log(`  properties: ${props.status}`); return null; }
  const properties = props.data.results.filter(p => !p.hidden);

  const total = await hs(`/crm/v3/objects/${obj.id}/search`, { limit: 1, filterGroups: [] });
  const since = (days) => String(Date.now() - days * 86400000);
  const recent = async (days) => (await hs(`/crm/v3/objects/${obj.id}/search`, {
    limit: 1, filterGroups: [{ filters: [{ propertyName: 'hs_lastmodifieddate', operator: 'GTE', value: since(days) }] }]
  })).data.total;
  console.log(`  records: ${total.data.total ?? '?'} | modified last 24 h: ${await recent(1)} | last 7 days: ${await recent(7)}`);

  // Sample: the most recently modified records, with every visible property (in chunks, the search caps the property list)
  const names = properties.map(p => p.name);
  const records = new Map();
  for (let i = 0; i < names.length; i += 100) {
    const chunk = names.slice(i, i + 100);
    let after;
    let fetched = 0;
    while (fetched < SAMPLE) {
      const r = await hs(`/crm/v3/objects/${obj.id}/search`, {
        limit: 200, after, properties: chunk, filterGroups: [],
        sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }],
      });
      if (!r.ok) { console.log(`  search failed (${r.status}): ${String(r.data.message || '').slice(0, 150)}`); return null; }
      for (const rec of r.data.results) records.set(rec.id, { ...(records.get(rec.id) || {}), ...rec.properties });
      fetched += r.data.results.length;
      after = r.data.paging?.next?.after;
      if (!after) break;
    }
  }

  const sample = [...records.values()];
  console.log(`  sample: ${sample.length} records | properties: ${properties.length} (${properties.filter(p => !p.hubspotDefined).length} custom)`);
  console.log(`  property | type | custom? | filled | values`);
  const rows = properties.map(p => {
    const values = sample.map(r => r[p.name]).filter(v => v != null && v !== '');
    let detail = '';
    if (['enumeration', 'bool'].includes(p.type) || p.fieldType === 'booleancheckbox') {
      const counter = {};
      for (const v of values) counter[v] = (counter[v] || 0) + 1;
      detail = Object.entries(counter).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k}: ${n}`).join(', ');
    } else if (['number', 'date', 'datetime'].includes(p.type)) {
      const sorted = values.map(v => p.type === 'number' ? Number(v) : v).sort((a, b) => a > b ? 1 : -1);
      if (sorted.length) detail = `min ${sorted[0]} | max ${sorted[sorted.length - 1]}`;
    } else {
      const distinct = new Set(values);
      detail = `${distinct.size} distinct`;
      if (distinct.size > 0 && distinct.size <= MAX_CATEGORY_VALUES && !SENSITIVE.test(p.name)) {
        const counter = {};
        for (const v of values) counter[v] = (counter[v] || 0) + 1;
        detail += ': ' + Object.entries(counter).sort((a, b) => b[1] - a[1])
          .map(([k, n]) => `${String(k).slice(0, 40)}: ${n}`).join(', ');
      }
    }
    return { p, filled: values.length, detail };
  });
  rows.sort((a, b) => (Number(a.p.hubspotDefined) - Number(b.p.hubspotDefined)) || (b.filled - a.filled));
  for (const { p, filled, detail } of rows) {
    if (filled === 0 && p.hubspotDefined) continue;  // empty native properties: not printed
    const hint = LINK_HINT.test(p.name) ? '  ◀ link?' : '';
    console.log(`  ${p.name} | ${p.type} | ${p.hubspotDefined ? 'native' : 'CUSTOM'} | ${filled}/${sample.length} | ${detail}${hint}`);
  }
  const emptyNative = rows.filter(r => r.filled === 0 && r.p.hubspotDefined).length;
  console.log(`  (+ ${emptyNative} native properties always empty in the sample, not printed)`);

  return records;
}


// ────── 3. Associations of invoices ─────────────────────────────────────────────────────────────────────────────────────────────
async function auditAssociations(obj, records) {
  const sampleIds = [...records.keys()].slice(0, 100);
  const articleOf = new Map();  // invoice id → article ids
  console.log(`\n  associations of ${sampleIds.length} ${obj.label}:`);
  for (const to of ASSOCIATIONS) {
    const r = await hs(`/crm/v4/associations/${obj.id}/${to}/batch/read`, { inputs: sampleIds.map(id => ({ id })) });
    if (!r.ok && r.status !== 207) { console.log(`    → ${to}: ${r.status} ${String(r.data.message || '').slice(0, 100)}`); continue; }
    const withAny = (r.data.results || []).filter(x => (x.to || []).length > 0);
    if (to === ARTICLE_OBJECT.id) for (const x of withAny) articleOf.set(String(x.from.id), x.to.map(t => String(t.toObjectId)));
    const counts = withAny.map(x => x.to.length);
    const labels = {};
    for (const x of withAny) for (const t of x.to) for (const a of t.associationTypes || []) labels[a.label || a.typeId] = (labels[a.label || a.typeId] || 0) + 1;
    console.log(`    → ${to}: ${withAny.length}/${sampleIds.length} have at least one` +
      (counts.length ? ` (max ${Math.max(...counts)} per record; types: ${Object.entries(labels).map(([k, n]) => `${k}: ${n}`).join(', ')})` : ''));
  }

  // ── 6. Identifiers: formats and article ↔ invoice match
  const sampleRecords = sampleIds.map(id => records.get(id));
  console.log(`\n  identifiers (examples): invoice_id ${sampleRecords.slice(0, 3).map(r => r.invoice_id).join(', ')} | ` +
    `id_factura_zoho ${sampleRecords.slice(0, 3).map(r => r.id_factura_zoho).join(', ')}`);
  const articleIds = [...new Set([...articleOf.values()].flat())];
  const articles = new Map();
  for (let i = 0; i < articleIds.length; i += 100) {
    const r = await hs(`/crm/v3/objects/${ARTICLE_OBJECT.id}/batch/read`, {
      properties: ['zoho_invoice_number', 'zoho_invoice_nup_center_id'], inputs: articleIds.slice(i, i + 100).map(id => ({ id }))
    });
    for (const a of r.data.results || []) articles.set(String(a.id), a.properties);
  }
  const match = { invoice_id: 0, id_factura_zoho: 0, none: 0, center_ok: 0, center_diff: 0 };
  for (const [invoiceId, ids] of articleOf) {
    const inv = records.get(invoiceId);
    for (const aid of ids) {
      const a = articles.get(aid);
      if (!a) continue;
      if (a.zoho_invoice_number && a.zoho_invoice_number === inv.invoice_id) match.invoice_id++;
      else if (a.zoho_invoice_number && a.zoho_invoice_number === inv.id_factura_zoho) match.id_factura_zoho++;
      else match.none++;
      if (String(a.zoho_invoice_nup_center_id || '') === String(inv.nup_center_id || '')) match.center_ok++; else match.center_diff++;
    }
  }
  console.log(`  articles of those invoices: ${articles.size} | zoho_invoice_number = invoice_id: ${match.invoice_id}, ` +
    `= id_factura_zoho: ${match.id_factura_zoho}, matches neither: ${match.none} | ` +
    `same nup_center_id as the invoice: ${match.center_ok}, different: ${match.center_diff}`);
  const examples = [...articles.values()].slice(0, 3).map(a => a.zoho_invoice_number).join(', ');
  console.log(`  article zoho_invoice_number (examples): ${examples}`);
}


// ────── 7. Articles history per year ────────────────────────────────────────────────────────────────────────────────────────────
// ─── Counts with the search total (one call per figure) and a sample of 200 articles per year for the most used products.
// ─── Date properties are filtered with the epoch milliseconds of midnight UTC.
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function auditHistory() {
  console.log(`\n================ articles history per year ================`);
  console.log(`  year | invoices | invoices with articles (number_of_associates_zoho_articles > 0) | articles | distinct products in 200 | top products`);
  const count = async (objectId, filters) => (await hs(`/crm/v3/objects/${objectId}/search`, { limit: 1, filterGroups: [{ filters }] })).data.total ?? '?';
  for (let year = 2016; year <= new Date().getUTCFullYear(); year++) {
    const from = String(Date.UTC(year, 0, 1));
    const to = String(Date.UTC(year + 1, 0, 1));
    const inYear = (prop) => [{ propertyName: prop, operator: 'GTE', value: from }, { propertyName: prop, operator: 'LT', value: to }];

    const invoices = await count(INVOICE_OBJECT.id, inYear('zoho_invoice_created_date'));
    const withArticles = await count(INVOICE_OBJECT.id, [...inYear('zoho_invoice_created_date'),
      { propertyName: 'number_of_associates_zoho_articles', operator: 'GT', value: '0' }]);
    const articles = await count(ARTICLE_OBJECT.id, inYear('zoho_invoice_created_date'));

    const sample = await hs(`/crm/v3/objects/${ARTICLE_OBJECT.id}/search`, {
      limit: 200, properties: ['item_name', 'zoho_item_id'], filterGroups: [{ filters: inYear('zoho_invoice_created_date') }]
    });
    const items = {};
    const productIds = new Set();
    for (const a of sample.data.results || []) {
      items[a.properties.item_name || '-'] = (items[a.properties.item_name || '-'] || 0) + 1;
      if (a.properties.zoho_item_id) productIds.add(a.properties.zoho_item_id);
    }
    const topItems = Object.entries(items).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `${k.slice(0, 35)} (${n})`).join('; ');
    console.log(`  ${year} | ${invoices} | ${withArticles} | ${articles} | ${productIds.size} | ${topItems || '-'}`);
  }
}


async function main() {
  console.log('HubSpot invoices audit (read-only)...');
  try {
    const objects = await discoverObjects();
    for (const obj of objects) {
      const records = await auditObject(obj);
      if (records && obj.id === INVOICE_OBJECT.id) await auditAssociations(obj, records);
    }
    if (objects.some(o => o.id === ARTICLE_OBJECT.id)) await auditHistory();
  } catch (error) {
    console.error(`Fatal error: ${error.message}`);
    process.exitCode = 1;
  } finally {
    process.exit(process.exitCode || 0);
  }
}

main();
