const { pool } = require('./db');
const { markHubspotSyncStatus } = require('./dbSubscriptions');
const { syncSingleSubscriptionToHubspot } = require('./hubspotServices');
const { log } = require("../utils/logger");

async function runSweeper() {
  log("INFO", "SWEEPER", "🧹 Iniciando barrido de suscripciones atascadas...");
  
  const client = await pool.connect();
  try {
    // Buscamos todo lo que se haya quedado colgado por fallos de HubSpot
    const { rows } = await client.query(`SELECT subscription_id FROM subscriptions WHERE hubspot_sync_status = 'PENDING'`);
    
    if (rows.length === 0) {
      log("INFO", "SWEEPER", "✨ Todo está al día con HubSpot. Nada que sincronizar.");
      return;
    }

    log("INFO", "SWEEPER", `⚠️ Se encontraron ${rows.length} suscripciones PENDING. Intentando resincronizar...`);

    for (const row of rows) {
      const subId = row.subscription_id;
      const success = await syncSingleSubscriptionToHubspot(subId);
      
      if (success) {
        await markHubspotSyncStatus(subId, 'SYNCED');
      }
      // Pequeña pausa para no ametrallar a HubSpot (Rate limits)
      await new Promise(res => setTimeout(res, 500)); 
    }

  } catch (error) {
    log("ERROR", "SWEEPER", "Fallo crítico en el barrendero:", error.message);
  } finally {
    client.release();
  }
}

// Ejecutar si se llama directamente con node hubspotSweeper.js
if (require.main === module) {
  runSweeper().then(() => process.exit(0));
}

module.exports = { runSweeper };