const { upsertSubscriptionData, updateInvoiceData, markHubspotSyncStatus } = require('../db/dbSubscriptions');
const { syncSingleSubscriptionToHubspot } = require('./hubspotServices');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { log } = require("../utils/logger");

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
      
      // HubSpot suele separar los campos multiselección por punto y coma (;) o comas (,)
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

async function processSubscriptionUpsert(event) {
  const subId = event.data.object.id;
  const subscription = await fetchLatestSubscription(subId);

  log("INFO", "SUBSCRIPTION-SERVICE", `Subscription Upsert: ${subId}`);

  const customer = await stripe.customers.retrieve(subscription.customer, {
    expand: ['invoice_settings.default_payment_method']
  });
  
  const nupCenterId = customer.metadata?.nup_center_id || null;
  const centerName = customer.name || customer.description || null;

  let paymentMethodType = null;
  if (subscription.default_payment_method) {
    paymentMethodType = subscription.default_payment_method.type; 
  } else if (customer.invoice_settings?.default_payment_method) {
    paymentMethodType = customer.invoice_settings.default_payment_method.type;
  }

  let centerFeatures = [];
  if (nupCenterId) {
    centerFeatures = await getHubspotFeatures(nupCenterId);
    log("INFO", "HUBSPOT", `Extracted ${centerFeatures.length} features for center ${nupCenterId}`);
  }

  const openInvoices = await stripe.invoices.list({ subscription: subId, status: 'open', limit: 1 });
  const pendingPayment = openInvoices.data.length > 0;

  // --- LÓGICA DE FECHAS CRUZADAS ---
  const startDate = formatStripeDate(subscription.start_date);
  const precancelledDate = formatStripeDate(subscription.canceled_at); // Cuando dieron al botón
  
  // Cuando caduca de verdad (si está muerta o programada para morir)
  let cancelationDate = null;
  if (subscription.cancel_at) {
    // Si la dejaste programada para final de mes (Stripe usa cancel_at)
    cancelationDate = formatStripeDate(subscription.cancel_at);
  } else if (subscription.status === 'canceled') {
    // Si la has matado HOY fulminantemente (Stripe usa ended_at o canceled_at)
    cancelationDate = formatStripeDate(subscription.ended_at || subscription.canceled_at);
  }

  const revokedAccessDate = cancelationDate; 
  const isForever = (subscription.cancel_at_period_end === false && subscription.cancel_at === null);

  // --- INFERENCIA DEL TRIAL_CANCELED ---
  let parentState = subscription.status;
  const trialEnd = subscription.trial_end;
  if (parentState === 'canceled' && trialEnd && subscription.canceled_at && subscription.canceled_at <= trialEnd) {
    parentState = 'trial_canceled';
  } else if (parentState === 'trialing') {
    parentState = 'trial';
  }

  const subscriptionItems = [];
  const items = subscription.items.data;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const item of items) {
    const stripeItemId = item.id; 
    const productId = item.price.product; 
    const quantity = item.quantity;
    const unitPrice = item.price.unit_amount ? item.price.unit_amount / 100 : null; // ✅ Céntimos a Euros
    const billingInterval = item.price.recurring?.interval || 'month';
    const paymentFrequency = item.price.recurring?.interval_count || 1;

    // Metadato del producto (Por si en el futuro los rellenáis ahí)
    const product = await stripe.products.retrieve(productId);
    const featureName = product.metadata?.entitlement_feature;
    const featuresArray = featureName ? [featureName] : [];

    // --- HERENCIA CONDICIONADA DEL HIJO ---
    let childStatus = parentState;
    const itemPeriodEndStr = formatStripeDate(item.current_period_end || subscription.current_period_end);
    const itemPeriodEndDate = itemPeriodEndStr ? new Date(itemPeriodEndStr) : null;

    if (['past_due', 'unpaid', 'incomplete'].includes(parentState)) {
      if (itemPeriodEndDate && itemPeriodEndDate > today) {
        childStatus = 'active'; // Sigue pagada
      }
    }

    subscriptionItems.push({
      item_id: stripeItemId,           // ✨ Modificado para BD
      hubspot_item_id: null,           
      subscription_id: subId,
      nup_center_id: nupCenterId,
      product_id: productId,           // ✨ Modificado para BD
      product_name: product.name,
      billing_interval: billingInterval,
      payment_frequency: paymentFrequency,
      unit_price: unitPrice,
      features: JSON.stringify(centerFeatures), // ✨ NUEVO: Inyección directa desde HubSpot
      quantity: quantity,
      start_date: formatStripeDate(item.created),
      current_period_start: formatStripeDate(item.current_period_start || subscription.current_period_start),
      current_period_end: itemPeriodEndStr,
      is_forever: isForever,
      number_of_renovations: 0,
      
      status: childStatus,             // ✨ Estado evaluado
      precanceled_date: precancelledDate
    });
  }

  const payload = {
    subscription_id: subId,
    hubspot_subscription_id: null,    
    nup_center_id: nupCenterId,
    segment: subscription.metadata?.segment || null,                    
    manages_own_payment: null,   
    center_name: centerName,          // ✨ Rescatado del customer      
    start_date: startDate,
    precancelled_date: precancelledDate, // ✨ Corregido
    cancelation_date: cancelationDate,
    revoked_access_date: revokedAccessDate,
    current_state: parentState,       // ✨ Estado evaluado
    currency: subscription.currency ? subscription.currency.toUpperCase() : 'EUR', 
    creation_source: null,
    source: 'stripe',                 // ✨ Faltaba
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

  syncSingleSubscriptionToHubspot(subId).then(async (success) => {
    if (success) {
      await markHubspotSyncStatus(subId, 'SYNCED');
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

  // Fetch fresco de la suscripción para asegurarnos de que el estado general se actualiza
  const liveSubscription = await fetchLatestSubscription(subId);
  await processSubscriptionUpsert({
    id: `manual_fetch_for_invoice_${event.id}`, 
    type: 'customer.subscription.updated',
    created: event.created,
    data: { object: liveSubscription }
  });

  const status = invoice.status; 
  const amount = invoice.amount_due ? (invoice.amount_due / 100) : 0; // ✅ Céntimos a Euros
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

  syncSingleSubscriptionToHubspot(subId).then(async (success) => {
    if (success) {
      await markHubspotSyncStatus(subId, 'SYNCED');
    }

  });
}

module.exports = { 
  processSubscriptionUpsert, 
  processInvoiceEvent
};