// ────── HubSpot: billing properties of a subscription ───────────────────────────────────────────────────────────────────────────────
// ─── The billing fields of core.subscriptions (migration 012, written only by applyBillingToSubscriptions) as properties of our HubSpot
// ─── subscription object. Shared by the sync (hubspotServices.js), sync_all_to_hubspot.js and reconcileHubspotStatuses.js, so the
// ─── three send and compare the same values. The properties are created by scripts/hubspotSubscriptionBillingProperties.js.
// ─── Only subscriptions already filled from the invoices (billing_status not null) send them: the rest still hold old Stripe values
// ─── (e.g. last_invoice_status 'open') that are not options of the HubSpot property and would make the whole upsert fail.
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0');

// A Postgres 'date' comes as a Date at local midnight: toISOString() would give the day before (UTC). Local parts instead.
const formatHsDay = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  const d = new Date(value);
  return isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function subscriptionBillingProperties(sub) {
  if (sub.billing_status == null) return {};
  return {
    pending_payment: sub.pending_payment == null ? '' : String(sub.pending_payment),
    last_invoice_date: formatHsDay(sub.last_invoice_date),
    last_invoice_amount_eur: sub.last_invoice_amount == null ? '' : String(sub.last_invoice_amount),
    last_invoice_status: sub.last_invoice_status || '',
    number_of_renovations: sub.number_of_renovations == null ? '' : String(sub.number_of_renovations),
    paid_until: formatHsDay(sub.paid_until),
    billing_status: sub.billing_status,
  };
}

module.exports = { subscriptionBillingProperties, formatHsDay };
