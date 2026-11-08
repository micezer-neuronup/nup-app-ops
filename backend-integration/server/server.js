const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); 
const dotenv = require('dotenv');
const path = require('path');
const cron = require('node-cron');
const { spawn } = require('child_process');
const { log } = require("./utils/logger");



// ────── Initialization: env ────────────────────────────────────────────────────────────────────────────────────────────────────
// ─── For development
// ─── For local run with development env: NODE_ENV=development node server.js
// ─── For local run with production env: NODE_ENV=production node server.js
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const envFile = process.env.NODE_ENV === 'production'
  ? '../.env.production'
  : '../.env.development';

const envPath = path.resolve(__dirname, envFile);
dotenv.config({ path: envPath });


// ────── Import: queries and services ───────────────────────────────────────────────────────────────────────────────────────────
// ─── Database conenction is already imported in dbQueries
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const { getAnalyticsByCenterId, 
        updateFeatureRequestStatus,
        updateOpportunityStatus,
        getAllOpportunities,
        getOpportunityUsage,
        assignUpsellOpportunity } = require('./db/dbAnalytics');

const { getSubscriptionByCenterId, 
        processPendingHubspotSyncs  } = require('./db/dbSubscriptions');

const { processSubscriptionUpsert,
        processInvoiceEvent} = require('./services/subscriptionServices');

const { runStripeCatchup } = require('./services/stripeCatchup');
const { runCentersSync } = require('./services/centersSync');

const { syncSingleSubscriptionToHubspot, 
        resolveCompanyData, 
        refreshAllActiveCaches, 
        getAllOwners } = require('./services/hubspotServices');


// ────── Initialization: Script paths ───────────────────────────────────────────────────────────────────────────────────────────
// ─── We define the path of the python scripts called by the cron jobs.
// ─── 1. Daily events fetch script for Amplitude.
// ─── 2. Assesment opportunity detector script.
// ─── 3. Daily assesment activity detector script.
// ─── 4. Manual subscriptions sync script.
// ─── 5. Zoho scripts to aggregate nup_center_id to invoices. (Zoho cron job is currently deactivated)
// ─── 6. Sessions opportunity detector script.
// ─── 7. HubSpot reconciliation script (subscriptions in HubSpot aligned with the database).
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const daily_stats_path = path.join(__dirname, '../scripts/amplitude/daily_events.py');
const opportunity_detector_path = path.join(__dirname, '../scripts/opportunities/assessment/opportunity_detector.py');
const opportunity_daily_activity_path = path.join(__dirname, '../scripts/opportunities/assessment/daily_usage_detector.py');
const manualSyncScriptPath = path.join(__dirname, 'scripts/fullBackfillManual.js');
const sessions_detector_path = path.join(__dirname, '../scripts/opportunities/sessions/sessions_detector.py');
const hubspotReconcileScriptPath = path.join(__dirname, 'scripts/reconcileHubspotStatuses.js');
// const zoho_script_Path = path.join(__dirname, '../python-jobs/zoho_daily_worker.py');




// ────── Initialization: server  ────────────────────────────────────────────────────────────────────────────────────────────────────
// ─── We create the express app
// ─── We add cors 
// ─── We define the server port
// ─── We define the Husbpot token from the enviroment
// ─── We define the Stripe endpoint secret
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const app = express();
app.use(cors({ origin: true, credentials: true }));


const PORT = process.env.PORT;
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET; 
const N8N_WEBHOOK_URL = 'https://n8n-ops.neuronup.com/webhook/16157f8e-6176-4766-ac36-8b6ea4e19627';


