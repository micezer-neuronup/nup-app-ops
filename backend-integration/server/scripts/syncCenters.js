// ────── Centers: manual run of the sync ─────────────────────────────────────────────────────────────────────────────────────────────
// ─── Same as the daily cron in server.js (services/centersSync.js): HubSpot companies with nup_center_id + Stripe / Zoho IDs of
// ─── the Ops API into the centers table. Only writes what changed. ~5 min (HubSpot search + 386 Ops API pages).
// ─── Run: docker exec server-michael node server/scripts/syncCenters.js
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const path = require('path');
const dotenv = require('dotenv');

const envFile = process.env.NODE_ENV === 'production' ? '../.env.production' : '../.env.development';
dotenv.config({ path: path.resolve(__dirname, envFile) });

const { pool } = require('../db/db');
const { log } = require('../utils/logger');
const { runCentersSync } = require('../services/centersSync');

runCentersSync()
  .catch(error => {
    log('ERROR', 'CENTERS-SYNC', `Fatal error (nothing written): ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
    process.exit(process.exitCode || 0);
  });
