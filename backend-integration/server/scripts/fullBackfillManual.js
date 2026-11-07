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
// ─── canceledAt (Ops API) is also used, as it is the only explicit cancellation signal for manual subs:
// ───   canceledAt set and no period end → not alive (before it was taken as alive and forever).
// ───   canceledAt set and period still running → alive until the period end, canceledAt goes to precancelled_date.
// ───   not cancelled and period already ended → not alive, as before (the real state is unknown, dates are often outdated).
// ─── canceledAt can also be outdated, so the inferred current_state of manual subs is never 100% reliable.
// ─── Then to infer the state, if its alive we asign trial or active.
// ─── If its not alive, we asign trial_canceled or canceled.
// ─── is_forever is computed by Postgres (migration 005): alive, not cancelled and without period end, as before.
// ─── The features are extracted from the data of OPS API.
// ─── Then we get the subscription id, the nup_center_id and the start date (Ops createdAt).
// ─── We do the upsert of the subscription and the items( including the access status).
// ─── The upserts only write when something changed (ON CONFLICT ... WHERE ... IS DISTINCT FROM). Only then the subscription
// ─── goes back to hubspot_sync_status 'PENDING': before, every run (3 a day) marked all of them and the HubSpot cron
// ─── re-synced the ~5200 manual subscriptions each time.
// ─── revoked_access_date stays empty: on manual subs the access is not revoked at the period end, and the Ops API has no
// ─── real end date yet.
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function upsertManualSubscription(data) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const periodEnd = data.currentPeriodEnd ? new Date(data.currentPeriodEnd) : null;
    const canceledAt = data.canceledAt ? new Date(data.canceledAt) : null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let isAlive = true;
    if (periodEnd && periodEnd < today) isAlive = false;
    if (canceledAt && !periodEnd) isAlive = false;

    // Cancelled but still inside the paid period: keeps access, the cancellation is pending (like Stripe's precancel)
    const precancelledDate = canceledAt && isAlive ? canceledAt : null;
    // When it ended: the period end, or the cancellation date if there is no period end
    const cancelationDate = isAlive ? periodEnd : (periodEnd || canceledAt);

    let finalState = '';
    if (isAlive) {
      finalState = data.status === 'trial' ? 'trial' : 'active';
    } else {
      finalState = data.status === 'trial' ? 'trial_canceled' : 'canceled';
    }

    const features = data.features
      ? data.features.map(f => f.identifier)
      : [];

    const subscriptionId = String(data.id);
    const nupCenterId = String(data.center.id);
    const startDate = data.createdAt ? new Date(data.createdAt) : null;

    const subResult = await client.query(
      `INSERT INTO subscriptions (
         subscription_id, nup_center_id, backend_subscription_id,
         start_date, precancelled_date, cancelation_date, current_state,
         source, access, hubspot_sync_status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (subscription_id) DO UPDATE SET
         nup_center_id = EXCLUDED.nup_center_id,
         backend_subscription_id = EXCLUDED.backend_subscription_id,
         start_date = EXCLUDED.start_date,
         precancelled_date = EXCLUDED.precancelled_date,
         cancelation_date = EXCLUDED.cancelation_date,
         current_state = EXCLUDED.current_state,
         access = COALESCE(EXCLUDED.access, subscriptions.access),
         updated_at = CURRENT_TIMESTAMP
       WHERE (subscriptions.nup_center_id, subscriptions.backend_subscription_id, subscriptions.start_date,
              subscriptions.precancelled_date, subscriptions.cancelation_date, subscriptions.current_state, subscriptions.access)
         IS DISTINCT FROM
             (EXCLUDED.nup_center_id, EXCLUDED.backend_subscription_id, EXCLUDED.start_date,
              EXCLUDED.precancelled_date, EXCLUDED.cancelation_date, EXCLUDED.current_state,
              COALESCE(EXCLUDED.access, subscriptions.access))`,
      [
        subscriptionId,
        nupCenterId,
        subscriptionId,
        startDate,
        precancelledDate,
        cancelationDate,
        finalState,
        'backend',
        data.status || null,
        'PENDING'
      ]
    );

    const itemId = `man_item_${subscriptionId}`;

    const itemResult = await client.query(
      `INSERT INTO subscription_items (
         item_id, subscription_id, nup_center_id,
         product_name, features, quantity, start_date, current_period_end,
         status, precancelled_date
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (item_id) DO UPDATE SET
         nup_center_id = EXCLUDED.nup_center_id,
         features = EXCLUDED.features,
         start_date = EXCLUDED.start_date,
         current_period_end = EXCLUDED.current_period_end,
         status = EXCLUDED.status,
         precancelled_date = EXCLUDED.precancelled_date,
         updated_at = CURRENT_TIMESTAMP
       WHERE (subscription_items.nup_center_id, subscription_items.features, subscription_items.start_date,
              subscription_items.current_period_end, subscription_items.status, subscription_items.precancelled_date)
         IS DISTINCT FROM
             (EXCLUDED.nup_center_id, EXCLUDED.features, EXCLUDED.start_date,
              EXCLUDED.current_period_end, EXCLUDED.status, EXCLUDED.precancelled_date)`,
      [
        itemId,
        subscriptionId,
        nupCenterId,
        'Producto Manual',
        JSON.stringify(features),
        1,
        startDate,
        periodEnd,
        finalState,
        precancelledDate
      ]
    );

    // Inserted or changed (subscription or item) → it has to go to HubSpot again
    const changed = subResult.rowCount > 0 || itemResult.rowCount > 0;
    if (changed) {
      // Except an ended one that was already skipped (never reached HubSpot) and is still not live
      await client.query(
        `UPDATE subscriptions SET hubspot_sync_status = 'PENDING'
         WHERE subscription_id = $1
           AND NOT (hubspot_sync_status = 'SKIPPED_STATE' AND current_state NOT IN ('active', 'trial', 'trialing', 'past_due'))`,
        [subscriptionId]
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



// ────── Manual: Subscriptions that migrated to Stripe ─────────────────────────────────────────────────────────────────────────────────────
// ─── NeuronUP is moving the manual subscriptions to Stripe little by little. The Ops API keeps the same record and changes its
// ─── kind from manual to stripe, so it no longer comes in the kind=manual pages and its row stayed 'active' forever.
// ─── The Stripe row (written by the webhook) carries that Ops id in backend_subscription_id, so the link is in the database:
// ───   migrated_to_subscription_id = the Stripe subscription (the registry, set for every migrated one).
// ───   If the manual row was still live, it is closed: canceled (trial_canceled if it was a trial), ended when the Stripe
// ───   subscription started, and back to 'PENDING' for HubSpot. Its item follows the same state.
// ─── If a manual id has several Stripe rows, the most recent one.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function closeMigratedManualSubs() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(`
      UPDATE subscriptions m
      SET migrated_to_subscription_id = s.subscription_id,
          current_state = CASE WHEN m.current_state = 'active' THEN 'canceled'
                               WHEN m.current_state = 'trial' THEN 'trial_canceled'
                               ELSE m.current_state END,
          cancelation_date = CASE WHEN m.current_state IN ('active', 'trial')
                                  THEN COALESCE(s.start_date, NOW()) ELSE m.cancelation_date END,
          precancelled_date = CASE WHEN m.current_state IN ('active', 'trial') THEN NULL ELSE m.precancelled_date END,
          hubspot_sync_status = CASE WHEN m.current_state IN ('active', 'trial') THEN 'PENDING' ELSE m.hubspot_sync_status END,
          updated_at = CURRENT_TIMESTAMP
      FROM (
        SELECT DISTINCT ON (backend_subscription_id) backend_subscription_id, subscription_id, start_date
        FROM subscriptions
        WHERE source = 'stripe' AND backend_subscription_id IS NOT NULL
        ORDER BY backend_subscription_id, start_date DESC NULLS LAST
      ) s
      WHERE m.source = 'backend'
        AND s.backend_subscription_id = m.subscription_id
        AND (m.migrated_to_subscription_id IS DISTINCT FROM s.subscription_id OR m.current_state IN ('active', 'trial'))
      RETURNING m.subscription_id, m.current_state
    `);

    if (rows.length > 0) {
      await client.query(
        `UPDATE subscription_items i SET status = s.current_state, precancelled_date = NULL, updated_at = CURRENT_TIMESTAMP
         FROM subscriptions s
         WHERE s.subscription_id = i.subscription_id AND s.subscription_id = ANY($1) AND i.status IS DISTINCT FROM s.current_state`,
        [rows.map(r => r.subscription_id)]
      );
    }

    await client.query('COMMIT');
    return rows.length;
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
// ─── Then closeMigratedManualSubs registers (and closes) the manual subscriptions that moved to Stripe.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function main() {
  let page = 1;
  let totalProcessed = 0;
  let changedCount = 0;
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
          if (await upsertManualSubscription(sub)) changedCount++;
          totalProcessed++;
        } catch (error) {
          log('ERROR', 'SYNC-MANUAL', `Error on ${sub.id}: ${error.message}`);
          errorCount++;
        }
        await delay(50);
      }

      page++;
    }

    const migrated = await closeMigratedManualSubs();
    log('INFO', 'SYNC-MANUAL', `Done. Success: ${totalProcessed} | Changed: ${changedCount} | Migrated to Stripe (updated): ${migrated} | Errors: ${errorCount}`);

  } catch (error) {
    log('ERROR', 'SYNC-MANUAL', `Fatal error: ${error.message}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();