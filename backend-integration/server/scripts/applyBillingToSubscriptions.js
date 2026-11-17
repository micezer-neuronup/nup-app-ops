// ────── Billing: manual run of the copy of the centre billing into the live subscriptions ─────────────────────────────────────────────
// ─── Same step that runs after each billing sync (db/dbBilling.js applyBillingToSubscriptions): pending_payment, last_invoice_*,
// ─── number_of_renovations, paid_until and billing_status of billing.center_billing into every live subscription of the centre.
// ─── Only writes what changed; those subscriptions go back to 'PENDING' and the 6-hour HubSpot cron (or syncPendingToHubspot.js) sends them.
// ─── --dry-run: nothing written; prints how many would change and up to 10 examples (current values vs new values).
// ─── Run: docker exec server-michael node server/scripts/applyBillingToSubscriptions.js [--dry-run]
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const path = require('path');
const dotenv = require('dotenv');

const envFile = process.env.NODE_ENV === 'production' ? '../.env.production' : '../.env.development';
dotenv.config({ path: path.resolve(__dirname, envFile) });

const { pool } = require('../db/db');
const { log } = require('../utils/logger');
const { applyBillingToSubscriptions } = require('../db/dbBilling');

const dryRun = process.argv.includes('--dry-run');

applyBillingToSubscriptions({ dryRun })
  .then(({ changed, examples }) => {
    log('INFO', 'BILLING-APPLY', `${dryRun ? 'DRY RUN, nothing written. Would change' : 'Subscriptions updated'}: ${changed}`);
    if (examples?.length) {
      console.log('subscription | source | centre | current (pending, last date, last EUR, last status, renewals, paid until, status) | new');
      for (const e of examples) console.log(`  ${e.subscription_id} | ${e.source} | ${e.nup_center_id} | ${e.current_values} | ${e.new_values}`);
    }
  })
  .catch(error => {
    log('ERROR', 'BILLING-APPLY', `Fatal error (nothing written): ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
    process.exit(process.exitCode || 0);
  });