// ────── Webhook Routes ────────────────────────────────────────────────────────────────────────────────────────────────────────────
// ─── Requires Raw Body so we define it before the json global middleware
// ─── This way Stripe can read the raw buffer to securely verify the signature
// ─── We manage webhooks to track subscriptions state and historic data
// ─── Webhook is open to the internet, we secure it using the Webhook Secret
// ─── Stripe knows this Webhook Secret as weel as the server
// ─── Stripe generates webhooks and hashes it with the Webhook Secret
// ─── This creates a unique signature which this endpoint recieves
// ─── Stripe in the server does the same process using the request.body and Webhook Secret
// ─── If the result is not the same, its rejeted, it cant be trsuted
// ─── If the result is the same, then its from Stripe, it can be trusted
// ─── 200 OK reply to stripe must not wait for the await, as it will be counted as failed.
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

app.post(
  '/apiwebhooks/stripe', 
  express.raw({ type: 'application/json' }), 
  async (request, response) => {
    const sig = request.headers['stripe-signature'];
    let event;

    try {
      event = stripe.webhooks.constructEvent(request.body, sig, endpointSecret);
    } catch (err) {
      log("ERROR", "STRIPE", `Webhook signature verification failed: ${err.message}`);
      return response.status(400).send(`Webhook Error: ${err.message}`);
    }

    log("INFO", "STRIPE", `Webhook Received: ${event.type} (ID: ${event.id})`);

    log("INFO", "STRIPE", `Forwarding webhook to n8n (event: ${event.id})`);
    fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Stripe-Signature': sig
      },
      body: request.body
    })
      .then(res => {
        log("INFO", "STRIPE", `n8n responded with status ${res.status} (event: ${event.id})`);
      })
      .catch(err => {
        log("WARN", "STRIPE", `Failed to forward webhook to n8n: ${err.message} (event: ${event.id})`);
      });

    // Signature verified: reply 200 now. The processing (Stripe, Ops API, database, HubSpot) can take minutes
    // (fetchSubscriptionFromOps may go through up to 400 pages) and Stripe marks the delivery as failed if it waits.
    // A processing error no longer makes Stripe retry: it is logged, and the next fullBackfillStripe.js run repairs the data.
    response.status(200).send();

    try {
      switch (event.type) {

        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted':
          await processSubscriptionUpsert(event);
          break;

        case 'invoice.paid':
        case 'invoice.payment_failed':
          await processInvoiceEvent(event);
          break;

        default:
          log("INFO", "STRIPE", `Unhandled event type: ${event.type}`);
      }

    } catch (error) {
      if (error.code === '23505') {
        log("INFO", "STRIPE", `Duplicate webhook ignored. Event ID: ${event.id}`);
        return;
      }

      log("ERROR", "STRIPE", `Webhook processing failed (already answered 200). Event ${event.id} (${event.type}): ${error.message}`);
    }
});

// ────── Global Middleware: JSON Parsers ───────────────────────────
// ─── We apply JSON parsing. This will apply to all routes defined below
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
app.use(express.json());





// ────── Endpoint: get company data ──────────────────────────────────────────────────────────────────
// ─── The endpoint recieves the husbpot objectId and objectTypeId from the dashboard
// ─── Then the company data is fetched calling resolveCompanyData()
// ─── Once obtained, the nup_center_id is used to query the analytics calling getAnalyticsByCenterId and getSubscriptionByCenterId.
// ─── The analytics data is appended to the company data and sent back to the dashboard
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
app.options('/api/company-data', cors());
app.get('/api/company-data', async (req, res) => {
  const { objectId, objectTypeId } = req.query;
  if (!objectId || !objectTypeId) {
    return res.status(400).json({ error: 'objectId and objectTypeId are required' });
  }

  try {
    const companyData = await resolveCompanyData(objectId, objectTypeId);
    const nupCenterId = companyData.properties?.nup_center_id;
    
    let analyticsData = null;
    let subscriptionData = null;
    let upsellOpportunities = [];

    if (nupCenterId) {
      const [analyticsResult, subscriptionResult] = await Promise.all([
        getAnalyticsByCenterId(nupCenterId),
        getSubscriptionByCenterId(nupCenterId)
      ]);

      if (analyticsResult && analyticsResult.error) {
        log("WARN", "API", "Analytics DB down", { error: analyticsResult.error });
      } else {
        analyticsData = analyticsResult;

        upsellOpportunities = analyticsResult?.opportunities || [];
      }

      if (subscriptionResult && subscriptionResult.error) {
        log("WARN", "API", "Subscription DB down", { error: subscriptionResult.error });
      } else {
        subscriptionData = subscriptionResult;
      }
    }

    res.json({
      ...companyData,
      analytics: analyticsData,
      subscription: subscriptionData,
      upsellOpportunities: upsellOpportunities
    });

  } catch (err) {
    log("ERROR", "API", "Error in /api/company-data", { error: err.message });
    res.status(404).json({ error: err.message });
  }
});






