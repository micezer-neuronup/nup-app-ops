// ────── HubSpot: manual run of the pending subscriptions sync ───────────────────────────────────────────────────────────────────────
// ─── Same job as the "every 6 h" cron in server.js (processPendingHubspotSyncs + syncSingleSubscriptionToHubspot), to run it
// ─── by hand after a backfill instead of waiting for the cron.
// ─── Don't run it while the cron job is running (the server's isHubspotJobRunning flag doesn't see this process): the same
// ─── subscriptions would be sent twice. The cron runs at minute 0 every 6 hours.
// ─── Run: docker exec server-michael node server/scripts/syncPendingToHubspot.js (in the container /app/scripts is the Python one)
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const path = require('path');
const dotenv = require('dotenv');

const envFile = process.env.NODE_ENV === 'production' ? '../.env.production' : '../.env.development';
dotenv.config({ path: path.resolve(__dirname, envFile) });

const { pool } = require('../db/db');
const { log } = require('../utils/logger');
const { processPendingHubspotSyncs } = require('../db/dbSubscriptions');
const { syncSingleSubscriptionToHubspot } = require('../services/hubspotServices');

async function main() {
  log('INFO', 'HUBSPOT-SYNC', 'Manual run of the pending subscriptions sync...');
  try {
    const result = await processPendingHubspotSyncs(syncSingleSubscriptionToHubspot);
    log('INFO', 'HUBSPOT-SYNC', `Done: ${JSON.stringify(result)}`);
  } catch (error) {
    log('ERROR', 'HUBSPOT-SYNC', `Fatal error: ${error.message}`);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

main();
