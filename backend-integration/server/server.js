const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const Redis = require('ioredis');
const dotenv = require('dotenv');
const path = require('path');
const cron = require('node-cron');
const { exec } = require('child_process');
const { log } = require("./utils/logger");
const crypto = require('crypto');


//======================//
// Initialization: Env //
//====================//
// NODE_ENV=development node server.js
// NODE_ENV=production node server.js
const envFile = process.env.NODE_ENV === 'production'
  ? '../.env.production'
  : '../.env.development';

const envPath = path.resolve(__dirname, envFile);
dotenv.config({ path: envPath });


//===========================//
// Initialization: Database //
//=========================//
const { getAnalyticsByCenterId, refreshAnalytics } = require('./db/dbQueries');


//========================//
// Initialization: Redis //
//======================//
const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
});


//==========================//
// Initialization: Scripts //
//========================//
const pythonBinary = path.join(__dirname, '../python-jobs/venv/bin/python');
const scriptPath = path.join(__dirname, '../python-jobs/script.py');


//=========================//
// Initialization: Server //
//=======================//
const app = express();
app.use(cors());
app.use(express.json());
app.use(cors({ origin: true, credentials: true }));

const PORT = process.env.PORT;
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;


//========================//
// Endpoint: GET Company //
//======================//
app.options('/api/company', cors());
app.get('/api/company', async (req, res) => {

  const { objectId, objectTypeId } = req.query;

  log("INFO", "API", "GET /api/company", { objectId, objectTypeId });

  let companyData = await redis.get(`company:${objectId}`);
  log("DEBUG", "CACHE", "Checking company cache", { objectId });

  if (companyData && typeof companyData === 'string') {
    try {
      companyData = JSON.parse(companyData);
      log("INFO", "CACHE", "Company cache hit", { objectId });
    } catch (e) {
      log("WARN", "CACHE", "Failed to parse cached company data", { objectId });
      companyData = null;
    }
  } else {
    log("WARN", "CACHE", "Company cache miss", { objectId });
  }

  let nupCenterId = companyData?.properties?.nup_center_id;
  let analyticsData = null;

  if (nupCenterId) {
    log("INFO", "ANALYTICS", "Fetching analytics from cache flow", { nupCenterId });
    analyticsData = await getAnalyticsByCenterId(nupCenterId);
  }

  if (companyData) {

    const dataWithAnalytics = {
      ...companyData,
      analytics: analyticsData
    };

    const sessionId = crypto.randomBytes(32).toString('hex');

    await redis.setex(`session:${sessionId}`, 3600, JSON.stringify({
      objectId,
      data: dataWithAnalytics
    }));

    log("INFO", "SESSION", "Session created from cache", { sessionId, objectId });

    return res.json({ sessionId });
  }

  try {
    log("INFO", "HUBSPOT", "Fetching company from API", { objectId });

    const properties = [
      'nup_center_id', 'company_specialty__por_definir_', 'activity', 'email', 'region_backend', 'cif',
      'name', 'num_employees', 'num_patients', 'has_extra_professionals',
      'has_assessment', 'has_digital_material__por_definir_', 'nup2go_balance', 'nup2go_patients',
      'last_nup2go_assigment', 'last_nup2go_payment_date', 'last_company_login',
      'subscription_status__por_definir_', 'subscription_kind__por_definir_', 'subscription_current_period_end',
      'all_subscription_days', 'hasExtraMaterial',
    ];

    const objectUrl = `https://api.hubapi.com/crm/v3/objects/${objectTypeId}/${objectId}?properties=${properties.join(',')}`;
    
    const response = await fetch(objectUrl, {
      headers: { 'Authorization': `Bearer ${HUBSPOT_TOKEN}` }
    });

    log("INFO", "HUBSPOT", "Response received", { status: response.status });

    if (!response.ok) {
      const errorText = await response.text();
      log("ERROR", "HUBSPOT", "API request failed", { status: response.status, error: errorText });
      return res.status(response.status).json({ error: errorText });
    }

    const data = await response.json();
    log("INFO", "HUBSPOT", "Company data received", { objectId });

    nupCenterId = data.properties?.nup_center_id;

    if (nupCenterId) {
      log("INFO", "ANALYTICS", "Fetching analytics from API flow", { nupCenterId });
      analyticsData = await getAnalyticsByCenterId(nupCenterId);
    }

    const dataWithAnalytics = {
      ...data,
      analytics: analyticsData
    };

    const hubspotOnly = { ...data };

    await redis.setex(`company:${objectId}`, 86400, JSON.stringify(hubspotOnly));
    log("INFO", "CACHE", "Company cached", { objectId });

    const sessionId = crypto.randomBytes(32).toString('hex');

    await redis.setex(`session:${sessionId}`, 3600, JSON.stringify({
      objectId,
      data: dataWithAnalytics
    }));

    log("INFO", "SESSION", "Session created from API", { sessionId, objectId });

    res.json({ sessionId });

  } catch (error) {
    log("ERROR", "SERVER", "Unhandled error in /api/company", { error: error.message });
    res.status(500).json({ error: error.message });
  }
});


