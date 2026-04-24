const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const dotenv = require('dotenv');
const path = require('path');
const cron = require('node-cron');
const { spawn } = require('child_process');
const { log } = require("./utils/logger");


//======================//
// INITIALIZATION: ENV //
//====================//
// NODE_ENV=DEVELOPMENT NODE SERVER.JS
// NODE_ENV=PRODUCTION NO
const envFile = process.env.NODE_ENV === 'production'
  ? '../.env.production'
  : '../.env.development';

const envPath = path.resolve(__dirname, envFile);
dotenv.config({ path: envPath });


//===================================//
// INITIALIZATION: DATABASE QUERIES //
//=================================//
const { getAnalyticsByCenterId } = require('./db/dbQueries');



//==========================//
// INITIALIZATION: SCRIPTS //
//========================//
const pythonBinary = path.join(__dirname, '../python-jobs/venv/bin/python');
const scriptPath = path.join(__dirname, '../python-jobs/script.py');


//=========================//
// INITIALIZATION: SERVER //
//=======================//
const app = express();
app.use(cors());
app.use(express.json());
app.use(cors({ origin: true, credentials: true }));

const PORT = process.env.PORT;
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;


//================================================//
// FUNCTION: GET COMPANY BASED ON OBJECT TYPE ID //
//==============================================//
async function resolveCompanyData(objectId, objectTypeId) {

  const OBJECT_TYPES = {
    COMPANY: '0-2',
    DEAL: '0-3'
  };

    //=====================//
   // PROPERTIES TO FETCH //
  //=====================//
  const companyProperties = [
    'nup_center_id', 'company_specialty__por_definir_', 'activity', 'email', 'region_backend', 'cif',
    'name', 'num_employees', 'num_patients', 'has_extra_professionals',
    'has_assessment', 'has_digital_material__por_definir_', 'nup2go_balance', 'nup2go_patients',
    'last_nup2go_assigment', 'last_nup2go_payment_date', 'last_company_login',
    'subscription_status__por_definir_', 'subscription_kind__por_definir_', 'subscription_current_period_end',
    'all_subscription_days', 'hasExtraMaterial'
  ];


    //==========================================//
   // OBJECT TYPE ID = COMPANY => DIRECT FETCH //
  //==========================================//
  if (objectTypeId === OBJECT_TYPES.COMPANY) {
    const url = `https://api.hubapi.com/crm/v3/objects/company/${objectId}?properties=${companyProperties.join(',')}`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${HUBSPOT_TOKEN}` } });
    if (!res.ok) throw new Error(`Company fetch failed: ${res.status}`);
    const data = await res.json();
    if (!data.properties?.nup_center_id) throw new Error('Company has no nup_center_id');
    return data;
  }


    //=================================================================//
   // OBJECT TYPE ID = DEAL => ASSOCIATIONS => FETCH BY NUP CENTER ID //
  //=================================================================//
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


  //========================//
 // ENDPOINT: GET COMPANY //
//======================//
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


//========================================//
// Cron Job: Fetch events from Amplitude //
//======================================//
//The time you want - 2
//This runs 3 in the morning
// Runs every 20 minutes for testing
//cron.schedule('*/20 * * * *', () => {
//  log("INFO", "CRON", "Starting Amplitude fetch job...");

  // Use '-u' to force Python to flush prints immediately to Node
//  const pyProcess = spawn('python3', ['-u', scriptPath]);

  // Capture standard output (print statements) line by line
//  pyProcess.stdout.on('data', (data) => {
//    const lines = data.toString().split('\n');
//    lines.forEach(line => {
//      if (line.trim()) {
//        log("INFO", "PYTHON", line.trim());
//      }
//    });
//  });

  // Capture error output line by line
//  pyProcess.stderr.on('data', (data) => {
//    const lines = data.toString().split('\n');
//    lines.forEach(line => {
//      if (line.trim()) {
//        log("ERROR", "PYTHON", line.trim());
//      }
//    });
//  });

  // Handle when the script finishes
//  pyProcess.on('close', (code) => {
//    if (code === 0) {
//      log("INFO", "CRON", "Python script finished successfully.");
//    } else {
//      log("WARN", "CRON", `Python script exited with code ${code}`);
//    }
//  });
//});


app.listen(PORT, () => {
  
  log("INFO", "SERVER", `Servidor iniciado`, { url: `http://localhost:${PORT}` });

});