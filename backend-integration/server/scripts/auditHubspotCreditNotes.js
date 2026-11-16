// ────── Audit: HubSpot credit notes and their articles (read-only) ──────────────────────────────────────────────────────────────────
// ─── Zoho sends its credit notes to HubSpot like the invoices. Before adding them to the billing schema, this shows how they are
// ─── modelled and how they link to invoices. Nothing is written anywhere. Same helpers as auditHubspotInvoices.js.
// ─── 1. Per object (credit notes 2-199692678, credit note articles 2-202874136): total records, modified in 24 h / 7 days, every
// ───    property with its fill rate in a sample of the most recently modified records, and the top values.
// ─── 2. Associations of a sample of credit notes (companies, invoices, credit note articles, invoice articles, deals, contacts)
// ───    and of credit note articles (credit notes, invoices, invoice articles).
// ─── 3. Link properties: for every associated pair, which property of one equals which property of the other (the names are
// ───    not known, so they are found from the data). Plus the text properties that hold invoice numbers (INV-…).
// ─── 4. Amounts: which credit note amount equals the sum of its articles (with and without tax), and whether the invoice's
// ───    credit_note_amount_eur equals the sum of its credit notes.
// ─── 5. One full real example: a credit note with its articles, and its invoice with its articles. Customer names, emails,
// ───    URLs and comments are hidden.
// ─── Run (prod, real HubSpot token): docker exec server-michael node server/scripts/auditHubspotCreditNotes.js
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const { hs, auditObject, SENSITIVE } = require('./auditHubspotInvoices');

const CREDIT_NOTE = { id: '2-199692678', label: 'credit notes (custom)' };
const CREDIT_ARTICLE = { id: '2-202874136', label: 'credit note articles (custom)' };
const INVOICE = '2-145603246';
const INVOICE_ARTICLE = '2-202420827';
const PAIRS_SAMPLE = 100;
const MATCH_MIN_LENGTH = 3;   // shorter values (1, EUR...) would match by chance
const HIDE = new RegExp(`${SENSITIVE.source}|contact|address|direccion|phone|telefono|nif|cif|vat_number`, 'i');  // in the example


// ────── Helpers ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function propertyDefs(objectId) {
  const r = await hs(`/crm/v3/properties/${objectId}`);
  return r.ok ? r.data.results.filter(p => !p.hidden) : [];
}

// Batch read with every visible property (in chunks of 100 properties); id → properties
async function readAll(objectId, ids, names) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const inputs = ids.slice(i, i + 100).map(id => ({ id }));
    for (let j = 0; j < names.length; j += 100) {
      const r = await hs(`/crm/v3/objects/${objectId}/batch/read`, { properties: names.slice(j, j + 100), inputs });
      for (const rec of r.data.results || []) out.set(String(rec.id), { ...(out.get(String(rec.id)) || {}), ...rec.properties });
    }
  }
  return out;
}

// from ids → Map(fromId → [toIds]); prints how many have at least one
async function associations(fromId, toId, ids, label) {
  const result = new Map();
  const r = await hs(`/crm/v4/associations/${fromId}/${toId}/batch/read`, { inputs: ids.map(id => ({ id })) });
  if (!r.ok && r.status !== 207) {
    console.log(`    → ${label}: ${r.status} ${String(r.data.message || '').slice(0, 100)}`);
    return result;
  }
  for (const x of r.data.results || []) {
    const to = (x.to || []).map(t => String(t.toObjectId));
    if (to.length) result.set(String(x.from.id), to);
  }
  const counts = [...result.values()].map(v => v.length);
  console.log(`    → ${label}: ${result.size}/${ids.length} have at least one` + (counts.length ? ` (max ${Math.max(...counts)} per record)` : ''));
  return result;
}