//Not necessary, /api/company and /api/session-data' will fetch new 
// analytics regardless of cache or fetch
//==================================//
// Endpoint: GET Company Analytics //
//================================//

//app.get('/api/refresh-analytics', async (req, res) => {
// const { centerId } = req.query;
  
//  if (!centerId) {
//    return res.status(400).json({ error: 'centerId is required' });
//  }
  
//  const analyticsData = await refreshAnalytics(centerId);
//  res.json(analyticsData);
// });


//==========================================//
// Endpoint: GET Company Data by SessionId //
//========================================//
app.get('/api/session-data', async (req, res) => {
  const { sessionId } = req.query;
  
  log("INFO", "SESSION", "Fetching session data", { sessionId });
  
  const session = await redis.get(`session:${sessionId}`);
  
  if (!session) {
    log("WARN", "SESSION", "Session not found", { sessionId });
    return res.status(404).json({ error: 'Session not found' });
  }
  
  const { objectId, data } = JSON.parse(session);
  
  if (!data) {
    log("ERROR", "SESSION", "Data is null/undefined in session", { sessionId });
    return res.status(500).json({ error: 'No data in session' });
  }
  

  const centerId = data.properties?.nup_center_id;
  let analyticsData = null;
  
  if (centerId) {
    log("INFO", "DB", "Fetching fresh analytics for session", { centerId, sessionId });
    analyticsData = await getAnalyticsByCenterId(centerId);
  }
  
  const updatedData = {
    ...data,
    analytics: analyticsData
  };
  
  await redis.setex(`session:${sessionId}`, 3600, JSON.stringify({
    objectId,
    data: updatedData
  }));
  
  log("INFO", "SESSION", "Session data returned with fresh analytics", { 
    sessionId, 
    hasAnalytics: !!analyticsData 
  });
  
  return res.json(updatedData);
});


//========================================//
// Cron Job: Fetch events from Amplitude //
//======================================//
//The time you want - 2
//This runs 3 in the morning
//cron.schedule('10 12 * * *', () => {
//  log("INFO", "CRON", "Running every minute");

//  exec(`${pythonBinary} "${scriptPath}"`, (error, stdout, stderr) => {
//    if (error) {
//      log("ERROR", "CRON", "Python execution failed", { error: error.message });
//      return;
//    }
//    if (stderr) {
//      log("WARN", "CRON", "Python stderr output", { stderr });
//      return;
//    }
//    log("INFO", "CRON", "Python output", { output: stdout.trim() });
//  });
//});



app.listen(PORT, () => {
  
  log("INFO", "SERVER", `Servidor iniciado`, { url: `http://localhost:${PORT}` });

});