const { upsertSubscriptionData, updateInvoiceData, markHubspotSyncStatus } = require('../db/dbSubscriptions');
const { syncSingleSubscriptionToHubspot } = require('./hubspotServices');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { log } = require("../utils/logger");


// ==========================================
// Constantes para Ops API
// ==========================================
const OPS_API_URL = 'https://api.neuronup.com/ops/subscriptions';
const OPS_API_TOKEN = process.env.OPS_API_TOKEN || '6p48*mf65TH$cU**';

function formatStripeDate(unixTimestamp) {
  if (!unixTimestamp) return null; 
  return new Date(unixTimestamp * 1000).toISOString();
}


async function getHubspotFeatures(nupCenterId) {
  if (!nupCenterId) return [];

  try {
    const response = await fetch('https://api.hubapi.com/crm/v3/objects/companies/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.HUBSPOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        filterGroups: [{
          filters: [{
            propertyName: "nup_center_id",
            operator: "EQ",
            value: nupCenterId
          }]
        }],
        properties: ["subscription_features"]
      })
    });

    if (!response.ok) {
      log("WARN", "HUBSPOT", `API error: ${response.status} for center ${nupCenterId}`);
      return [];
    }

    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      const rawFeatures = data.results[0].properties.subscription_features;
      if (!rawFeatures) return [];
      
      return rawFeatures.split(/[,;]/).map(f => f.trim()).filter(Boolean); 
    }
    return [];
  } catch (error) {
    log("ERROR", "HUBSPOT", `Request failed for center ${nupCenterId}: ${error.message}`);
    return [];
  }
}

async function fetchLatestSubscription(subId) {
  try {
    return await stripe.subscriptions.retrieve(subId, {
      expand: ['default_payment_method']
    });
  } catch (error) {
    log("ERROR", "SUBSCRIPTION-SERVICE", `Failed to fetch live subscription ${subId} from Stripe.`);
    throw error;
  }
}


