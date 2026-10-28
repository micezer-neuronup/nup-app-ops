// ────── Documented ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const path = require('path');
const dotenv = require('dotenv');

const envFile = process.env.NODE_ENV === 'production' ? '../.env.production' : '../.env.development';
const envPath = path.resolve(__dirname, envFile);
dotenv.config({ path: envPath });

const { pool } = require('../db/db');
const { log } = require('../utils/logger');


// ────── OPS API Credentials ───────────────────────────────────────────────────────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const OPS_API_URL = 'https://api.neuronup.com/ops/subscriptions';
const OPS_API_TOKEN = process.env.OPS_API_TOKEN;


// ────── Delay to not saturate OPS API ─────────────────────────────────────────────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));


// ────── Manual: Fetch OPS API for manual subscriptions ────────────────────────────────────────────────────────────────────────────
// ─── We fetch the manual subscriptions from OPS API.
// ─── Recieves the page as parameter.
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function fetchPage(page) {
  const url = `${OPS_API_URL}?page=${page}&kind=manual`;
  const response = await fetch(url, {
    headers: {
      'X-Api-Token': OPS_API_TOKEN,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} - ${response.statusText}`);
  }

  return response.json();
}



// ────── Manual: Upsert manual subscriptions ────────────────────────────────────────────────────────────────────────────────────────
// ─── We upsert manual subscription data using OPS API.
// ─── Recieves the subscription data as parameter.
// ─── The state is inferred by checking the currentPeriodEnd compared to today to know if its alive.
// ─── Then to infer the state, if its alive we asign trial or active.
// ─── If its not alive, we asign trial_canceled or canceled.
// ─── Then if the subscription is alive, the state is active and the priod end isnt null, we set is_forever to true.
// ─── The features are extracted from the data of OPS API.
// ─── Then we get the subscription id and the nup_center_id.
// ─── We do the upsert of the subscription and the items( including the access status).
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function upsertManualSubscription(data) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const periodEnd = data.currentPeriodEnd ? new Date(data.currentPeriodEnd) : null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let isAlive = true;
    if (periodEnd && periodEnd < today) isAlive = false;

    let finalState = '';
    if (isAlive) {
      finalState = data.status === 'trial' ? 'trial' : 'active';
    } else {
      finalState = data.status === 'trial' ? 'trial_canceled' : 'canceled';
    }

    const is_forever = isAlive && finalState === 'active' && periodEnd === null;

    const features = data.features
      ? data.features.map(f => f.identifier)
      : [];

    const subscriptionId = data.id;
    const nupCenterId = data.center.id;

    await client.query(
      `INSERT INTO subscriptions (
         subscription_id, hubspot_subscription_id, nup_center_id, backend_subscription_id,
         segment, manages_own_payment, center_name, start_date, precancelled_date,
         cancelation_date, revoked_access_date, current_state, currency,
         creation_source, source, payment_method_type, market,
         is_forever, pending_payment, access, hubspot_sync_status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
       ON CONFLICT (subscription_id) DO UPDATE SET
         nup_center_id = EXCLUDED.nup_center_id,
         backend_subscription_id = EXCLUDED.backend_subscription_id,
         cancelation_date = EXCLUDED.cancelation_date,
         current_state = EXCLUDED.current_state,
         is_forever = EXCLUDED.is_forever,
         access = COALESCE(EXCLUDED.access, subscriptions.access),
         hubspot_sync_status = 'PENDING',
         updated_at = CURRENT_TIMESTAMP`,
      [
        subscriptionId,
        null,
        nupCenterId,
        subscriptionId,
        null,
        null,
        null,
        null,
        null,
        periodEnd,
        null,
        finalState,
        null,
        null,
        'backend',
        null,
        null,
        is_forever,
        null,
        data.status || null,
        'PENDING'
      ]
    );

    const itemId = `man_item_${subscriptionId}`;

    await client.query(
      `INSERT INTO subscription_items (
         item_id, hubspot_item_id, subscription_id, nup_center_id,
         product_id, product_name, billing_interval, payment_frequency, unit_price,
         features, quantity, start_date, current_period_start, current_period_end,
         is_forever, status, precancelled_date
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       ON CONFLICT (item_id) DO UPDATE SET
         nup_center_id = EXCLUDED.nup_center_id,
         features = EXCLUDED.features,
         current_period_end = EXCLUDED.current_period_end,
         is_forever = EXCLUDED.is_forever,
         status = EXCLUDED.status,
         updated_at = CURRENT_TIMESTAMP`,
      [
        itemId,
        null,
        subscriptionId,
        nupCenterId,
        null,
        'Producto Manual',
        null,
        null,
        null,
        JSON.stringify(features),
        1,
        null,
        null,
        periodEnd,
        is_forever,
        finalState,
        null
      ]
    );

    await client.query('COMMIT');

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}



// ────── Manual: Main function to fetch and upsert ────────────────────────────────────────────────────────────────────────────────────────
// ─── This function starts the manual sync.
// ─── We start a loop and call the function fetchPage feeding it the pages.
// ─── The loop breaks when the returned data from OPS API is empty, if not the page increments with each loop.
// ─── For each subscription returned from OPS API, we call upsertManualSubscription for it.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function main() {
  let page = 1;
  let totalProcessed = 0;
  let errorCount = 0;

  log('INFO', 'SYNC-MANUAL', 'Starting manual subscriptions sync...');

  try {
    while (true) {
      log('INFO', 'SYNC-MANUAL', `Fetching page ${page}...`);
      const subscriptions = await fetchPage(page);

      if (!subscriptions || subscriptions.length === 0) {
        log('INFO', 'SYNC-MANUAL', `No more data. Stopping at page ${page - 1}`);
        break;
      }

      log('INFO', 'SYNC-MANUAL', `Processing ${subscriptions.length} subscriptions from page ${page}`);

      for (const sub of subscriptions) {
        try {
          await upsertManualSubscription(sub);
          totalProcessed++;
        } catch (error) {
          log('ERROR', 'SYNC-MANUAL', `Error on ${sub.id}: ${error.message}`);
          errorCount++;
        }
        await delay(50);
      }

      page++;
    }

    log('INFO', 'SYNC-MANUAL', `Done. Success: ${totalProcessed} | Errors: ${errorCount}`);

  } catch (error) {
    log('ERROR', 'SYNC-MANUAL', `Fatal error: ${error.message}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();