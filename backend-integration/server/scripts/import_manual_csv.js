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
  host: '127.0.0.1', 
  database: process.env.DB_NAME, 
  password: String(process.env.DB_PASSWORD),
  port: parseInt(process.env.DB_PORT) || 5432,
  max: 2, 
});

pool.on('error', (err) => {
  console.error("[ERROR] [CSV-IMPORT-DB] Database error:", err.message);
});

const CSV_FILE_PATH = './subscriptions.csv';
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ============================================================================
// FUNCIÓN DE UPSERT
// ============================================================================
async function upsertManualSubscription(data) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Insertar o actualizar la tabla padre (subscriptions)
    // ✅ AÑADIDOS: is_forever y pending_payment
    const parentQuery = `
      INSERT INTO subscriptions (
        subscription_id, hubspot_subscription_id, nup_center_id, segment, 
        manages_own_payment, center_name, start_date, precancelled_date, 
        cancelation_date, revoked_access_date, current_state, currency, 
        creation_source, source, payment_method_type, market, 
        last_invoice_status, last_invoice_amount, last_invoice_date,
        is_forever, pending_payment
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
      )
      ON CONFLICT (subscription_id) DO UPDATE SET 
        nup_center_id = EXCLUDED.nup_center_id,
        center_name = EXCLUDED.center_name,
        cancelation_date = EXCLUDED.cancelation_date,
        current_state = EXCLUDED.current_state,
        is_forever = EXCLUDED.is_forever,
        pending_payment = EXCLUDED.pending_payment,
        updated_at = CURRENT_TIMESTAMP
    `;
    
    await client.query(parentQuery, [
      data.subscription_id, null, data.nup_center_id, null, 
      null, data.center_name, null, null, 
      data.cancelation_date, null, data.current_state, null, 
      'manual', 'backend', null, null, 
      null, null, null,
      data.is_forever, null // is_forever calculado, pending_payment siempre null para manuales
    ]);

    // 2. Insertar o actualizar la tabla hija (subscription_items)
    const childQuery = `
      INSERT INTO subscription_items (
        item_id, hubspot_item_id, subscription_id, nup_center_id, product_id, 
        product_name, billing_interval, payment_frequency, unit_price, 
        features, quantity, number_of_renovations, start_date, 
        current_period_start, current_period_end, is_forever, status, precanceled_date
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
      )
      ON CONFLICT (item_id) DO UPDATE SET 
        nup_center_id = EXCLUDED.nup_center_id,
        features = EXCLUDED.features,
        current_period_end = EXCLUDED.current_period_end,
        is_forever = EXCLUDED.is_forever,
        status = EXCLUDED.status,
        updated_at = CURRENT_TIMESTAMP
    `;

    await client.query(childQuery, [
      data.item_id, null, data.subscription_id, data.nup_center_id, null,
      'Producto Manual', null, null, null,
      data.features, 1, null, null,
      null, data.current_period_end, data.is_forever, data.current_state, null
    ]);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ============================================================================
// LÓGICA DE PROCESAMIENTO
// ============================================================================
async function processManualSubscriptions() {
  const manualSubs = [];
  console.log("[INFO] Leyendo el archivo CSV...");

  fs.createReadStream(CSV_FILE_PATH)
    .pipe(csv())
    .on('data', (row) => {
      if (row.subscription_kind && row.subscription_kind.toLowerCase() === 'manual') {
        manualSubs.push(row);
      }
    })
    .on('end', async () => {
      console.log(`[INFO] CSV procesado. Encontradas suscripciones manuales: ${manualSubs.length}`);
      
      let successCount = 0;
      let errorCount = 0;
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (const row of manualSubs) {
        try {
          // Parsear Fechas
          const cancelDateStr = row.subscription_canceled_at;
          const periodEndStr = row.subscription_current_period_end;

          // Convertir la palabra "NULL" en null real, o parsear la fecha si existe
          const cancelDate = (cancelDateStr === 'NULL' || !cancelDateStr) ? null : new Date(cancelDateStr);
          const periodEnd = (periodEndStr === 'NULL' || !periodEndStr) ? null : new Date(periodEndStr);

          // 1. Lógica de Vida/Muerte
          let isAlive = true;
          if (cancelDate && cancelDate < today) isAlive = false;
          if (periodEnd && periodEnd < today) isAlive = false;

          // 2. Lógica de Estados (current_state y status)
          const rawStatus = (row.subscription_status || 'active').toLowerCase();
          let finalState = '';
          
          if (isAlive) {
            finalState = rawStatus === 'trial' ? 'trial' : 'active';
          } else {
            finalState = rawStatus === 'trial' ? 'trial_canceled' : 'canceled';
          }

          // 3. Lógica de is_forever
          // TRUE si está viva, el estado final es 'active' y NO hay fecha de cancelación.
          const is_forever = isAlive && finalState === 'active' && cancelDate === null;

          // 4. Formatear Features a Array JSON
          let featuresArray = [];
          if (row.subscription_features) {
            featuresArray = row.subscription_features.split(',').map(f => f.trim());
          }
          const featuresJsonb = JSON.stringify(featuresArray);

          // Construir Payload final
          const payload = {
            subscription_id: row.subscription_id,
            nup_center_id: row.center_id,
            center_name: row.center_name || null,
            cancelation_date: cancelDate,
            current_state: finalState,
            item_id: `man_item_${row.subscription_id}`, 
            features: featuresJsonb,
            current_period_end: periodEnd,
            is_forever: is_forever
          };

          await upsertManualSubscription(payload);
          await delay(20); // Pequeña pausa para no saturar la BD
          successCount++;

        } catch (error) {
          console.error(`[ERROR] Fallo en suscripción ${row.subscription_id} | error: ${error.message}`);
          errorCount++;
        }
      }

      console.log(`[INFO] Proceso completado | Éxito: ${successCount} | Errores: ${errorCount}`);
      await pool.end();
      process.exit(0);
    });
}

processManualSubscriptions();