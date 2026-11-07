// ────── Stripe: subscription → database rows ──────────────────────────────────────────────────────────────────────────────────────
// ─── One mapping for the webhook (subscriptionServices.processSubscriptionUpsert) and the backfill (scripts/fullBackfillStripe.js).
// ─── Before, each one had its own copy and they ended up writing different data for the same subscription.
// ─── Pure function: no Stripe or database calls. The caller fetches the subscription (with default_payment_method expanded),
// ─── the customer (with invoice_settings.default_payment_method expanded), the Ops API data and the product names.
// ─── Invoice and money fields (pending_payment, last_invoice_*, number_of_renovations) are not mapped here: they will come
// ─── from Zoho. is_forever is not mapped either: Postgres computes it (migration 005).
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

function formatStripeDate(unixTimestamp) {
  if (!unixTimestamp) return null;
  return new Date(unixTimestamp * 1000).toISOString();
}

// ────── State ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// ─── trialing → trial. Cancelled before the end of the trial → trial_canceled. The rest, Stripe's status as is.
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function mapState(sub) {
  if (sub.status === 'canceled' && sub.trial_end && sub.canceled_at && sub.canceled_at <= sub.trial_end) {
    return 'trial_canceled';
  }
  if (sub.status === 'trialing') return 'trial';
  return sub.status;
}

// ────── End date ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// ─── canceled → ended_at, the real end. Stripe keeps cancel_at when a subscription with a scheduled cancellation is then
// ───   cancelled right away (support, refund, failed payments), so cancel_at can be a date that never happened
// ───   (24 cancelled subscriptions with a future end date on prod, 07/11/2026).
// ─── Otherwise cancel_at, the scheduled end (also set by Stripe when cancel_at_period_end is true). No end → null.
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function mapEndDate(sub) {
  if (sub.status === 'canceled') return formatStripeDate(sub.ended_at || sub.cancel_at);
  return formatStripeDate(sub.cancel_at);
}

// ────── Payment method ────────────────────────────────────────────────────────────────────────────────────────────────────────────
// ─── The subscription's default payment method, else the customer's default one. Only when expanded (objects).
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function mapPaymentMethodType(sub, customer) {
  const subPm = sub.default_payment_method;
  if (subPm && typeof subPm === 'object') return subPm.type || null;
  const customerPm = customer?.invoice_settings?.default_payment_method;
  if (customerPm && typeof customerPm === 'object') return customerPm.type || null;
  return null;
}

// ────── Items ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// ─── Since Stripe API 2025-03 the billing period lives on the item (current_period_start/end), not on the subscription.
// ─── The item status is the parent's, except past_due/unpaid/incomplete with the period still running: then 'active'
// ───   (they keep access while Stripe retries the payment).
// ─── billing_interval: null when the price is not recurring (no invented 'month').
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function mapItems(sub, { state, nupCenterId, features, productNames, now }) {
  const precancelledDate = formatStripeDate(sub.canceled_at);

  return sub.items.data.map(item => {
    const productId = typeof item.price.product === 'object' ? item.price.product.id : item.price.product;
    const periodEnd = formatStripeDate(item.current_period_end);

    let status = state;
    if (['past_due', 'unpaid', 'incomplete'].includes(state) && periodEnd && new Date(periodEnd) > now) {
      status = 'active';
    }

    return {
      item_id: item.id,
      subscription_id: sub.id,
      nup_center_id: nupCenterId,
      product_id: productId,
      product_name: productNames.get(productId) || 'Producto Desconocido',
      billing_interval: item.price.recurring?.interval || null,
      payment_frequency: item.price.recurring?.interval_count || 1,
      unit_price: item.price.unit_amount ? item.price.unit_amount / 100 : null,
      features: JSON.stringify(features),
      quantity: item.quantity,
      start_date: formatStripeDate(item.created),
      current_period_start: formatStripeDate(item.current_period_start),
      current_period_end: periodEnd,
      status,
      precancelled_date: precancelledDate,
    };
  });
}

// ────── Subscription ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
// ─── ops: { backendSubscriptionId, nupCenterId, features, status } from the Ops API, or null if it doesn't know it yet.
// ─── productNames: Map product id → name.
// ─── revoked_access_date = the end date: on Stripe the access to the app is revoked when the subscription is cancelled.
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function mapStripeSubscription(sub, { customer = null, ops = null, productNames = new Map(), now = new Date() } = {}) {
  const state = mapState(sub);
  const endDate = mapEndDate(sub);
  const nupCenterId = ops?.nupCenterId != null ? String(ops.nupCenterId) : null;
  const features = ops?.features || [];

  const subscription = {
    subscription_id: sub.id,
    nup_center_id: nupCenterId,
    backend_subscription_id: ops?.backendSubscriptionId != null ? String(ops.backendSubscriptionId) : null,
    segment: sub.metadata?.segment || null,
    center_name: (customer && typeof customer === 'object') ? (customer.name || customer.description || null) : null,
    start_date: formatStripeDate(sub.start_date),
    precancelled_date: formatStripeDate(sub.canceled_at),
    cancelation_date: endDate,
    revoked_access_date: endDate,
    current_state: state,
    currency: sub.currency ? sub.currency.toUpperCase() : null,
    source: 'stripe',
    payment_method_type: mapPaymentMethodType(sub, customer),
    access: ops?.status || null,
  };

  const items = mapItems(sub, { state, nupCenterId, features, productNames, now });

  return { subscription, items };
}

module.exports = { mapStripeSubscription, formatStripeDate };