// ────── Endpoint: get assesment opportunities data ──────────────────────────────────────────────────────────────────
// ─── The endpoint calls the fucntion getAllOpportunities from the dbAnalytics file.
// ─── Called by opportunity dashboard.
// ─── ?product= filters by module (assessments, sessions). Without it, every product is returned.
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
app.get('/api/opportunities', async (req, res) => {
  try {
    // ?product=assessments | sessions: each module of the dashboard only gets its own opportunities
    const opportunities = await getAllOpportunities({ product: req.query.product });
    res.json(opportunities);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



// ────── Endpoint: get opportunity usage ──────────────────────────────────────────────────────────────────
// ─── The endpoint calls the fucntion getOpportunityUsage from the dbAnalytics file.
// ─── Returns the tests per day of the last 60 days for the activity chart of the modal.
// ─── Called by opportunity dashboard.
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
app.get('/api/opportunities/:id/usage', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Invalid opportunity id' });
  }

  try {
    const usage = await getOpportunityUsage(id);
    res.json(usage);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



// ────── Endpoint: get hubspot owners ──────────────────────────────────────────────────────────────────
// ─── The endpoint calls the fucntion getAllOwners from the hubspotServices file.
// ─── Called by opportunity dashboard.
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
app.get('/api/hubspot/owners', async (req, res) => {
  try {
    const owners = await getAllOwners();
    res.json(owners);
  } catch (error) {
    console.error('Error fetching owners:', error);
    res.status(500).json({ error: error.message });
  }
});




// ────── Endpoint: post upsell signe ──────────────────────────────────────────────────────────────────
// ─── The endpoint calls the fucntion assignUpsellOpportunity from the hubspotServices file.
// ─── Called by opportunity dashboard.
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
app.post('/api/commercial-opportunities/:id/assign-upsell', async (req, res) => {
  const { id } = req.params;
  const { upsellObject, upsellOwnerId, upsellOwnerName } = req.body;

  try {
    const result = await assignUpsellOpportunity(id, {
      upsellObject,
      upsellOwnerId,
      upsellOwnerName,
    });
    res.json(result);
  } catch (error) {
    console.error('Error assigning upsell opportunity:', error);
    res.status(500).json({ error: error.message });
  }
});


// ────── Endpoint: feature requests ──────────────────────────────────────────────────────────────────
// ─── The endpoint recieves the husbpot objectId and objectTypeId from the dashboard
// ─── Then the company data is fetched calling resolveCompanyData()
// ─── Once obtained, the nup_center_id is used to query the nalytics calling getAnalyticsByCenterId
// ─── The analytics data is appended to the company data and sent back to the dashboard
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
app.options('/api/feature-requests/:id', cors());
app.patch('/api/feature-requests/:id', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  log("INFO", "API", "PATCH /api/feature-requests/:id", { id, status });

  if (!status || (status !== 'pending' && status !== 'completed')) {
    log("WARN", "API", "Invalid status received", { id, status });
    return res.status(400).json({ error: "Status must be 'pending' or 'completed'" });
  }

  try {
    log("INFO", "DB", "Updating feature request status", { id, status });

    const updatedRequest = await updateFeatureRequestStatus(id, status);

    if (!updatedRequest) {
      log("WARN", "DB", "Feature request not found", { id });
      return res.status(404).json({ error: "Feature request wasnt found" });
    }

    if (updatedRequest.error) {
      log("ERROR", "DB", "Failed to update feature request", {
        id,
        error: updatedRequest.error,
      });
      return res.status(500).json({ error: updatedRequest.error });
    }

    log("INFO", "DB", "Feature request updated successfully", { id, status });

    res.json({ success: true, data: updatedRequest });

  } catch (err) {
    log("ERROR", "API", "Unhandled error in PATCH /api/feature-requests/:id", {
      id,
      error: err.message,
    });

    res.status(500).json({ error: err.message });
  }
});


app.patch('/api/commercial-opportunities/:id', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  
  // Validar que el estado sea válido
  const validStatuses = ['pending', 'completed']; // solo usamos esos
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Allowed: ' + validStatuses.join(', ') });
  }
  
  try {

    const result = await updateOpportunityStatus(id, status);
    
    if (!result || result.error) {
      return res.status(404).json({ error: result?.error || 'Opportunity not found' });
    }
    
    res.json(result);
  } catch (error) {
    console.error("❌ Error updating opportunity:", error);
    res.status(500).json({ error: error.message });
  }
});


// ────── Cron job: Amplitude events fetch ──────────────────────────────
// ─── Cron job that runs everyday at 6 in the morning
// ─── The pyProcess lines capture the logs to add them to app.log
// ─── Timezone discrepancy was solved with TZ=Europe/Madrid on env files
// ───────────────────────────────────────────────────────────────────────────
cron.schedule('0 6 * * *', () => {
    
  log("INFO", "CRON", "Starting Amplitude fetch job...");

  const pyProcess = spawn('python3', ['-u', daily_stats_path]);

  pyProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        log("INFO", "CRON", line.trim());
      }
    });
  });

  pyProcess.stderr.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        log("ERROR", "CRON", line.trim());
      }
    });
  });

  pyProcess.on('close', (code) => {
    if (code === 0) {
      log("INFO", "CRON", "Python script finished successfully.");
    } else {
      log("WARN", "CRON", `Python script exited with code ${code}`);
    }
  });
});





