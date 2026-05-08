const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); 
const fetch = require('node-fetch');
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


// ────── Import: database connection and queries ───────────────
// ─── Database conenction is already imported in dbQueries
// ──────────────────────────────────────────────────────────────
const { getAnalyticsByCenterId, upsertSubscriptionData} = require('./db/dbQueries');


// ────── Initialization: Script paths ─────────────────────────────
// ─── We define the path of the scripts the cron job calls
// ────────────────────────────────────────────────────────────────
const scriptPath = path.join(__dirname, '../python-jobs/script.py');
const zoho_script_Path = path.join(__dirname, '../python-jobs/zoho_daily_worker.py');


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
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET; 

// ────── Webhook Routes ──────────────────────────────────────────────────────
// ─── Requires Raw Body so we define it before the json global middleware
// ─── This way Stripe can read the raw buffer to securely verify the signature
// ─── We manage webhooks to track subscriptions state and historic data
// ─── Webhooks for subscriptions:
// ────── customer.subscription.created
// ────── customer.subscription.updated
// ────── customer.subscription.deleted
// ─── Webhooks for invoices:
// ────── invoice.paid
// ────── invoice.payment_failed
// ─── Webhook is open to the internet, we secure it using the Webhook Secret
// ─── Stripe knows this Webhook Secret as weel as the server
// ─── Stripe generates webhooks and hashes it with the Webhook Secret
// ─── This creates a unique signature which this endpoint recieves
// ─── Stripe in the server does the same process using the request.body and Webhook Secret
// ─── If the result is not the same, its rejeted, it cant be trsuted
// ─── If the result is the same, then its from Stripe, it can be trusted
// ─── 
// ───
// ───
// ───
// ───
// ────────────────────────────────────────────────────────────────────────────

app.post(
  '/api/webhooks/stripe', 
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
        
        // ─── CREATION & UPDATES ─────────────────────────────────────────
        case 'customer.subscription.created':
        case 'customer.subscription.updated': 
          await processSubscriptionUpsert(event);
          break;

        // ─── CANCELLATIONS ──────────────────────────────────────────────
        case 'customer.subscription.deleted': 
          await processSubscriptionCancellation(event);
          break;

        // ─── PAYMENTS SUCCESS/FAIL ──────────────────────────────────────
        case 'invoice.paid':
        case 'invoice.payment_failed': 
          await processInvoiceEvent(event);
          break;

        // ─── UNHANDLED EVENTS ───────────────────────────────────────────
        default:
          log("INFO", "STRIPE", `🤷‍♂️ Unhandled event type: ${event.type}`);
      }

      // 3. Success Acknowledgment back to Stripe
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


// ────── Function: resolveCompanyData ─────────────────────────────────────────────────────────
// ─── We have 2 object types, company and deal. We define a dictionary with the object types 
// ─── We define a list with all the properties we want to fetch
// ─── If its a company, we do a direct fecth to hubspot and return it
// ─── If its a deal, we fetch the deals associated companies
// ─── The first company that has a nup_center_id is returned
// ────────────────────────────────────────────────────────────────────────────────────────────
async function resolveCompanyData(objectId, objectTypeId) {

  const OBJECT_TYPES = {
    COMPANY: '0-2',
    DEAL: '0-3'
  };

  const companyProperties = [
    'nup_center_id', 'company_specialty__por_definir_', 'activity', 'email', 'region_backend', 'cif',
    'name', 'num_employees', 'num_patients', 'has_extra_professionals',
    'has_assessment', 'has_digital_material__por_definir_', 'nup2go_balance', 'nup2go_patients',
    'last_nup2go_assigment', 'last_nup2go_payment_date', 'last_company_login',
    'subscription_status__por_definir_', 'subscription_kind__por_definir_', 'subscription_current_period_end',
    'all_subscription_days', 'hasExtraMaterial'
  ];

  if (objectTypeId === OBJECT_TYPES.COMPANY) {
    const url = `https://api.hubapi.com/crm/v3/objects/company/${objectId}?properties=${companyProperties.join(',')}`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${HUBSPOT_TOKEN}` } });
    if (!res.ok) throw new Error(`Company fetch failed: ${res.status}`);
    const data = await res.json();
    if (!data.properties?.nup_center_id) throw new Error('Company has no nup_center_id');
    return data;
  }

  if (objectTypeId === OBJECT_TYPES.DEAL) {

    const dealUrl = `https://api.hubapi.com/crm/v3/objects/deals/${objectId}?associations=company`;

    const dealRes = await fetch(dealUrl, { 
    headers: { 'Authorization': `Bearer ${HUBSPOT_TOKEN}` } 
    });

    if (!dealRes.ok) {
      const errorText = await dealRes.text();
      throw new Error(`Failed to fetch deal ${objectId}: ${dealRes.status} ${errorText}`);
    }

    const dealData = await dealRes.json();
    const companyIds = dealData.associations?.companies?.results?.map(r => r.id) || [];

    if (companyIds.length === 0) {
      throw new Error(`Deal ${objectId} has no associated companies`);
    }

    for (const companyId of companyIds) {
      const url = `https://api.hubapi.com/crm/v3/objects/company/${companyId}?properties=nup_center_id,${companyProperties.join(',')}`;
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${HUBSPOT_TOKEN}` } });
    
      if (!res.ok) continue;
    
      const company = await res.json();
      if (company.properties?.nup_center_id) {
        return company;
      }
    }

    throw new Error('No associated company with nup_center_id found for this deal');
  }

  throw new Error(`Unsupported object type: ${objectTypeId}`);
}

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
    if (nupCenterId) {
      analyticsData = await getAnalyticsByCenterId(nupCenterId);
    

      if (analyticsData && analyticsData.error) {
          log("WARN", "API", "Analytics DB down, serving center data only", { error: analyticsData.error });
          analyticsData = null; 
        }
    }

    res.json({
      ...companyData,
      analytics: analyticsData
    });

  } catch (err) {
    log("ERROR", "API", "Error in /api/company-data", { error: err.message });
    res.status(404).json({ error: err.message });
  }
});





// ────── Cron job: fetch events from amplitude ──────────────────────────────
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


// ────── Cron job: update invoices from Zoho ──────────────────────────────
// ─── Cron job that runs everyday at 2 in the morning
// ─── The pyProcess lines capture the logs to add them to app.log
// ─── Timezone discrepancy was solved with TZ=Europe/Madrid on env files
// ───────────────────────────────────────────────────────────────────────────
//cron.schedule('0 2 * * *', () => {

//    log("INFO", "CRON", "Starting Zoho backfill job");
    
//    const pyProcess = spawn('python3', ['-u', zoho_script_Path]); 
    
//    pyProcess.stdout.on('data', (data) => {
//        const lines = data.toString().split('\n');
//        lines.forEach(line => {
//            if (line.trim()) {
//              log("INFO", "CRON", line.trim());
//            }
//        });
//    });

//    pyProcess.stderr.on('data', (data) => {
//        const lines = data.toString().split('\n');
//        lines.forEach(line => {
//            if (line.trim()) {
//              log("ERROR", "CRON", line.trim());
//            }
//        });
//    });

//    pyProcess.on('close', (code) => {
//        if (code === 0) {
//            log("INFO", "CRON", `Zoho backfill script finished with exit code ${code}`);
//        } else {
//            log("WARN", "CRON", `Zoho backfill script exited with code ${code}`);
//        }
//    });
//});


app.listen(PORT, () => {
  
  log("INFO", "SERVER", `Servidor iniciado`, { url: `http://localhost:${PORT}` });

});