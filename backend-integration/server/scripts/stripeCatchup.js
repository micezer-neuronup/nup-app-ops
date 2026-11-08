// ────── Stripe: manual run of the catch-up ──────────────────────────────────────────────────────────────────────────────────────────
// ─── Same as the nightly cron in server.js (services/stripeCatchup.js): reprocesses the subscriptions with Stripe events in the
// ─── last N hours (default 26; Stripe keeps events 30 days, so at most 720).
// ─── processSubscriptionUpsert starts the HubSpot sync without waiting for it, and this process exits at the end: a subscription
// ─── whose sync was cut stays 'PENDING' and the HubSpot cron (or syncPendingToHubspot.js) sends it.
// ─── Run: docker exec server-michael node server/scripts/stripeCatchup.js [hours]
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const path = require('path');
const dotenv = require('dotenv');

const envFile = process.env.NODE_ENV === 'production' ? '../.env.production' : '../.env.development';
dotenv.config({ path: path.resolve(__dirname, envFile) });

const { pool } = require('../db/db');
const { log } = require('../utils/logger');
const { runStripeCatchup } = require('../services/stripeCatchup');

const hours = Math.min(Number(process.argv[2]) || 26, 720);

runStripeCatchup({ hours })
  .catch(error => {
    log('ERROR', 'STRIPE-CATCHUP', `Fatal error: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    // A few seconds for the HubSpot syncs already started
    await new Promise(resolve => setTimeout(resolve, 10000));
    await pool.end();
    process.exit(process.exitCode || 0);
  });