// For associated pairs (a, b): which property of a has the same value as which property of b
function matchProperties(pairs, aRecords, bRecords, aLabel, bLabel) {
  const counter = {};
  let checked = 0;
  for (const [aId, bId] of pairs) {
    const a = aRecords.get(aId);
    const b = bRecords.get(bId);
    if (!a || !b) continue;
    checked++;
    const seen = new Set();
    for (const [ka, va] of Object.entries(a)) {
      if (va == null || String(va).length < MATCH_MIN_LENGTH || /^\d{4}-\d{2}-\d{2}/.test(va)) continue;
      if (ka.startsWith('hs_') && ka !== 'hs_object_id') continue;
      for (const [kb, vb] of Object.entries(b)) {
        if (kb.startsWith('hs_') && kb !== 'hs_object_id') continue;
        if (String(va).trim() === String(vb ?? '').trim()) {
          const key = `${aLabel}.${ka} = ${bLabel}.${kb}`;
          if (!seen.has(key)) { counter[key] = (counter[key] || 0) + 1; seen.add(key); }
        }
      }
    }
  }
  console.log(`    same value in ${checked} associated pairs ${aLabel} → ${bLabel}:`);
  const top = Object.entries(counter).sort((x, y) => y[1] - x[1]).slice(0, 12);
  if (!top.length) console.log('      (none)');
  for (const [k, n] of top) console.log(`      ${k}: ${n}/${checked}`);
}

const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v))) ? null : Number(v);

function printRecord(title, props) {
  console.log(`\n  ── ${title}`);
  for (const [k, v] of Object.entries(props).sort(([a], [b]) => a.localeCompare(b))) {
    if (v == null || v === '') continue;
    if (k.startsWith('hs_') && !['hs_object_id', 'hs_createdate', 'hs_lastmodifieddate'].includes(k)) continue;
    const value = HIDE.test(k) ? '(hidden)' : String(v).replace(/\s+/g, ' ').slice(0, 80);
    console.log(`     ${k}: ${value}`);
  }
}


// ────── 4. Amounts ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
// ─── Tries every numeric amount/total property of the credit note against the sum of every numeric total/amount/price property of
// ─── its articles, alone and plus each tax_amount-like property. Prints the combinations that match most (1 cent tolerance).
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function checkAmounts(cnArticles, cnRecords, artRecords, cnDefs, artDefs) {
  const numeric = (defs, re) => defs.filter(p => p.type === 'number' && re.test(p.name) && !p.name.startsWith('hs_')).map(p => p.name);
  const cnProps = numeric(cnDefs, /amount|total|importe/i);
  const lineProps = numeric(artDefs, /total|amount|price|importe/i).filter(n => !/tax|discount/i.test(n));
  const taxProps = numeric(artDefs, /tax_amount|impuesto/i);
  const exprs = [...lineProps.map(l => ({ label: `Σ ${l}`, f: (a) => num(a[l]) })),
                 ...lineProps.flatMap(l => taxProps.map(t => ({ label: `Σ (${l} + ${t})`, f: (a) => num(a[l]) == null ? null : num(a[l]) + (num(a[t]) || 0) })))];

  const counter = {};
  let checked = 0;
  for (const [cnId, artIds] of cnArticles) {
    const cn = cnRecords.get(cnId);
    const arts = artIds.map(id => artRecords.get(id)).filter(Boolean);
    if (!cn || !arts.length) continue;
    checked++;
    for (const e of exprs) {
      const values = arts.map(e.f);
      if (values.some(v => v == null)) continue;
      const sum = values.reduce((s, v) => s + v, 0);
      for (const p of cnProps) {
        if (num(cn[p]) != null && Math.abs(num(cn[p]) - sum) <= 0.01) counter[`${p} = ${e.label}`] = (counter[`${p} = ${e.label}`] || 0) + 1;
      }
    }
  }
  console.log(`\n  amounts: credit note vs the sum of its articles (${checked} credit notes with articles)`);
  console.log(`    credit note amount properties: ${cnProps.join(', ') || '-'} | article line: ${lineProps.join(', ') || '-'} | tax: ${taxProps.join(', ') || '-'}`);
  const top = Object.entries(counter).sort((x, y) => y[1] - x[1]).slice(0, 8);
  if (!top.length) console.log('    (no combination matches)');
  for (const [k, n] of top) console.log(`    ${k}: ${n}/${checked}`);
  return cnProps;
}

