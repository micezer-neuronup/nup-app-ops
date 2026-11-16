// ────── Billing: manual run of the sync ─────────────────────────────────────────────────────────────────────────────────────────────
// ─── Same as the daily cron in server.js (services/billingSync.js): Zoho invoices and articles from HubSpot into the billing schema.
// ─── Incremental by default (records modified since the last good run); --full reads everything and marks the deleted ones.
// ─── The first run is always full (~70k invoices + ~73k articles, ~10 min). Only writes what changed.
// ─── Run: docker exec server-michael node server/scripts/syncBilling.js [--full]
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const path = require('path');
const dotenv = require('dotenv');

const envFile = process.env.NODE_ENV === 'production' ? '../.env.production' : '../.env.development';
dotenv.config({ path: path.resolve(__dirname, envFile) });

const { pool } = require('../db/db');
const { log } = require('../utils/logger');
const { runBillingSync } = require('../services/billingSync');

runBillingSync({ full: process.argv.includes('--full') })
  .catch(error => {
    log('ERROR', 'BILLING-SYNC', `Fatal error: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
    process.exit(process.exitCode || 0);
  });