// ────── Cron job: HubSpot Fallback Sync ────────────────────────────────────
// ─── Wakes up every 6 hours
// ─── Lock system to prevent parallel executions
// ───────────────────────────────────────────────────────────────────────────

let isHubspotJobRunning = false;

cron.schedule('0 */6 * * *', async () => {

  if (isHubspotJobRunning) {
    log(
      "WARN",
      "CRON",
      "Previous HubSpot job is still running. Skipping this execution to avoid duplicates."
    );
    return;
  }

  isHubspotJobRunning = true;
  log("INFO", "CRON", "Starting HubSpot recovery job");

  try {

    const result = await processPendingHubspotSyncs(syncSingleSubscriptionToHubspot);

    if (result.message) {
      log("INFO", "CRON", "HubSpot sync completed", { message: result.message });
    } else {
      log("INFO", "CRON", "HubSpot recovery job completed", {
        successCount: result.successCount,
        errorCount: result.errorCount,
      });
    }

  } catch (error) {
    log("ERROR", "CRON", "Critical failure during HubSpot recovery job", {
      error: error.message,
    });
  } finally {
    isHubspotJobRunning = false;
  }
});


cron.schedule('0 6 * * 1', () => { 
  log("INFO", "CRON", "Starting opportunity detection job...");

  const pyProcess = spawn('python3', ['-u', opportunity_detector_path]);

  pyProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        log("INFO", "CRON_OPPORTUNITY", line.trim());
      }
    });
  });

  pyProcess.stderr.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        log("ERROR", "CRON_OPPORTUNITY", line.trim());
      }
    });
  });

  pyProcess.on('close', (code) => {
    if (code === 0) {
      log("INFO", "CRON_OPPORTUNITY", "Opportunity detector finished successfully.");
    } else {
      log("WARN", "CRON_OPPORTUNITY", `Opportunity detector exited with code ${code}`);
    }
  });
});