async function checkInvoiceCreditTotals(cnInvoices, cnRecords, cnProps) {
  const byInvoice = new Map();  // invoice id → credit note ids
  for (const [cnId, invIds] of cnInvoices) for (const inv of invIds) byInvoice.set(inv, [...(byInvoice.get(inv) || []), cnId]);
  if (!byInvoice.size) return;
  const invoices = await readAll(INVOICE, [...byInvoice.keys()],
    ['invoice_id', 'amount', 'amount_a_eur', 'currency', 'status', 'credit_note_amount_eur', 'credit_note_date']);

  const status = {};
  let withField = 0;
  const counter = {};
  for (const [invId, cnIds] of byInvoice) {
    const inv = invoices.get(invId);
    if (!inv) continue;
    status[inv.status || '-'] = (status[inv.status || '-'] || 0) + 1;
    if (num(inv.credit_note_amount_eur) == null) continue;
    withField++;
    for (const p of cnProps) {
      const sum = cnIds.reduce((s, id) => s + (num(cnRecords.get(id)?.[p]) || 0), 0);
      if (Math.abs(sum - num(inv.credit_note_amount_eur)) <= 0.01) counter[p] = (counter[p] || 0) + 1;
    }
  }
  const multi = [...byInvoice.values()].filter(v => v.length > 1).length;
  console.log(`\n  invoices of those credit notes: ${byInvoice.size} | with more than one credit note: ${multi} | ` +
    `status: ${Object.entries(status).map(([k, n]) => `${k}: ${n}`).join(', ')}`);
  console.log(`    invoice credit_note_amount_eur filled: ${withField}/${byInvoice.size}; equals the sum of its credit notes' …`);
  for (const p of cnProps) console.log(`      ${p}: ${counter[p] || 0}/${withField}`);
}


