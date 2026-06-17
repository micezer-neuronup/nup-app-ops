const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

// ============================================================================
// CONFIGURACIÓN DE ENTORNO
// ============================================================================
let envFile = process.env.NODE_ENV === 'production' ? '../../.env.production' : '../../.env.development';
let envPath = path.resolve(__dirname, envFile);

if (!fs.existsSync(envPath)) {
  envPath = path.resolve(__dirname, '../../.env');
}

dotenv.config({ path: envPath });

// ✨ Cambiamos la validación para pedir HUBSPOT_TOKEN en lugar de STRIPE
if (!process.env.DB_PASSWORD || !process.env.HUBSPOT_TOKEN) {
  console.error("[FATAL ERROR] Faltan variables (DB_PASSWORD o HUBSPOT_TOKEN). Revisa tu .env");
  process.exit(1);
}

// ============================================================================
// CONEXIÓN A BASE DE DATOS
// ============================================================================
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME, 
  password: String(process.env.DB_PASSWORD),
  port: parseInt(process.env.DB_PORT) || 5432,
  max: 2, 
});

pool.on('error', (err) => {
  console.error("[ERROR] [HUBSPOT-SYNC] Database error:", err.message);
});

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ============================================================================
// FUNCIÓN PARA OBTENER FEATURES DE HUBSPOT
// ============================================================================
const hubspotFeaturesCache = new Map();

async function getHubspotFeaturesCached(nupCenterId) {
  if (!nupCenterId) return [];
  
  if (hubspotFeaturesCache.has(nupCenterId)) {
    return hubspotFeaturesCache.get(nupCenterId);
  }

  try {
    const response = await fetch('https://api.hubapi.com/crm/v3/objects/companies/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.HUBSPOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        filterGroups: [{ filters: [{ propertyName: "nup_center_id", operator: "EQ", value: nupCenterId }] }],
        properties: ["subscription_features"]
      })
    });

    if (response.ok) {
      const data = await response.json();
      if (data.results && data.results.length > 0) {
        const rawFeatures = data.results[0].properties.subscription_features;
        const featuresArray = rawFeatures ? rawFeatures.split(/[,;]/).map(f => f.trim()).filter(Boolean) : [];
        
        hubspotFeaturesCache.set(nupCenterId, featuresArray);
        return { found: true, features: featuresArray };
      }
    }
  } catch (error) {
    console.error(`[HUBSPOT ERROR] Centro ${nupCenterId}:`, error.message);
  }
  
  hubspotFeaturesCache.set(nupCenterId, []); 
  return { found: false, features: [] };
}

// ============================================================================
// LÓGICA PRINCIPAL: BARRIDO Y ACTUALIZACIÓN
// ============================================================================
async function updateFeaturesFromHubspot() {
  console.log("[INFO] Iniciando actualización masiva de features desde HubSpot...");
  
  let centersProcessed = 0;
  let centersFoundInHubspot = 0;
  let totalItemsUpdated = 0;
  let errorCount = 0;

  const client = await pool.connect();

  try {
    // 1. Obtenemos todos los nup_center_id únicos que tenemos en nuestros items de suscripción
    console.log("[INFO] Buscando centros únicos en la base de datos...");
    const res = await client.query(`
      SELECT DISTINCT nup_center_id 
      FROM subscription_items 
      WHERE nup_center_id IS NOT NULL AND nup_center_id != ''
    `);
    
    const centerIds = res.rows.map(row => row.nup_center_id);
    console.log(`[INFO] Encontrados ${centerIds.length} centros distintos en la base de datos.`);

    // 2. Iteramos sobre cada centro
    for (const centerId of centerIds) {
      try {
        // Pedimos a Hubspot
        const hubspotData = await getHubspotFeaturesCached(centerId);
        
        if (hubspotData.found) {
          centersFoundInHubspot++;
        }

        const featuresJsonb = JSON.stringify(hubspotData.features);

        // Actualizamos TODOS los ítems que pertenezcan a este centro, aunque sea con los mismos valores
        const updateRes = await client.query(
          `UPDATE subscription_items 
           SET features = $1, updated_at = CURRENT_TIMESTAMP
           WHERE nup_center_id = $2`,
          [featuresJsonb, centerId]
        );

        totalItemsUpdated += updateRes.rowCount;
        centersProcessed++;

        // Log de progreso cada 20 centros para no saturar la consola
        if (centersProcessed % 20 === 0) {
          console.log(`[INFO] Progreso: ${centersProcessed}/${centerIds.length} centros analizados...`);
        }

        // Pequeña pausa para no comernos el Rate Limit de HubSpot (tienen límites estrictos de API)
        await delay(150); 

      } catch (rowError) {
        console.error(`[ERROR] Fallo al procesar el centro ${centerId}: ${rowError.message}`);
        errorCount++;
      }
    }

    // 3. Resumen final
    console.log(`\n======================================================`);
    console.log(`✅ RESULTADOS DE LA ACTUALIZACIÓN DE FEATURES`);
    console.log(`======================================================`);
    console.log(`🏢 Centros analizados en total: ${centersProcessed}`);
    console.log(`🔍 Centros encontrados en HubSpot: ${centersFoundInHubspot}`);
    console.log(`📝 Ítems de suscripción actualizados/sobreescritos: ${totalItemsUpdated}`);
    console.log(`❌ Errores encontrados: ${errorCount}`);
    console.log(`======================================================\n`);

  } catch (dbError) {
    console.error("[FATAL ERROR] Fallo al conectar o consultar la BD:", dbError.message);
  } finally {
    client.release();
    await pool.end();
    process.exit(0);
  }
}

updateFeaturesFromHubspot();