// ────── Cron job: Sessions opportunity detection ─────────────────────────────
// ─── Weekly, Monday 06:30 (after the Assessment detector, so both don't fetch the Ops API at the same time).
// ─── Runs scripts/opportunities/sessions/sessions_detector.py (product 'sessions').
// ───────────────────────────────────────────────────────────────────────────
cron.schedule('30 6 * * 1', () => {
  log("INFO", "CRON", "Starting sessions opportunity detection job...");

  const pyProcess = spawn('python3', ['-u', sessions_detector_path]);

  pyProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        log("INFO", "CRON_SESSIONS", line.trim());
      }
    });
  });

  pyProcess.stderr.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        log("ERROR", "CRON_SESSIONS", line.trim());
      }
    });
  });

  pyProcess.on('close', (code) => {
    if (code === 0) {
      log("INFO", "CRON_SESSIONS", "Sessions detector finished successfully.");
    } else {
      log("WARN", "CRON_SESSIONS", `Sessions detector exited with code ${code}`);
    }
  });
});


cron.schedule('0 7 * * *', () => {
    
  log("INFO", "CRON", "Starting daily usage detection job...");

  const pyProcess = spawn('python3', ['-u', opportunity_daily_activity_path]);

  pyProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        log("INFO", "CRON_DAILY", line.trim());
      }
    });
  });

  pyProcess.stderr.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        log("ERROR", "CRON_DAILY", line.trim());
      }
    });
  });

  pyProcess.on('close', (code) => {
    if (code === 0) {
      log("INFO", "CRON_DAILY", "Daily usage detector finished successfully.");
    } else {
      log("WARN", "CRON_DAILY", `Daily usage detector exited with code ${code}`);
    }
  });
});


// Cron job: cada 4 horas
cron.schedule('0 */4 * * *', async () => {
  log('INFO', 'CRON', 'Starting HubSpot cache refresh...');
  try {
    await refreshAllActiveCaches();
    log('INFO', 'CRON', 'HubSpot cache refresh completed.');
  } catch (error) {
    log('ERROR', 'CRON', `Cache refresh failed: ${error.message}`);
  }
});


// ────── Cron job: Sync manual subscriptions ─────────────────────────────
// ─── Runs 3 times a day: 9:00, 12:00, 15:00
// ─── Fetches all manual subscriptions from Ops API and upserts them
// ───────────────────────────────────────────────────────────────────────────
let isManualSyncRunning = false;

cron.schedule('0 9,12,16 * * *', () => {
  if (isManualSyncRunning) {
    log("WARN", "CRON", "Previous manual sync is still running. Skipping.");
    return;
  }

  isManualSyncRunning = true;
  log("INFO", "CRON", "Starting manual subscriptions sync...");

  const child = spawn('node', [manualSyncScriptPath], {
    cwd: __dirname,
    env: process.env
  });

  child.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        log("INFO", "CRON-MANUAL", line.trim());
      }
    });
  });

  child.stderr.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        log("ERROR", "CRON-MANUAL", line.trim());
      }
    });
  });

  child.on('close', (code) => {
    if (code === 0) {
      log("INFO", "CRON-MANUAL", "Manual sync finished successfully.");
    } else {
      log("WARN", "CRON-MANUAL", `Manual sync exited with code ${code}`);
    }
    isManualSyncRunning = false;
  });
});


// ────── Cron job: Stripe catch-up ─────────────────────────────────────────────────────────────────────────
// ─── Runs every night at 03:00. The webhook answers 200 before processing, so a failed processing is not retried by Stripe:
// ─── this reprocesses the subscriptions with Stripe events in the last 26 h (services/stripeCatchup.js).
// ─── Manual run: node server/scripts/stripeCatchup.js [hours]
// ───────────────────────────────────────────────────────────────────────────
let isStripeCatchupRunning = false;

