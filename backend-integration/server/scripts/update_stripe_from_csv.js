const fs = require('fs');
const csv = require('csv-parser');
const dotenv = require('dotenv');
const path = require('path');
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

if (!process.env.DB_PASSWORD) {
  console.error("[FATAL ERROR] No se ha cargado DB_PASSWORD. Revisa tu archivo .env.");
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
  console.error("[ERROR] [CSV-UPDATE-DB] Database error:", err.message);
});

const CSV_FILE_PATH = './suscripciones.csv';
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ============================================================================
// LÓGICA PRINCIPAL: ACTUALIZACIÓN
// ============================================================================
async function updateStripeDataFromCSV() {
  const stripeUpdates = [];
  console.log("[INFO] Leyendo el archivo CSV para buscar datos de Stripe...");

  fs.createReadStream(CSV_FILE_PATH)
    .pipe(csv())
    .on('data', (row) => {
      // Filtramos por aquellas filas que tengan un ID de Stripe válido
      const stripeId = row.stripe_subscription_id ? row.stripe_subscription_id.trim() : null;
      
      if (stripeId && stripeId.startsWith('sub_')) {
        stripeUpdates.push(row);
      }
    })
    .on('end', async () => {
      console.log(`[INFO] CSV procesado. Encontrados ${stripeUpdates.length} registros con stripe_subscription_id.`);
      
      let successCount = 0;
      let errorCount = 0;
      let notFoundCount = 0;

      const client = await pool.connect();

      try {
        // ✨ PRUEBA 1: ¿Estamos en la base de datos correcta?
        const totalRows = await client.query('SELECT COUNT(*) as total FROM subscriptions');
        console.log(`[DEBUG] Suscripciones totales en esta BD: ${totalRows.rows[0].total}`);
        if (totalRows.rows[0].total == 0) console.log(`[ALERTA] ¡La tabla está vacía! Estás conectado a otra BD.`);

        for (const row of stripeUpdates) {
          try {
            // ✨ PRUEBA 2: Exorcismo de caracteres invisibles
            // Esto elimina TODO lo que no sea una letra, número o guión bajo
            const stripeId = row.stripe_subscription_id.replace(/[^a-zA-Z0-9_]/g, ''); 
            
            const centerId = row.center_id ? row.center_id.trim() : null;
            
            // Parsear las features a un array JSON, tal como lo hicimos en las manuales
            let featuresArray = [];
            if (row.subscription_features && row.subscription_features !== 'NULL') {
              featuresArray = row.subscription_features.split(',').map(f => f.trim());
            }
            const featuresJsonb = JSON.stringify(featuresArray);

            // 1. Comprobar si la suscripción de Stripe existe en nuestra BD antes de actualizar
            const checkRes = await client.query(
              `SELECT subscription_id FROM subscriptions WHERE subscription_id = $1`,
              [stripeId]
            );

            if (checkRes.rowCount === 0) {
              // Si está en el CSV pero no en Stripe/nuestra BD, la saltamos
              notFoundCount++;
              continue;
            }

            await client.query('BEGIN');

            // 2. Actualizar el nup_center_id en el Padre (subscriptions)
            await client.query(
              `UPDATE subscriptions 
               SET nup_center_id = $1, updated_at = CURRENT_TIMESTAMP
               WHERE subscription_id = $2`,
              [centerId, stripeId]
            );

            // 3. Actualizar el nup_center_id y las features en los Hijos (subscription_items)
            await client.query(
              `UPDATE subscription_items 
               SET nup_center_id = $1, features = $2, updated_at = CURRENT_TIMESTAMP
               WHERE subscription_id = $3`,
              [centerId, featuresJsonb, stripeId]
            );

            await client.query('COMMIT');
            
            successCount++;
            if (successCount % 100 === 0) {
              console.log(`[INFO] Progreso: ${successCount} suscripciones actualizadas...`);
            }
            
            await delay(10); // Pequeña pausa para no estresar la BD

          } catch (error) {
            await client.query('ROLLBACK');
            console.error(`[ERROR] Fallo al actualizar la suscripción ${row.stripe_subscription_id}: ${error.message}`);
            errorCount++;
          }
        }
      } finally {
        client.release();
      }

      console.log(`\n--- RESULTADOS DE LA ACTUALIZACIÓN ---`);
      console.log(`✅ Actualizadas con éxito: ${successCount}`);
      console.log(`⚠️ Ignoradas (No estaban en la BD): ${notFoundCount}`);
      console.log(`❌ Errores: ${errorCount}`);
      
      await pool.end();
      process.exit(0);
    });
}

updateStripeDataFromCSV();