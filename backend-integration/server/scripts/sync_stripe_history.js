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

if (!process.env.DB_PASSWORD || !process.env.STRIPE_SECRET_KEY) {
  console.error("[FATAL ERROR] Faltan variables (DB_PASSWORD o STRIPE_SECRET_KEY). Revisa tu .env");
  process.exit(1);
}

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

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
  console.error("[ERROR] [STRIPE-SYNC] Database error:", err.message);
});

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));


const hubspotFeaturesCache = new Map();

async function getHubspotFeaturesCached(nupCenterId) {
  if (!nupCenterId) return [];
  
  // 1. Miramos si ya tenemos las features de este centro en memoria
  if (hubspotFeaturesCache.has(nupCenterId)) {
    return hubspotFeaturesCache.get(nupCenterId);
  }

  // 2. Si no lo tenemos, llamamos a HubSpot
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
        
        hubspotFeaturesCache.set(nupCenterId, featuresArray); // Guardar en caché
        return featuresArray;
      }
    }
  } catch (error) {
    console.error(`[HUBSPOT ERROR] Centro ${nupCenterId}:`, error.message);
  }
  
  hubspotFeaturesCache.set(nupCenterId, []); // Si falla, guardamos vacío para no repetir el error
  return [];
}

// ============================================================================
// FUNCIÓN DE UPSERT
// ============================================================================
async function upsertStripeSubscription(data) {
  const client = await pool.connect();
  const { sub, items } = data;

  try {
    await client.query('BEGIN');

    // 1. Inserción o Actualización del Padre (subscriptions)
    await client.query(
      `INSERT INTO subscriptions (
         subscription_id, hubspot_subscription_id, nup_center_id, segment, 
         manages_own_payment, center_name, start_date, precancelled_date, 
         cancelation_date, revoked_access_date, current_state, currency, 
         creation_source, source, payment_method_type, market, is_forever, pending_payment
       ) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       ON CONFLICT (subscription_id) 
       DO UPDATE SET 
         center_name = EXCLUDED.center_name,
         start_date = EXCLUDED.start_date,
         precancelled_date = EXCLUDED.precancelled_date,
         cancelation_date = EXCLUDED.cancelation_date,
         current_state = EXCLUDED.current_state,
         currency = EXCLUDED.currency,
         payment_method_type = EXCLUDED.payment_method_type,
         is_forever = EXCLUDED.is_forever,
         pending_payment = EXCLUDED.pending_payment,
         updated_at = CURRENT_TIMESTAMP`,
      [
        sub.subscription_id, null, null, sub.segment, 
        null, sub.center_name, sub.start_date, sub.precancelled_date, 
        sub.cancelation_date, null, sub.current_state, sub.currency, 
        null, 'stripe', sub.payment_method_type, null, sub.is_forever, sub.pending_payment
      ]
    );

    // 2. Inserción o Actualización de Hijos (subscription_items)
    if (items && items.length > 0) {
      const currentItemIds = items.map(item => item.item_id);

      // Si un ítem ya no viene en Stripe, pasa a estar cancelado
      await client.query(
        `UPDATE subscription_items 
         SET status = 'canceled', precanceled_date = COALESCE(precanceled_date, CURRENT_DATE), updated_at = CURRENT_TIMESTAMP
         WHERE subscription_id = $1 AND item_id != ALL($2)`,
        [sub.subscription_id, currentItemIds]
      );

      for (const item of items) {
        await client.query(
          `INSERT INTO subscription_items (
             item_id, hubspot_item_id, subscription_id, nup_center_id, 
             product_id, product_name, billing_interval, payment_frequency, unit_price, 
             features, quantity, start_date, current_period_start, current_period_end, 
             is_forever, status, precanceled_date
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
           ON CONFLICT (item_id) 
           DO UPDATE SET 
             product_name = EXCLUDED.product_name,
             billing_interval = EXCLUDED.billing_interval,
             payment_frequency = EXCLUDED.payment_frequency,
             unit_price = EXCLUDED.unit_price,
             features = EXCLUDED.features,
             quantity = EXCLUDED.quantity,
             current_period_start = EXCLUDED.current_period_start,
             current_period_end = EXCLUDED.current_period_end,
             is_forever = EXCLUDED.is_forever,
             status = EXCLUDED.status,
             precanceled_date = EXCLUDED.precanceled_date,
             updated_at = CURRENT_TIMESTAMP`,
          [
            item.item_id, null, sub.subscription_id, null, 
            item.product_id, item.product_name, item.billing_interval, item.payment_frequency, item.unit_price, 
            item.features, item.quantity, item.start_date, item.current_period_start, item.current_period_end, 
            item.is_forever, item.status, item.precanceled_date
          ]
        );
      }
    } else {
      await client.query(
        `UPDATE subscription_items 
         SET status = 'canceled', precanceled_date = COALESCE(precanceled_date, CURRENT_DATE), updated_at = CURRENT_TIMESTAMP 
         WHERE subscription_id = $1`, 
        [sub.subscription_id]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error; 
  } finally {
    client.release();
  }
}

// ============================================================================
// LÓGICA PRINCIPAL: SINCRO HISTÓRICA MASIVA
// ============================================================================
async function processMassiveStripeSync() {
  console.log("[INFO] Construyendo diccionario de productos...");
  
  let successCount = 0;
  let errorCount = 0;

  try {
    const productsMap = new Map();
    for await (const prod of stripe.products.list({ limit: 100 })) {
      productsMap.set(prod.id, prod.name);
    }
    
    console.log(`[INFO] Descargados ${productsMap.size} productos.`);
    console.log("[INFO] Iniciando volcado masivo histórico desde Stripe...");

    // Obtenemos todas las suscripciones auto-paginadas
    const subscriptions = stripe.subscriptions.list({
      status: 'all',
      expand: ['data.customer', 'data.customer.invoice_settings.default_payment_method']
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for await (const stripeSub of subscriptions) {
      try {
        // --- PARSEO DE FECHAS SEGÚN TU LOGIC (CORREGIDO) ---
        const startDate = stripeSub.start_date ? new Date(stripeSub.start_date * 1000) : null;
        const currentPeriodStart = stripeSub.current_period_start ? new Date(stripeSub.current_period_start * 1000) : null;
        
        // Tu precancelled_date = Cuando le dan al botón (canceled_at de Stripe)
        const precancelledDate = stripeSub.canceled_at ? new Date(stripeSub.canceled_at * 1000) : null;
        
        // Tu cancelation_date = Cuando expira de verdad (cancel_at de Stripe)
        // Si no está programado para cancelar, usamos su fin de periodo habitual como fecha estimada de fin del ciclo actual
        const cancelationDate = stripeSub.cancel_at 
          ? new Date(stripeSub.cancel_at * 1000) 
          : (stripeSub.current_period_end ? new Date(stripeSub.current_period_end * 1000) : null);
        
        const trialEnd = stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000) : null;

        // --- BOOLEANOS DE ESTADO ---
        const isForever = stripeSub.cancel_at_period_end === false && stripeSub.cancel_at === null;
        const pendingPayment = stripeSub.status === 'past_due' || stripeSub.status === 'unpaid';
        
        // --- DATOS DEL CLIENTE ---
        let centerName = null;
        let pmType = null;
        const customer = stripeSub.customer;
        
        if (customer && typeof customer === 'object') {
          centerName = customer.name || customer.description || null;
          
          if (customer.invoice_settings?.default_payment_method) {
            pmType = customer.invoice_settings.default_payment_method.type; // ej: 'card', 'sepa_debit'
          }
        }

        const centerFeatures = await getHubspotFeaturesCached(nupCenterId);

        // --- ESTADO DEL PADRE: INFERIR TRIAL_CANCELED ---
        let parentState = stripeSub.status;
        if (parentState === 'canceled' && trialEnd && precancelledDate && precancelledDate <= trialEnd) {
          parentState = 'trial_canceled';
        } else if (parentState === 'trialing') {
          parentState = 'trial'; // Adaptamos el string nativo de stripe a tu enum
        }

        const payloadSub = {
          subscription_id: stripeSub.id,
          center_name: centerName,
          start_date: startDate,
          precancelled_date: precancelledDate,
          cancelation_date: stripeSub.status === 'canceled' || stripeSub.status === 'incomplete_expired' ? cancelationDate : null, // Solo guardamos fin si está muerta
          current_state: parentState,
          currency: stripeSub.currency ? stripeSub.currency.toUpperCase() : null,
          payment_method_type: pmType,
          is_forever: isForever,
          pending_payment: pendingPayment,
          segment: stripeSub.metadata?.segment || null
        };

        const payloadItems = stripeSub.items.data.map(item => {
          const productId = typeof item.price.product === 'object' ? item.price.product.id : item.price.product;
          const productName = productsMap.get(productId) || 'Producto Desconocido';
          const itemPeriodEnd = item.price.recurring ? (stripeSub.current_period_end ? new Date(stripeSub.current_period_end * 1000) : null) : null;

          // --- ESTADO DEL HIJO: HERENCIA CONDICIONADA ---
          let childStatus = parentState;
          if (['past_due', 'unpaid', 'incomplete'].includes(parentState)) {
            if (itemPeriodEnd && itemPeriodEnd > today) {
              childStatus = 'active'; // Sigue pagada/sana de momento
            }
          }

          return {
            item_id: item.id,
            product_id: productId,
            product_name: productName,
            billing_interval: item.price.recurring?.interval || null,
            payment_frequency: item.price.recurring?.interval_count || 1,
            unit_price: item.price.unit_amount ? (item.price.unit_amount / 100) : null, // ✅ CORREGIDO: De céntimos a Euros
            features: JSON.stringify(centerFeatures), // ✨ INYECTAMOS EL RESULTADO DE HUBSPOT            quantity: item.quantity,
            start_date: startDate,
            current_period_start: currentPeriodStart,
            current_period_end: itemPeriodEnd,
            is_forever: isForever,
            status: childStatus,
            precanceled_date: precancelledDate
          };
        });

        await upsertStripeSubscription({ sub: payloadSub, items: payloadItems, event_date: today });
        
        successCount++;
        if (successCount % 50 === 0) {
          console.log(`[INFO] Sincronizadas ${successCount} suscripciones de Stripe...`);
        }
        await delay(100);

      } catch (rowError) {
        console.error(`[ERROR] Fallo en suscripción ${stripeSub.id} | error=${rowError.message}`);
        errorCount++;
      }
    }

    console.log(`\n[INFO] Sincronización masiva terminada | Éxito: ${successCount} | Errores: ${errorCount}`);

  } catch (apiError) {
    console.error("[FATAL ERROR] Error de comunicación con Stripe:", apiError.message);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

processMassiveStripeSync();