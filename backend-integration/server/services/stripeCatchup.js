// ────── Stripe: catch-up of subscription events ─────────────────────────────────────────────────────────────────────────────────────
// ─── The webhook answers 200 before processing, so if the processing fails (Stripe, Ops API or the database down) Stripe doesn't
// ─── retry and the subscription would stay out of date. This catch-up closes that gap without the full backfill (~37k):
// ─── it asks Stripe for the customer.subscription.* events of the last `hours` (Events API, kept 30 days), keeps the latest
// ─── one per subscription and processes it again with the webhook's own code (processSubscriptionUpsert).
// ─── processSubscriptionUpsert always reads the subscription live from Stripe, so reprocessing one that was fine changes nothing.
// ─── Used by the nightly cron in server.js and by scripts/stripeCatchup.js (manual run).
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { processSubscriptionUpsert } = require('./subscriptionServices');
const { log } = require('../utils/logger');

const SUBSCRIPTION_EVENTS = ['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'];

async function runStripeCatchup({ hours = 26 } = {}) {
  const since = Math.floor(Date.now() / 1000) - hours * 3600;
  log('INFO', 'STRIPE-CATCHUP', `Reprocessing subscription events of the last ${hours} h...`);

  // Latest event per subscription (the list comes newest first)
  const latest = new Map();
  for await (const event of stripe.events.list({ types: SUBSCRIPTION_EVENTS, created: { gte: since }, limit: 100 })) {
    const subId = event.data?.object?.id;
    if (subId && !latest.has(subId)) latest.set(subId, event);
  }

  let ok = 0;
  let failed = 0;
  for (const [subId, event] of latest) {
    try {
      await processSubscriptionUpsert(event);
      ok++;
    } catch (error) {
      failed++;
      log('ERROR', 'STRIPE-CATCHUP', `Failed ${subId} (${event.id}): ${error.message}`);
    }
  }

  log('INFO', 'STRIPE-CATCHUP', `Done. Subscriptions: ${latest.size} | OK: ${ok} | Failed: ${failed}`);
  return { subscriptions: latest.size, ok, failed };
}

module.exports = { runStripeCatchup };
