// scripts/backfillManualSubscriptions.js
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env.development') });

const { pool } = require('../db/db');
const { log } = require('../utils/logger');

const OPS_API_URL = 'https://api.neuronup.com/ops/subscriptions';
const OPS_API_TOKEN = '6p48*mf65TH$cU**';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

async function upsertSubscription(subscription) {
  const client = await pool.connect();

  try {
    const backendId = subscription.id;
    const nupCenterId = subscription.center.id;
    const status = subscription.status;
    const canceledAt = subscription.canceledAt || null;

    // Transformar features: de [{identifier, kind, quantity}] a ["identifier"]
    const features = subscription.features
      ? subscription.features.map(f => f.identifier)
      : [];

    // Verificar si existe
    const checkQuery = `SELECT subscription_id FROM subscriptions WHERE subscription_id = $1`;
    const checkResult = await client.query(checkQuery, [backendId]);

    if (checkResult.rowCount === 0) {
      // INSERT
      const insertQuery = `
        INSERT INTO subscriptions (
          subscription_id,
          backend_subscription_id,
          nup_center_id,
          source,
          current_state,
          cancelation_date,
          hubspot_sync_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;

      await client.query(insertQuery, [
        backendId,
        backendId,
        nupCenterId,
        'backend',
        status,
        canceledAt,
        'PENDING'
      ]);

      log('INFO', 'BACKFILL-MANUAL', `Inserted: ${backendId}`);

    } else {
      // UPDATE
      const updateQuery = `
        UPDATE subscriptions SET
          backend_subscription_id = $1,
          nup_center_id = $2,
          current_state = $3,
          cancelation_date = $4,
          hubspot_sync_status = 'PENDING',
          updated_at = CURRENT_TIMESTAMP
        WHERE subscription_id = $5
      `;

      await client.query(updateQuery, [
        backendId,
        nupCenterId,
        status,
        canceledAt,
        backendId
      ]);

      log('INFO', 'BACKFILL-MANUAL', `Updated: ${backendId}`);
    }

    // Actualizar features en subscription_items
    if (features.length > 0) {
      const updateItemsQuery = `
        UPDATE subscription_items 
        SET 
          features = $1,
          updated_at = CURRENT_TIMESTAMP
        WHERE subscription_id = $2
      `;

      await client.query(updateItemsQuery, [
        JSON.stringify(features),
        backendId
      ]);

      log('INFO', 'BACKFILL-MANUAL', `Features updated for ${backendId}: ${JSON.stringify(features)}`);
    }

  } catch (error) {
    log('ERROR', 'BACKFILL-MANUAL', `Error upserting ${subscription.id}: ${error.message}`);
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  let page = 1;
  let totalProcessed = 0;

  log('INFO', 'BACKFILL-MANUAL', 'Starting Manual backfill with features...');

  try {
    while (true) {
      log('INFO', 'BACKFILL-MANUAL', `Fetching page ${page}...`);
      const subscriptions = await fetchPage(page);

      if (!subscriptions || subscriptions.length === 0) {
        log('INFO', 'BACKFILL-MANUAL', `No more data. Stopping at page ${page - 1}`);
        break;
      }

      log('INFO', 'BACKFILL-MANUAL', `Processing ${subscriptions.length} subscriptions from page ${page}`);

      for (const sub of subscriptions) {
        await upsertSubscription(sub);
        totalProcessed++;
        await delay(50);
      }

      page++;
    }

    log('INFO', 'BACKFILL-MANUAL', `✅ Backfill manual completed. Total processed: ${totalProcessed}`);

  } catch (error) {
    log('ERROR', 'BACKFILL-MANUAL', `Fatal error: ${error.message}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();