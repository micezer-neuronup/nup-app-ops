const path = require('path');
const dotenv = require('dotenv');

const envFile = process.env.NODE_ENV === 'production' ? '../.env.production' : '../.env.development';
const envPath = path.resolve(__dirname, envFile);
dotenv.config({ path: envPath });

const { pool } = require('../db/db');
const { log } = require('../utils/logger');
const { mapStripeSubscription } = require('../services/stripeMapping');


// ────── OPS API, Stripe and HubSpot Credentials ───────────────────────────────────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const OPS_API_URL = 'https://api.neuronup.com/ops/subscriptions';
const OPS_API_TOKEN = process.env.OPS_API_TOKEN;

// ────── Delay to not saturate OPS API ─────────────────────────────────────────────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ────── Stripe: Fetch OPS API for Stripe subscriptions ────────────────────────────────────────────────────────────────────────────
// ─── We fetch the stripe subscriptions from OPS API.
// ─── We break the loop when the response is empty
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function getAllOpsSubscriptions() {

  log('INFO', 'OPS-API', 'Fetching all subscriptions from Ops API...');
  const allSubs = [];
  let page = 1;

  while (true) {
    const url = `${OPS_API_URL}?page=${page}&kind=stripe`;
    const response = await fetch(url, {
      headers: {
        'X-Api-Token': OPS_API_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      log('ERROR', 'OPS-API', `Error fetching page ${page}: ${response.status}`);
      break;
    }

    const subs = await response.json();
    if (!subs || subs.length === 0) break;

    allSubs.push(...subs);
    log('INFO', 'OPS-API', `Fetched page ${page}: ${subs.length} subscriptions`);
    page++;
    await delay(100);
  }

  log('INFO', 'OPS-API', `Total fetched: ${allSubs.length} subscriptions`);
  return allSubs;
}




// ────── Stripe: Find subscription from OPS API by stripe sub id ───────────────────────────────────────────────────────────────────
// ─── Called inside upsertSubscription to get the OPS API data.
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function findOpsSubscription(opsSubs, stripeSubscriptionId) {
  return opsSubs.find(s => s.stripeSubscriptionId === stripeSubscriptionId);
}

// ────── Stripe: Query to Upsert stripe Subscriptions ───────────────────────────────────────────────────────────────────
// ─── We define the query to Upsert the subscription and its items.
// ─── is_forever is not written: Postgres computes it (migration 005).
// ─── nup_center_id / backend_subscription_id keep the stored value when the Ops API doesn't know the subscription (COALESCE),
// ─── and the item's centre is also updated (before, items created without centre never got it).
// ─── hubspot_subscription_id / hubspot_item_id are not touched: the HubSpot sync stores them (saveHubspotIds).
// ─── The upserts only write when something changed (ON CONFLICT ... WHERE ... IS DISTINCT FROM), and only then the subscription
// ─── goes back to hubspot_sync_status 'PENDING'. Before, every run marked the ~37k subscriptions and the HubSpot cron spent
// ─── hours going through them. Returns true if the subscription or any of its items was inserted or changed.
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function upsertSubscription(sub, items) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let changed = false;

    const subResult = await client.query(
      `INSERT INTO subscriptions (
         subscription_id, nup_center_id, backend_subscription_id,
         segment, center_name, start_date, precancelled_date,
         cancelation_date, revoked_access_date, current_state, currency,
         source, payment_method_type, pending_payment, access, hubspot_sync_status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       ON CONFLICT (subscription_id) DO UPDATE SET
         nup_center_id = COALESCE(EXCLUDED.nup_center_id, subscriptions.nup_center_id),
         backend_subscription_id = COALESCE(EXCLUDED.backend_subscription_id, subscriptions.backend_subscription_id),
         center_name = EXCLUDED.center_name,
         start_date = EXCLUDED.start_date,
         precancelled_date = EXCLUDED.precancelled_date,
         cancelation_date = EXCLUDED.cancelation_date,
         revoked_access_date = EXCLUDED.revoked_access_date,
         current_state = EXCLUDED.current_state,
         currency = EXCLUDED.currency,
         payment_method_type = EXCLUDED.payment_method_type,
         access = COALESCE(EXCLUDED.access, subscriptions.access),
         updated_at = CURRENT_TIMESTAMP
       WHERE (subscriptions.nup_center_id, subscriptions.backend_subscription_id, subscriptions.center_name,
              subscriptions.start_date, subscriptions.precancelled_date, subscriptions.cancelation_date,
              subscriptions.revoked_access_date, subscriptions.current_state, subscriptions.currency,
              subscriptions.payment_method_type, subscriptions.access)
         IS DISTINCT FROM
             (COALESCE(EXCLUDED.nup_center_id, subscriptions.nup_center_id),
              COALESCE(EXCLUDED.backend_subscription_id, subscriptions.backend_subscription_id), EXCLUDED.center_name,
              EXCLUDED.start_date, EXCLUDED.precancelled_date, EXCLUDED.cancelation_date,
              EXCLUDED.revoked_access_date, EXCLUDED.current_state, EXCLUDED.currency,
              EXCLUDED.payment_method_type, COALESCE(EXCLUDED.access, subscriptions.access))`,
      [
        sub.subscription_id,
        sub.nup_center_id,
        sub.backend_subscription_id,
        sub.segment,
        sub.center_name,
        sub.start_date,
        sub.precancelled_date,
        sub.cancelation_date,
        sub.revoked_access_date,
        sub.current_state,
        sub.currency,
        'stripe',
        sub.payment_method_type,
        sub.pending_payment,
        sub.access,
        'PENDING'
      ]
    );
    changed = changed || subResult.rowCount > 0;

    if (items && items.length > 0) {
      const currentItemIds = items.map(i => i.item_id);

      // Items no longer in the subscription → canceled (only the ones not already canceled)
      const removedResult = await client.query(
        `UPDATE subscription_items
         SET status = 'canceled', precancelled_date = COALESCE(precancelled_date, CURRENT_DATE), updated_at = CURRENT_TIMESTAMP
         WHERE subscription_id = $1 AND item_id != ALL($2) AND status IS DISTINCT FROM 'canceled'`,
        [sub.subscription_id, currentItemIds]
      );
      changed = changed || removedResult.rowCount > 0;

      for (const item of items) {
        const itemResult = await client.query(
          `INSERT INTO subscription_items (
             item_id, subscription_id, nup_center_id,
             product_id, product_name, billing_interval, payment_frequency, unit_price,
             features, quantity, start_date, current_period_start, current_period_end,
             status, precancelled_date
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
           ON CONFLICT (item_id) DO UPDATE SET
             nup_center_id = COALESCE(EXCLUDED.nup_center_id, subscription_items.nup_center_id),
             product_id = EXCLUDED.product_id,
             product_name = EXCLUDED.product_name,
             billing_interval = EXCLUDED.billing_interval,
             payment_frequency = EXCLUDED.payment_frequency,
             unit_price = EXCLUDED.unit_price,
             features = EXCLUDED.features,
             quantity = EXCLUDED.quantity,
             start_date = EXCLUDED.start_date,
             current_period_start = EXCLUDED.current_period_start,
             current_period_end = EXCLUDED.current_period_end,
             status = EXCLUDED.status,
             precancelled_date = EXCLUDED.precancelled_date,
             updated_at = CURRENT_TIMESTAMP
           WHERE (subscription_items.nup_center_id, subscription_items.product_id, subscription_items.product_name,
                  subscription_items.billing_interval, subscription_items.payment_frequency, subscription_items.unit_price,
                  subscription_items.features, subscription_items.quantity, subscription_items.start_date,
                  subscription_items.current_period_start, subscription_items.current_period_end,
                  subscription_items.status, subscription_items.precancelled_date)
             IS DISTINCT FROM
                 (COALESCE(EXCLUDED.nup_center_id, subscription_items.nup_center_id), EXCLUDED.product_id, EXCLUDED.product_name,
                  EXCLUDED.billing_interval, EXCLUDED.payment_frequency, EXCLUDED.unit_price,
                  EXCLUDED.features, EXCLUDED.quantity, EXCLUDED.start_date,
                  EXCLUDED.current_period_start, EXCLUDED.current_period_end,
                  EXCLUDED.status, EXCLUDED.precancelled_date)`,
          [
            item.item_id,
            sub.subscription_id,
            item.nup_center_id,
            item.product_id,
            item.product_name,
            item.billing_interval,
            item.payment_frequency,
            item.unit_price,
            item.features,
            item.quantity,
            item.start_date,
            item.current_period_start,
            item.current_period_end,
            item.status,
            item.precancelled_date
          ]
        );
        changed = changed || itemResult.rowCount > 0;
      }
    } else {
      const removedResult = await client.query(
        `UPDATE subscription_items
         SET status = 'canceled', precancelled_date = COALESCE(precancelled_date, CURRENT_DATE), updated_at = CURRENT_TIMESTAMP
         WHERE subscription_id = $1 AND status IS DISTINCT FROM 'canceled'`,
        [sub.subscription_id]
      );
      changed = changed || removedResult.rowCount > 0;
    }

    // Inserted or changed → it has to go to HubSpot again. Except an ended one that was already skipped (never reached
    // HubSpot) and is still not live: re-checking it would cost a HubSpot lookup for nothing (~30k old cancelled ones).
    if (changed) {
      await client.query(
        `UPDATE subscriptions SET hubspot_sync_status = 'PENDING'
         WHERE subscription_id = $1
           AND NOT (hubspot_sync_status = 'SKIPPED_STATE' AND current_state NOT IN ('active', 'trial', 'trialing', 'past_due'))`,
        [sub.subscription_id]
      );
    }

    await client.query('COMMIT');
    return changed;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ────── Stripe: Main function to fetch and upsert ──────────────────────────────────────────────────────────────────────
// ─── 
// ───
// ───
// ───
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

async function main() {
  let successCount = 0;
  let changedCount = 0;
  let errorCount = 0;

  log('INFO', 'FULL-BACKFILL', 'Starting FULL Stripe backfill...');

  try {
    // 1. Cargar productos de Stripe
    log('INFO', 'FULL-BACKFILL', 'Loading Stripe products...');
    const productsMap = new Map();
    for await (const prod of stripe.products.list({ limit: 100 })) {
      productsMap.set(prod.id, prod.name);
    }
    log('INFO', 'FULL-BACKFILL', `Loaded ${productsMap.size} products`);

    // 2. Cargar todas las suscripciones de Ops API (con caché)
    const opsSubs = await getAllOpsSubscriptions();

    // 3. Cargar todas las suscripciones de Stripe
    log('INFO', 'FULL-BACKFILL', 'Starting Stripe subscriptions iteration...');
    // default_payment_method expanded so mapStripeSubscription can read its type (as the webhook does)
    const subscriptions = stripe.subscriptions.list({
      status: 'all',
      expand: ['data.customer', 'data.customer.invoice_settings.default_payment_method', 'data.default_payment_method']
    });

    for await (const stripeSub of subscriptions) {
      try {
        // Buscar en Ops API
        const opsSub = findOpsSubscription(opsSubs, stripeSub.id);
        const ops = opsSub ? {
          backendSubscriptionId: opsSub.id,
          nupCenterId: opsSub.center?.id,
          features: opsSub.features ? opsSub.features.map(f => f.identifier) : [],
          status: opsSub.status,
        } : null;

        // Same mapping as the webhook (services/stripeMapping.js)
        const { subscription: payloadSub, items: payloadItems } = mapStripeSubscription(stripeSub, {
          customer: stripeSub.customer,
          ops,
          productNames: productsMap,
        });

        // Invoice fields will come from Zoho. Until then pending_payment is only set here on insert (status-based);
        // on existing rows the backfill doesn't touch it, the webhook keeps it (open invoices)
        payloadSub.pending_payment = ['past_due', 'unpaid', 'incomplete'].includes(stripeSub.status);

        if (await upsertSubscription(payloadSub, payloadItems)) changedCount++;

        successCount++;
        if (successCount % 50 === 0) {
          log('INFO', 'FULL-BACKFILL', `Processed ${successCount} subscriptions (${changedCount} changed)...`);
        }
        await delay(50);

      } catch (rowError) {
        log('ERROR', 'FULL-BACKFILL', `Error on ${stripeSub.id}: ${rowError.message}`);
        errorCount++;
      }
    }

    log('INFO', 'FULL-BACKFILL', `✅ Done. Success: ${successCount} | Changed: ${changedCount} | Errors: ${errorCount}`);

  } catch (error) {
    log('ERROR', 'FULL-BACKFILL', `Fatal error: ${error.message}`);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

main();