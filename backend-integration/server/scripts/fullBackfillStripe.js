// scripts/fullBackfillStripe.js
const path = require('path');
const dotenv = require('dotenv');

const envFile = process.env.NODE_ENV === 'production' ? '../.env.production' : '../.env.development';
const envPath = path.resolve(__dirname, envFile);
dotenv.config({ path: envPath });

const { pool } = require('../db/db');
const { log } = require('../utils/logger');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const OPS_API_URL = 'https://api.neuronup.com/ops/subscriptions';
const OPS_API_TOKEN = process.env.OPS_API_TOKEN || '6p48*mf65TH$cU**';
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ============================================================================
// CACHE DE OPS API (para no pedir el listado en cada suscripción)
// ============================================================================
let opsSubscriptionsCache = null;
let opsCacheTimestamp = null;
const OPS_CACHE_TTL = 5 * 60 * 1000; // 5 minutos

async function getAllOpsSubscriptions() {
  const now = Date.now();
  if (opsSubscriptionsCache && opsCacheTimestamp && (now - opsCacheTimestamp) < OPS_CACHE_TTL) {
    return opsSubscriptionsCache;
  }

  log('INFO', 'OPS-API', 'Fetching all subscriptions from Ops API...');
  const allSubs = [];
  let page = 1;

  while (true) {
    const url = `${OPS_API_URL}?page=${page}&kind=stripe`;
    const response = await fetch(url, {
      headers: {
        'X-Api-Token': OPS_API_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      log('ERROR', 'OPS-API', `Error fetching page ${page}: ${response.status}`);
      break;
    }

    const subs = await response.json();
    if (!subs || subs.length === 0) break;

    allSubs.push(...subs);
    log('INFO', 'OPS-API', `Fetched page ${page}: ${subs.length} subscriptions`);
    page++;
    await delay(100);
  }

  log('INFO', 'OPS-API', `Total fetched: ${allSubs.length} subscriptions`);
  opsSubscriptionsCache = allSubs;
  opsCacheTimestamp = now;
  return allSubs;
}

function findOpsSubscription(opsSubs, stripeSubscriptionId) {
  return opsSubs.find(s => s.stripeSubscriptionId === stripeSubscriptionId);
}

// ============================================================================
// FALLBACK A HUBSPOT
// ============================================================================
const hubspotCache = new Map();

async function getHubspotFeatures(nupCenterId) {
  if (!nupCenterId) return [];
  if (hubspotCache.has(nupCenterId)) return hubspotCache.get(nupCenterId);

  try {
    const response = await fetch('https://api.hubapi.com/crm/v3/objects/companies/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
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
        const raw = data.results[0].properties.subscription_features;
        const features = raw ? raw.split(/[,;]/).map(f => f.trim()).filter(Boolean) : [];
        hubspotCache.set(nupCenterId, features);
        return features;
      }
    }
  } catch (error) {
    log('ERROR', 'HUBSPOT', `Error for center ${nupCenterId}: ${error.message}`);
  }

  hubspotCache.set(nupCenterId, []);
  return [];
}

// ============================================================================
// UPSERT EN BD
// ============================================================================
async function upsertSubscription(sub, items) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Upsert padre
    await client.query(
      `INSERT INTO subscriptions (
         subscription_id, hubspot_subscription_id, nup_center_id, backend_subscription_id,
         segment, manages_own_payment, center_name, start_date, precancelled_date,
         cancelation_date, revoked_access_date, current_state, currency,
         creation_source, source, payment_method_type, market,
         is_forever, pending_payment, hubspot_sync_status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
       ON CONFLICT (subscription_id) DO UPDATE SET
         nup_center_id = EXCLUDED.nup_center_id,
         backend_subscription_id = EXCLUDED.backend_subscription_id,
         center_name = EXCLUDED.center_name,
         start_date = EXCLUDED.start_date,
         precancelled_date = EXCLUDED.precancelled_date,
         cancelation_date = EXCLUDED.cancelation_date,
         revoked_access_date = EXCLUDED.revoked_access_date,
         current_state = EXCLUDED.current_state,
         currency = EXCLUDED.currency,
         payment_method_type = EXCLUDED.payment_method_type,
         is_forever = EXCLUDED.is_forever,
         pending_payment = EXCLUDED.pending_payment,
         hubspot_sync_status = 'PENDING',
         updated_at = CURRENT_TIMESTAMP`,
      [
        sub.subscription_id,
        null,
        sub.nup_center_id,
        sub.backend_subscription_id,
        sub.segment,
        null,
        sub.center_name,
        sub.start_date,
        sub.precancelled_date,
        sub.cancelation_date,
        sub.revoked_access_date,
        sub.current_state,
        sub.currency,
        null,
        'stripe',
        sub.payment_method_type,
        null,
        sub.is_forever,
        sub.pending_payment,
        'PENDING'
      ]
    );

    // 2. Upsert items
    if (items && items.length > 0) {
      const currentItemIds = items.map(i => i.item_id);

      await client.query(
        `UPDATE subscription_items
         SET status = 'canceled', precancelled_date = COALESCE(precancelled_date, CURRENT_DATE), updated_at = CURRENT_TIMESTAMP
         WHERE subscription_id = $1 AND item_id != ALL($2)`,
        [sub.subscription_id, currentItemIds]
      );

      for (const item of items) {
        await client.query(
          `INSERT INTO subscription_items (
             item_id, hubspot_item_id, subscription_id, nup_center_id,
             product_id, product_name, billing_interval, payment_frequency, unit_price,
             features, quantity, start_date, current_period_start, current_period_end,
             is_forever, status, precancelled_date
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
           ON CONFLICT (item_id) DO UPDATE SET
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
             precancelled_date = EXCLUDED.precancelled_date,
             updated_at = CURRENT_TIMESTAMP`,
          [
            item.item_id,
            null,
            sub.subscription_id,
            item.nup_center_id,
            item.product_id,
            item.product_name,
            item.billing_interval,
            item.payment_frequency,
            item.unit_price,
            item.features,
            item.quantity,
            item.start_date,
            item.current_period_start,
            item.current_period_end,
            item.is_forever,
            item.status,
            item.precancelled_date
          ]
        );
      }
    } else {
      await client.query(
        `UPDATE subscription_items
         SET status = 'canceled', precancelled_date = COALESCE(precancelled_date, CURRENT_DATE), updated_at = CURRENT_TIMESTAMP
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
// LÓGICA PRINCIPAL
// ============================================================================
async function main() {
  let successCount = 0;
  let errorCount = 0;

  log('INFO', 'FULL-BACKFILL', 'Starting FULL Stripe backfill...');

  try {
    // 1. Cargar productos de Stripe
    log('INFO', 'FULL-BACKFILL', 'Loading Stripe products...');
    const productsMap = new Map();
    for await (const prod of stripe.products.list({ limit: 100 })) {
      productsMap.set(prod.id, prod.name);
    }
    log('INFO', 'FULL-BACKFILL', `Loaded ${productsMap.size} products`);

    // 2. Cargar todas las suscripciones de Ops API (con caché)
    const opsSubs = await getAllOpsSubscriptions();

    // 3. Cargar todas las suscripciones de Stripe
    log('INFO', 'FULL-BACKFILL', 'Starting Stripe subscriptions iteration...');
    const subscriptions = stripe.subscriptions.list({
      status: 'all',
      expand: ['data.customer', 'data.customer.invoice_settings.default_payment_method']
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for await (const stripeSub of subscriptions) {
      try {
        // Buscar en Ops API
        const opsSub = findOpsSubscription(opsSubs, stripeSub.id);
        
        let backendSubscriptionId = null;
        let nupCenterId = null;
        let opsFeatures = [];

        if (opsSub) {
          backendSubscriptionId = opsSub.id;
          nupCenterId = opsSub.center.id;
          opsFeatures = opsSub.features ? opsSub.features.map(f => f.identifier) : [];
        }

        // Fallback a HubSpot si no hay features de Ops
        let centerFeatures = opsFeatures;
        if (centerFeatures.length === 0 && nupCenterId) {
          centerFeatures = await getHubspotFeatures(nupCenterId);
        }

        // Parseo de fechas (desde Stripe)
        const startDate = stripeSub.start_date ? new Date(stripeSub.start_date * 1000) : null;
        const currentPeriodStart = stripeSub.current_period_start ? new Date(stripeSub.current_period_start * 1000) : null;
        const precancelledDate = stripeSub.canceled_at ? new Date(stripeSub.canceled_at * 1000) : null;
        const cancelationDate = stripeSub.cancel_at
          ? new Date(stripeSub.cancel_at * 1000)
          : (stripeSub.status === 'canceled' && stripeSub.ended_at ? new Date(stripeSub.ended_at * 1000) : null);
        const trialEnd = stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000) : null;

        const isForever = stripeSub.cancel_at_period_end === false && stripeSub.cancel_at === null;
        const pendingPayment = stripeSub.status === 'past_due' || stripeSub.status === 'unpaid';

        // Customer
        let centerName = null;
        let pmType = null;
        const customer = stripeSub.customer;
        if (customer && typeof customer === 'object') {
          centerName = customer.name || customer.description || null;
          if (customer.invoice_settings?.default_payment_method) {
            pmType = customer.invoice_settings.default_payment_method.type;
          }
        }

        // Estado
        let parentState = stripeSub.status;
        if (parentState === 'canceled' && trialEnd && precancelledDate && precancelledDate <= trialEnd) {
          parentState = 'trial_canceled';
        } else if (parentState === 'trialing') {
          parentState = 'trial';
        }

        // Payload padre
        const payloadSub = {
          subscription_id: stripeSub.id,
          backend_subscription_id: backendSubscriptionId,
          nup_center_id: nupCenterId,
          segment: stripeSub.metadata?.segment || null,
          center_name: centerName,
          start_date: startDate,
          precancelled_date: precancelledDate,
          cancelation_date: cancelationDate,
          revoked_access_date: null,
          current_state: parentState,
          currency: stripeSub.currency ? stripeSub.currency.toUpperCase() : null,
          payment_method_type: pmType,
          is_forever: isForever,
          pending_payment: pendingPayment,
        };

        // Items
        const payloadItems = stripeSub.items.data.map(item => {
          const productId = typeof item.price.product === 'object' ? item.price.product.id : item.price.product;
          const productName = productsMap.get(productId) || 'Producto Desconocido';
          const itemPeriodEnd = stripeSub.current_period_end ? new Date(stripeSub.current_period_end * 1000) : null;

          let childStatus = parentState;
          if (['past_due', 'unpaid', 'incomplete'].includes(parentState)) {
            if (itemPeriodEnd && itemPeriodEnd > today) {
              childStatus = 'active';
            }
          }

          return {
            item_id: item.id,
            nup_center_id: nupCenterId,
            product_id: productId,
            product_name: productName,
            billing_interval: item.price.recurring?.interval || null,
            payment_frequency: item.price.recurring?.interval_count || 1,
            unit_price: item.price.unit_amount ? (item.price.unit_amount / 100) : null,
            features: JSON.stringify(centerFeatures),
            quantity: item.quantity,
            start_date: startDate,
            current_period_start: currentPeriodStart,
            current_period_end: itemPeriodEnd,
            is_forever: isForever,
            status: childStatus,
            precancelled_date: precancelledDate
          };
        });

        await upsertSubscription(payloadSub, payloadItems);

        successCount++;
        if (successCount % 50 === 0) {
          log('INFO', 'FULL-BACKFILL', `Processed ${successCount} subscriptions...`);
        }
        await delay(50);

      } catch (rowError) {
        log('ERROR', 'FULL-BACKFILL', `Error on ${stripeSub.id}: ${rowError.message}`);
        errorCount++;
      }
    }

    log('INFO', 'FULL-BACKFILL', `✅ Done. Success: ${successCount} | Errors: ${errorCount}`);

  } catch (error) {
    log('ERROR', 'FULL-BACKFILL', `Fatal error: ${error.message}`);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

main();