async function main() {
  console.log('HubSpot credit notes audit (read-only)...');
  try {
    for (const obj of [CREDIT_NOTE, CREDIT_ARTICLE]) {
      const r = await hs(`/crm/v3/objects/${obj.id}?limit=1`);
      console.log(`  ${obj.label} ${obj.id}: ${r.ok ? 'accessible' : `not accessible (${r.status}: ${String(r.data.message || '').slice(0, 150)})`}`);
      if (!r.ok) { process.exitCode = 1; return; }
    }

    // ── 1. Properties and fill rate
    const cnSample = await auditObject(CREDIT_NOTE);
    const artSample = await auditObject(CREDIT_ARTICLE);
    if (!cnSample || !artSample) { process.exitCode = 1; return; }
    const cnDefs = await propertyDefs(CREDIT_NOTE.id);
    const artDefs = await propertyDefs(CREDIT_ARTICLE.id);

    // ── 2. Associations
    const cnIds = [...cnSample.keys()].slice(0, PAIRS_SAMPLE);
    console.log(`\n================ associations ================`);
    console.log(`  of ${cnIds.length} credit notes:`);
    await associations(CREDIT_NOTE.id, 'companies', cnIds, 'companies');
    const cnInvoices = await associations(CREDIT_NOTE.id, INVOICE, cnIds, `invoices ${INVOICE}`);
    const cnArticles = await associations(CREDIT_NOTE.id, CREDIT_ARTICLE.id, cnIds, `credit note articles ${CREDIT_ARTICLE.id}`);
    await associations(CREDIT_NOTE.id, INVOICE_ARTICLE, cnIds, `invoice articles ${INVOICE_ARTICLE}`);
    await associations(CREDIT_NOTE.id, 'deals', cnIds, 'deals');
    await associations(CREDIT_NOTE.id, 'contacts', cnIds, 'contacts');

    const artIds = [...artSample.keys()].slice(0, PAIRS_SAMPLE);
    console.log(`  of ${artIds.length} credit note articles:`);
    const artCreditNotes = await associations(CREDIT_ARTICLE.id, CREDIT_NOTE.id, artIds, `credit notes ${CREDIT_NOTE.id}`);
    await associations(CREDIT_ARTICLE.id, INVOICE, artIds, `invoices ${INVOICE}`);
    const artInvoiceArticles = await associations(CREDIT_ARTICLE.id, INVOICE_ARTICLE, artIds, `invoice articles ${INVOICE_ARTICLE}`);

    // ── 3. Link properties
    console.log(`\n================ link properties ================`);
    const invoiceDefs = await propertyDefs(INVOICE);
    const invoiceArticleDefs = await propertyDefs(INVOICE_ARTICLE);

    const cnAllIds = [...new Set([...cnIds, ...[...artCreditNotes.values()].flat()])];
    const cnRecords = await readAll(CREDIT_NOTE.id, cnAllIds, cnDefs.map(p => p.name));
    const artAllIds = [...new Set([...artIds, ...[...cnArticles.values()].flat()])];
    const artRecords = await readAll(CREDIT_ARTICLE.id, artAllIds, artDefs.map(p => p.name));
    const invIds = [...new Set([...cnInvoices.values()].flat())];
    const invRecords = await readAll(INVOICE, invIds, invoiceDefs.map(p => p.name));

    const pairs = (m) => [...m].flatMap(([from, tos]) => tos.map(to => [from, to]));
    matchProperties(pairs(cnInvoices), cnRecords, invRecords, 'credit_note', 'invoice');
    matchProperties(pairs(artCreditNotes), artRecords, cnRecords, 'cn_article', 'credit_note');
    if (artInvoiceArticles.size) {
      const iaIds = [...new Set([...artInvoiceArticles.values()].flat())];
      const iaRecords = await readAll(INVOICE_ARTICLE, iaIds, invoiceArticleDefs.map(p => p.name));
      matchProperties(pairs(artInvoiceArticles), artRecords, iaRecords, 'cn_article', 'invoice_article');
    }

    // Text properties holding invoice numbers (works even without associations)
    for (const [label, sample] of [['credit_note', cnSample], ['cn_article', artSample]]) {
      const counter = {};
      for (const rec of sample.values()) for (const [k, v] of Object.entries(rec)) if (/^INV-\d+/.test(String(v || ''))) counter[k] = (counter[k] || 0) + 1;
      const found = Object.entries(counter).map(([k, n]) => `${k}: ${n}/${sample.size}`).join(', ');
      console.log(`    ${label} properties with INV-… values: ${found || 'none'}`);
    }

    // ── 4. Amounts
    console.log(`\n================ amounts ================`);
    const cnProps = checkAmounts(cnArticles, cnRecords, artRecords, cnDefs, artDefs);
    await checkInvoiceCreditTotals(cnInvoices, cnRecords, cnProps);

    // ── 5. One real example: the first credit note with articles and an invoice
    console.log(`\n================ example ================`);
    const exampleId = cnIds.find(id => cnArticles.has(id) && cnInvoices.has(id)) || cnIds.find(id => cnArticles.has(id)) || cnIds[0];
    printRecord(`credit note ${exampleId}`, cnRecords.get(exampleId) || {});
    for (const id of cnArticles.get(exampleId) || []) printRecord(`credit note article ${id}`, artRecords.get(id) || {});
    const invId = (cnInvoices.get(exampleId) || [])[0];
    if (invId) {
      printRecord(`invoice ${invId}`, invRecords.get(invId) || {});
      const invArts = await associations(INVOICE, INVOICE_ARTICLE, [invId], 'articles of that invoice');
      const iaIds = invArts.get(invId) || [];
      const ia = await readAll(INVOICE_ARTICLE, iaIds, invoiceArticleDefs.map(p => p.name));
      for (const id of iaIds) printRecord(`invoice article ${id}`, ia.get(id) || {});
    } else {
      console.log('\n  (that credit note has no associated invoice)');
    }
  } catch (error) {
    console.error(`Fatal error: ${error.message}`);
    process.exitCode = 1;
  } finally {
    process.exit(process.exitCode || 0);
  }
}

main();
