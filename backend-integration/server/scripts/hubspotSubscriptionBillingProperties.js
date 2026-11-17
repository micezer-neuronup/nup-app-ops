// ────── HubSpot: billing properties of the subscription object ───────────────────────────────────────────────────────────────────────
// ─── The HubSpot sync (services/hubspotServices.js) sends the billing fields of each subscription (migration 012). They have to exist as
// ─── properties of our subscription object (2-203896755, hubspotServices.js ACCOUNT_SUB_OBJECT_ID). This lists which ones exist and,
// ─── only with --apply, creates the missing ones (in the group of the existing 'status' property). It never changes an existing one.
// ─── It also prints the existing properties whose name looks related (invoice, pago, pending, renov, paid...), in case one of ours
// ─── already exists with another name: then the name is changed in the sync instead of creating a duplicate.
// ─── Run: docker exec server-michael node server/scripts/hubspotSubscriptionBillingProperties.js [--apply]
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const path = require('path');
const dotenv = require('dotenv');

const envFile = process.env.NODE_ENV === 'production' ? '../.env.production' : '../.env.development';
dotenv.config({ path: path.resolve(__dirname, envFile) });

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const OBJECT_ID = '2-203896755';
const APPLY = process.argv.includes('--apply');
const RELATED = /invoice|factura|pago|payment|pending|renov|paid|billing|facturaci/i;

const options = (pairs) => pairs.map(([value, label], i) => ({ value, label, displayOrder: i }));

// The properties the sync sends (name = HubSpot internal name)
const PROPERTIES = [
  { name: 'pending_payment', label: 'Pago pendiente', type: 'bool', fieldType: 'booleancheckbox',
    description: 'El centro tiene facturas enviadas, vencidas o pagadas en parte (Zoho)',
    options: options([['true', 'Sí'], ['false', 'No']]) },
  { name: 'last_invoice_date', label: 'Fecha última factura', type: 'date', fieldType: 'date',
    description: 'Fecha de la última factura válida del centro (Zoho; sin anuladas ni abonadas)' },
  { name: 'last_invoice_amount_eur', label: 'Importe última factura (EUR sin IVA)', type: 'number', fieldType: 'number',
    description: 'Importe en EUR, sin IVA, de la última factura válida del centro (Zoho)' },
  { name: 'last_invoice_status', label: 'Estado última factura', type: 'enumeration', fieldType: 'select',
    description: 'Estado de la última factura válida del centro (Zoho)',
    options: options([['paid', 'Pagada'], ['sent', 'Enviada'], ['overdue', 'Vencida'], ['partially_paid', 'Pagada en parte'],
                      ['refunded', 'Reembolsada'], ['other', 'Otro']]) },
  { name: 'number_of_renovations', label: 'Número de renovaciones', type: 'number', fieldType: 'number',
    description: 'Facturas de renovación del centro (categoría RR-Renovación, Zoho)' },
  { name: 'paid_until', label: 'Pagado hasta', type: 'date', fieldType: 'date',
    description: 'Último día pagado de un plan de NeuronUP según las facturas (Zoho). No cambia el estado de la suscripción' },
  { name: 'billing_status', label: 'Estado de facturación', type: 'enumeration', fieldType: 'select',
    description: 'Estado de facturación del centro según las facturas de Zoho (vista billing.center_billing)',
    options: options([['up_to_date', 'Al día'], ['renewal_due', 'Renovación pendiente (< 30 días)'], ['expired', 'Caducada'],
                      ['no_platform', 'Sin plan de plataforma'], ['no_service_dates', 'Sin fechas de servicio'],
                      ['no_invoice', 'Sin facturas']]) },
];

const hs = async (url, body) => {
  const response = await fetch(`https://api.hubapi.com${url}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${HUBSPOT_TOKEN}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { ok: response.ok, status: response.status, data: await response.json().catch(() => ({})) };
};

async function main() {
  console.log(`HubSpot subscription billing properties (${APPLY ? 'APPLY: missing ones are created' : 'dry run: nothing is created'})...`);
  try {
    const r = await hs(`/crm/v3/properties/${OBJECT_ID}`);
    if (!r.ok) throw new Error(`properties of ${OBJECT_ID} (${r.status}): ${String(r.data.message || '').slice(0, 200)}`);
    const existing = new Map(r.data.results.map(p => [p.name, p]));
    const groupName = existing.get('status')?.groupName || r.data.results[0]?.groupName;
    console.log(`  ${existing.size} properties in the object | group for the new ones: ${groupName}`);

    const ours = new Set(PROPERTIES.map(p => p.name));
    const related = [...existing.values()].filter(p => RELATED.test(p.name) && !ours.has(p.name));
    if (related.length) {
      console.log(`  Existing properties with a related name (check none is one of ours with another name):`);
      for (const p of related) console.log(`    ${p.name} | ${p.label} | ${p.type}`);
    }

    let missing = 0;
    for (const prop of PROPERTIES) {
      const found = existing.get(prop.name);
      if (found) {
        const sameType = found.type === prop.type;
        console.log(`  ${prop.name}: exists (${found.type}${sameType ? '' : `, EXPECTED ${prop.type}: check it`})`);
        continue;
      }
      missing++;
      if (!APPLY) { console.log(`  ${prop.name}: MISSING (${prop.type} / ${prop.fieldType}) "${prop.label}"`); continue; }
      const created = await hs(`/crm/v3/properties/${OBJECT_ID}`, { ...prop, groupName });
      console.log(`  ${prop.name}: ${created.ok ? 'created' : `NOT created (${created.status}: ${String(created.data.message || '').slice(0, 200)})`}`);
      if (!created.ok) process.exitCode = 1;
    }
    if (!APPLY && missing) console.log(`\n${missing} missing. Run again with --apply to create them.`);
  } catch (error) {
    console.error(`Fatal error: ${error.message}`);
    process.exitCode = 1;
  } finally {
    process.exit(process.exitCode || 0);
  }
}

main();