// ==========================================
// Función para obtener datos de Ops API (TODAS las páginas)
// ==========================================
async function fetchSubscriptionFromOps(stripeSubscriptionId) {
  try {
    let page = 1;
    const maxPages = 400; // Límite de seguridad

    while (page <= maxPages) {
      const url = `${OPS_API_URL}?page=${page}&kind=stripe`;
      const response = await fetch(url, {
        headers: {
          'X-Api-Token': OPS_API_TOKEN,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        log('WARN', 'OPS-API', `Failed to fetch page ${page}: ${response.status}`);
        return null;
      }

      const subscriptions = await response.json();

      if (!subscriptions || subscriptions.length === 0) {
        // No hay más páginas
        log('WARN', 'OPS-API', `Subscription ${stripeSubscriptionId} not found in Ops API (searched ${page - 1} pages)`);
        return null;
      }

      const found = subscriptions.find(s => s.stripeSubscriptionId === stripeSubscriptionId);

      if (found) {
        log('INFO', 'OPS-API', `Found subscription ${stripeSubscriptionId} in Ops API (page ${page})`);
        return {
          backendSubscriptionId: found.id,
          nupCenterId: found.center.id,
          features: found.features ? found.features.map(f => f.identifier) : []
        };
      }

      page++;
    }

    log('WARN', 'OPS-API', `Subscription ${stripeSubscriptionId} not found after ${maxPages} pages`);
    return null;

  } catch (error) {
    log('ERROR', 'OPS-API', `Error fetching from Ops API: ${error.message}`);
    return null;
  }
}


// ==========================================
// FUNCIÓN PRINCIPAL
// ==========================================
async function processSubscriptionUpsert(event) {
  const subId = event.data.object.id;
  const subscription = await fetchLatestSubscription(subId);

  log("INFO", "SUBSCRIPTION-SERVICE", `Subscription Upsert: ${subId}`);

  // ─── 1. OBTENER DATOS DE OPS API ──────────────────────────────────────
  const opsData = await fetchSubscriptionFromOps(subId);
  
  let nupCenterId = null;
  let backendSubscriptionId = null;
  let opsFeatures = [];

  if (opsData) {
    nupCenterId = opsData.nupCenterId;
    backendSubscriptionId = opsData.backendSubscriptionId;
    opsFeatures = opsData.features;
    log("INFO", "OPS-API", `Using Ops API data: center=${nupCenterId}, backendId=${backendSubscriptionId}`);
  } else {
    log("WARN", "OPS-API", `Falling back to HubSpot for ${subId}`);
  }

  // ─── 2. OBTENER CUSTOMER DE STRIPE ────────────────────────────────────
  const customer = await stripe.customers.retrieve(subscription.customer, {
    expand: ['invoice_settings.default_payment_method']
  });
  
  const nupCenterIdFromStripe = customer.metadata?.nup_center_id || null;
  const centerName = customer.name || customer.description || null;

  // ─── 3. PAYMENT METHOD ─────────────────────────────────────────────────
  let paymentMethodType = null;
  if (subscription.default_payment_method) {
    paymentMethodType = subscription.default_payment_method.type;
  } else if (customer.invoice_settings?.default_payment_method) {
    paymentMethodType = customer.invoice_settings.default_payment_method.type;
  }

  // ─── 4. FEATURES: Priorizar Ops API, fallback a HubSpot ──────────────
  let centerFeatures = [];
  if (opsData) {
    centerFeatures = opsFeatures;
    log("INFO", "FEATURES", `Using ${centerFeatures.length} features from Ops API`);
  } else if (nupCenterIdFromStripe) {
    centerFeatures = await getHubspotFeatures(nupCenterIdFromStripe);
    log("INFO", "FEATURES", `Fallback: ${centerFeatures.length} features from HubSpot for center ${nupCenterIdFromStripe}`);
  }

  // ─── 5. PENDING PAYMENT ────────────────────────────────────────────────
  const openInvoices = await stripe.invoices.list({ subscription: subId, status: 'open', limit: 1 });
  const pendingPayment = openInvoices.data.length > 0;

  // ─── 6. FECHAS ──────────────────────────────────────────────────────────
  const startDate = formatStripeDate(subscription.start_date);
  const precancelledDate = formatStripeDate(subscription.canceled_at);
  
  let cancelationDate = null;
  if (subscription.cancel_at) {
    cancelationDate = formatStripeDate(subscription.cancel_at);
  } else if (subscription.status === 'canceled') {
    cancelationDate = formatStripeDate(subscription.ended_at || subscription.canceled_at);
  }

  const revokedAccessDate = cancelationDate;
  const isForever = (subscription.cancel_at_period_end === false && subscription.cancel_at === null);

  // ─── 7. ESTADO ──────────────────────────────────────────────────────────
  let parentState = subscription.status;
  const trialEnd = subscription.trial_end;
  if (parentState === 'canceled' && trialEnd && subscription.canceled_at && subscription.canceled_at <= trialEnd) {
    parentState = 'trial_canceled';
  } else if (parentState === 'trialing') {
    parentState = 'trial';
  }

  // ─── 8. ITEMS ──────────────────────────────────────────────────────────
  const subscriptionItems = [];
  const items = subscription.items.data;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const item of items) {
    const stripeItemId = item.id;
    const productId = item.price.product;
    const quantity = item.quantity;
    const unitPrice = item.price.unit_amount ? item.price.unit_amount / 100 : null;
    const billingInterval = item.price.recurring?.interval || 'month';
    const paymentFrequency = item.price.recurring?.interval_count || 1;

    let product = { name: 'Producto Desconocido', metadata: {} };
    try {
      product = await stripe.products.retrieve(productId);
    } catch (error) {
      log('WARN', 'STRIPE', `Product ${productId} not found in Stripe. Using fallback.`);
    }

    let childStatus = parentState;
    const itemPeriodEndStr = formatStripeDate(item.current_period_end || subscription.current_period_end);
    const itemPeriodEndDate = itemPeriodEndStr ? new Date(itemPeriodEndStr) : null;

    if (['past_due', 'unpaid', 'incomplete'].includes(parentState)) {
      if (itemPeriodEndDate && itemPeriodEndDate > today) {
        childStatus = 'active';
      }
    }

    subscriptionItems.push({
      item_id: stripeItemId,
      hubspot_item_id: null,
      subscription_id: subId,
      nup_center_id: nupCenterId,
      product_id: productId,
      product_name: product.name,
      billing_interval: billingInterval,
      payment_frequency: paymentFrequency,
      unit_price: unitPrice,
      features: JSON.stringify(centerFeatures),
      quantity: quantity,
      start_date: formatStripeDate(item.created),
      current_period_start: formatStripeDate(item.current_period_start || subscription.current_period_start),
      current_period_end: itemPeriodEndStr,
      is_forever: isForever,
      number_of_renovations: 0,
      status: childStatus,
      precancelled_date: precancelledDate
    });
  }

  // ─── 9. PAYLOAD FINAL ──────────────────────────────────────────────────
  const payload = {
    subscription_id: subId,
    hubspot_subscription_id: null,
    nup_center_id: nupCenterId,
    backend_subscription_id: backendSubscriptionId,
    segment: subscription.metadata?.segment || null,
    manages_own_payment: null,
    center_name: centerName,
    start_date: startDate,
    precancelled_date: precancelledDate,
    cancelation_date: cancelationDate,
    revoked_access_date: revokedAccessDate,
    current_state: parentState,
    currency: subscription.currency ? subscription.currency.toUpperCase() : 'EUR',
    creation_source: null,
    source: 'stripe',
    payment_method_type: paymentMethodType,
    market: null,
    is_forever: isForever,
    pending_payment: pendingPayment,
    items: subscriptionItems,
    stripe_event_id: event.id,
    event_type: event.type,
    event_date: formatStripeDate(event.created),
    raw_payload: event
  };

  await upsertSubscriptionData(payload);
  log("INFO", "SUBSCRIPTION-SERVICE", `Upsert routed to DB for ${subId}`);

  syncSingleSubscriptionToHubspot(subId).then(async (result) => {
    if (result === true) {
      await markHubspotSyncStatus(subId, 'SYNCED');
    } else if (result === 'NO_COMPANY') {
      await markHubspotSyncStatus(subId, 'FAILED_NO_COMPANY');
    } else if (result === 'SKIPPED_STATE') {
      await markHubspotSyncStatus(subId, 'SKIPPED_STATE');
    } else {
      await markHubspotSyncStatus(subId, 'FAILED');
    }
  });
}

async function processInvoiceEvent(event) {
  const invoice = event.data.object;
  const subId = invoice.subscription || invoice.parent?.subscription_details?.subscription;

  if (!subId) {
    log("INFO", "SUBSCRIPTION-SERVICE", `Ignored Invoice ${invoice.id} / No subscription attached`);
    return;
  }

  log("INFO", "SUBSCRIPTION-SERVICE", `Processing Invoice for Sub: ${subId}`);

  const liveSubscription = await fetchLatestSubscription(subId);
  await processSubscriptionUpsert({
    id: `manual_fetch_for_invoice_${event.id}`, 
    type: 'customer.subscription.updated',
    created: event.created,
    data: { object: liveSubscription }
  });

  const status = invoice.status; 
  const amount = invoice.amount_due ? (invoice.amount_due / 100) : 0;
  const invoiceDate = formatStripeDate(invoice.created); 

  const paidItemIds = [];
  if (event.type === 'invoice.paid') {
    for (const line of invoice.lines.data) {
      const stripeItemId = line.parent?.subscription_item_details?.subscription_item || line.subscription_item;
      if (stripeItemId) {
        paidItemIds.push(stripeItemId);
      }
    }
  }

  const payload = {
    subscription_id: subId,
    last_invoice_status: status,
    last_invoice_amount: amount,
    last_invoice_date: invoiceDate,
    paid_items: paidItemIds, 
    stripe_event_id: event.id,
    event_type: event.type,
    raw_payload: event
  };

  await updateInvoiceData(payload);
  log("INFO", "SUBSCRIPTION-SERVICE", `Invoice data routed to DB for ${subId}`);

  syncSingleSubscriptionToHubspot(subId).then(async (result) => {
    if (result === true) {
      await markHubspotSyncStatus(subId, 'SYNCED');
    } else if (result === 'NO_COMPANY') {
      await markHubspotSyncStatus(subId, 'FAILED_NO_COMPANY');
    } else if (result === 'SKIPPED_STATE') {
      await markHubspotSyncStatus(subId, 'SKIPPED_STATE');
    } else {
      await markHubspotSyncStatus(subId, 'FAILED');
    }
  });
}

module.exports = { 
  processSubscriptionUpsert, 
  processInvoiceEvent
};