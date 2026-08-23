const express = require('express');
const cors = require('cors');
//const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); 
const dotenv = require('dotenv');
const path = require('path');
const cron = require('node-cron');
const { spawn } = require('child_process');
const { log } = require("./utils/logger");



// ────── Initialization: env ────────────────────────────────────────────────────
// ─── For development
// ─── For local run with development env: NODE_ENV=development node server.js
// ─── For local run with production env: NODE_ENV=production node server.js
// ───────────────────────────────────────────────────────────────────────────────
const envFile = process.env.NODE_ENV === 'production'
  ? '../.env.production'
  : '../.env.development';

const envPath = path.resolve(__dirname, envFile);
dotenv.config({ path: envPath });


// ────── Import: queries and services ────────────────────────────────────
// ─── Database conenction is already imported in dbQueries
// ────────────────────────────────────────────────────────────────────────
const { getAnalyticsByCenterId, updateFeatureRequestStatus,updateOpportunityStatus,getAllOpportunities,createTaskForOpportunity } = require('./db/dbAnalytics');
const { getSubscriptionByCenterId, processPendingHubspotSyncs  } = require('./db/dbSubscriptions');
const { processSubscriptionUpsert, processInvoiceEvent} = require('./services/subscriptionServices');
const { syncSingleSubscriptionToHubspot, resolveCompanyData, refreshAllActiveCaches  } = require('./services/hubspotServices');


// ────── Initialization: Script paths ───────────────────────────────────
// ─── We define the path of the python scripts called by cron jobs
// ─── Zoho cron job is currently deactivated
// ───────────────────────────────────────────────────────────────────────
const scriptPath = path.join(__dirname, '../python-jobs/amplitude/script.py');
const quincenalScriptPath = path.join(__dirname, '../python-jobs/amplitude/quincenal_detector.py');
const dailyScriptPath = path.join(__dirname, '../python-jobs/amplitude/daily_usage_detector.py');

// const zoho_script_Path = path.join(__dirname, '../python-jobs/zoho_daily_worker.py');


// ────── Initialization: server  ─────────────────────────────────────────────
// ─── We create the express app
// ─── We add cors 
// ─── We define the server port
// ─── We define the Husbpot token from the enviroment
// ─── We define the Stripe endpoint secret
// ────────────────────────────────────────────────────────────────────────────
const app = express();
app.use(cors({ origin: true, credentials: true }));


const PORT = process.env.PORT;
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET; 


// ────── Webhook Routes ──────────────────────────────────────────────────────
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
// ────────────────────────────────────────────────────────────────────────────

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

    try {
      switch (event.type) {
        
        // ─── CREATION / UPDATES / CANCELLATIONS ─────────────────────────────────────────
        case 'customer.subscription.created':
        case 'customer.subscription.updated': 
        case 'customer.subscription.deleted': 
          await processSubscriptionUpsert(event);
          break;

        // ─── PAYMENTS SUCCESS/FAIL ─────────────────────────────────────────────────────
        case 'invoice.paid':
        case 'invoice.payment_failed': 
          await processInvoiceEvent(event);
          break;

        // ─── UNHANDLED EVENTS ──────────────────────────────────────────────────────────
        default:
          log("INFO", "STRIPE", `Unhandled event type: ${event.type}`);
      }

      // ─── Success Acknowledgment back to Stripe ───────────────────────────────────────
      response.status(200).send();

    } catch (error) {
      if (error.code === '23505') {
        log("INFO", "STRIPE", `Duplicate webhook ignored. Event ID: ${event.id}`);
        return response.status(200).send(); 
      }

      log("ERROR", "STRIPE", `Webhook processing failed. Error: ${error.message}`);
      return response.status(500).send('Internal Server Error');
    }
});


// ────── Global Middleware: JSON Parsers ───────────────────────────
// ─── We apply JSON parsing. This will apply to all routes defined below
// ────────────────────────────────────────────────────────────────────────────
app.use(express.json());





// ────── Endpoint: get company data ──────────────────────────────────────────────────────────────────
// ─── The endpoint recieves the husbpot objectId and objectTypeId from the dashboard
// ─── Then the company data is fetched calling resolveCompanyData()
// ─── Once obtained, the nup_center_id is used to query the nalytics calling getAnalyticsByCenterId
// ─── The analytics data is appended to the company data and sent back to the dashboard
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
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
      // Solo llamamos a analytics y subscription (sin función separada de upsell)
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

    // Enviamos la respuesta incluyendo las oportunidades
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

// server.js
app.get('/api/opportunities', async (req, res) => {
  try {
    // Obtener oportunidades sin enriquecer con HubSpot
    const opportunities = await getAllOpportunities({}); // Sin enriquecer
    res.json(opportunities);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



app.post('/api/commercial-opportunities/:id/create-task', async (req, res) => {
  const { id } = req.params;
  const { subject, body } = req.body;

  try {
    const result = await createTaskForOpportunity(id, { subject, body });
    res.json(result);
  } catch (error) {
    console.error('Error creating task:', error);
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

  const pyProcess = spawn('python3', ['-u', scriptPath]);

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
  log("INFO", "CRON", "Starting quincenal opportunity detection job...");

  const pyProcess = spawn('python3', ['-u', quincenalScriptPath]);

  pyProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        log("INFO", "CRON_QUINCENAL", line.trim());
      }
    });
  });

  pyProcess.stderr.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        log("ERROR", "CRON_QUINCENAL", line.trim());
      }
    });
  });

  pyProcess.on('close', (code) => {
    if (code === 0) {
      log("INFO", "CRON_QUINCENAL", "Quincenal detector finished successfully.");
    } else {
      log("WARN", "CRON_QUINCENAL", `Quincenal detector exited with code ${code}`);
    }
  });
});


cron.schedule('0 7 * * *', () => {
    
  log("INFO", "CRON", "Starting daily usage detection job...");

  const pyProcess = spawn('python3', ['-u', dailyScriptPath]);

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














