cron.schedule('0 3 * * *', async () => {
  if (isStripeCatchupRunning) {
    log("WARN", "CRON", "Previous Stripe catch-up is still running. Skipping.");
    return;
  }
  isStripeCatchupRunning = true;
  try {
    await runStripeCatchup({ hours: 26 });
  } catch (error) {
    log("ERROR", "CRON", `Stripe catch-up failed: ${error.message}`);
  } finally {
    isStripeCatchupRunning = false;
  }
});


// ────── Cron job: Centers sync ─────────────────────────────────────────────────────────────────────────
// ─── Runs every day at 05:00 (before the 06:00 HubSpot sync, which reads the company from centers).
// ─── HubSpot companies with nup_center_id + Stripe / Zoho IDs from the Ops API into centers (services/centersSync.js).
// ─── Manual run: node server/scripts/syncCenters.js
// ───────────────────────────────────────────────────────────────────────────
let isCentersSyncRunning = false;

cron.schedule('0 5 * * *', async () => {
  if (isCentersSyncRunning) {
    log("WARN", "CRON", "Previous centers sync is still running. Skipping.");
    return;
  }
  isCentersSyncRunning = true;
  try {
    await runCentersSync();
  } catch (error) {
    log("ERROR", "CRON", `Centers sync failed (nothing written): ${error.message}`);
  } finally {
    isCentersSyncRunning = false;
  }
});


// ────── Cron job: HubSpot reconciliation ────────────────────────────────────────────────────────────────────
// ─── Runs every Sunday at 04:00. The database is the source of truth: every HubSpot subscription that doesn't match it, and
// ─── every live one missing in HubSpot, is marked 'PENDING' (scripts/reconcileHubspotStatuses.js --apply).
// ─── The 06:00 HubSpot cron then sends them.
// ───────────────────────────────────────────────────────────────────────────
cron.schedule('0 4 * * 0', () => {
  log("INFO", "CRON", "Starting HubSpot reconciliation...");

  const child = spawn('node', [hubspotReconcileScriptPath, '--apply'], {
    cwd: __dirname,
    env: process.env
  });

  child.stdout.on('data', (data) => {
    data.toString().split('\n').forEach(line => {
      if (line.trim()) log("INFO", "CRON-RECONCILE", line.trim());
    });
  });

  child.stderr.on('data', (data) => {
    data.toString().split('\n').forEach(line => {
      if (line.trim()) log("ERROR", "CRON-RECONCILE", line.trim());
    });
  });

  child.on('close', (code) => {
    log(code === 0 ? "INFO" : "WARN", "CRON-RECONCILE", `HubSpot reconciliation exited with code ${code}`);
  });
});

// ────── Cron job: update invoices from Zoho ──────────────────────────────
// ─── Cron job that runs everyday at 2 in the morning
// ─── The pyProcess lines capture the logs to add them to app.log
// ─── Timezone discrepancy was solved with TZ=Europe/Madrid on env files
// ───────────────────────────────────────────────────────────────────────────
/*
cron.schedule('0 2 * * *', () => {

    log("INFO", "CRON", "Starting Zoho backfill job");
    
    const pyProcess = spawn('python3', ['-u', zoho_script_Path]); 
    
    pyProcess.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        lines.forEach(line => {
            if (line.trim()) {
              log("INFO", "CRON", line.trim());
            }
        });
    });

    pyProcess.stderr.on('data', (data) => {
        const lines = data.toString().split('\n');
        lines.forEach(line => {
            if (line.trim()) {
              log("ERROR", "CRON", line.trim());
            }
        });
    });

    pyProcess.on('close', (code) => {
        if (code === 0) {
            log("INFO", "CRON", `Zoho backfill script finished with exit code ${code}`);
        } else {
            log("WARN", "CRON", `Zoho backfill script exited with code ${code}`);
        }
    });
});
*/

app.listen(PORT, () => {
  
  log("INFO", "SERVER", `Server started`, { url: `http://localhost:${PORT}` });

});














































