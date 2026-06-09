const {upsertSubscriptionData, updateInvoiceData} = require('../db/dbQueries');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { log } = require("../utils/logger");


function formatStripeDate(unixTimestamp) {
  if (!unixTimestamp) return null; 
  return new Date(unixTimestamp * 1000).toISOString();
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




// ────── Function: processSubscriptionUpsert ─────────────────────────────────────────
// ─── Get the upserted subcription id from the event.
// ─── Fetch Stripe API for that subscription.
// ─── Extract data, dates and format it. 
// ─── Loop through subscription.items.
// ─── Call Stripe API to fetch product metadata for each item.
// ─── Build the parent and child data objects.
// ─── Call dbQueries.js to upsert the data.          
// ──────────────────────────────────────────────────────────────────────────────────

async function processSubscriptionUpsert(event) {

  const subId = event.data.object.id;
  const subscription = await fetchLatestSubscription(subId);

  log("INFO", "SUBSCRIPTION-SERVICE", `Subscription Upsert: ${subId}`);


  const customer = await stripe.customers.retrieve(subscription.customer, {
    expand: ['invoice_settings.default_payment_method']
  });
  const nupCenterId = customer.metadata?.nup_center_id || null;

  let paymentMethodType = null;

  if (subscription.default_payment_method) {
    paymentMethodType = subscription.default_payment_method.type; 
  } else if (customer.invoice_settings?.default_payment_method) {
    paymentMethodType = customer.invoice_settings.default_payment_method.type;
  }

  const openInvoices = await stripe.invoices.list({ subscription: subId, status: 'open', limit: 1 });
  const pendingPayment = openInvoices.data.length > 0

  console.log("Extracted Payment Type:", paymentMethodType);

  const startDate = formatStripeDate(subscription.start_date);
  let precancelledDate = null;
  let cancellationDate = null;
  let revokedAccessDate = null; 

  if (subscription.cancel_at) {
    precancelledDate = formatStripeDate(subscription.canceled_at); 
    cancellationDate = formatStripeDate(subscription.cancel_at);   
    revokedAccessDate = formatStripeDate(subscription.cancel_at); 
  } else if (subscription.status === 'canceled') {
    cancellationDate = formatStripeDate(subscription.canceled_at); 
    revokedAccessDate = formatStripeDate(subscription.canceled_at);
  }

  const isForever = (subscription.cancel_at === null && subscription.status !== 'canceled');
  const sourceCreation = null;


  const subscriptionItems = [];

  let hasDurationMismatch = false;

  const items = subscription.items.data;

  for (const item of items) {

    const stripeItemId = item.id; 
    const productId = item.price.product; 
    const quantity = item.quantity;
    const unitPrice = item.price.unit_amount / 100; 
    const billingInterval = item.price.recurring?.interval || 'one_time';

    const intervalCount = item.price.recurring?.interval_count || 1;
    
    const itemStartDate = formatStripeDate(item.created); 

    const itemPeriodStart = formatStripeDate(item.current_period_start);

    const itemPeriodEnd = formatStripeDate(item.current_period_end);

    const product = await stripe.products.retrieve(productId);

    const featureName = product.metadata?.entitlement_feature;
    const featuresArray = featureName ? [featureName] : [];

    if (subscription.cancel_at && item.current_period_end > subscription.cancel_at) {
      hasDurationMismatch = true;
    }

    subscriptionItems.push({
      stripe_item_id: stripeItemId,
      stripe_product_id: productId,
      product_name: product.name,
      billing_interval: billingInterval,
      interval_count: intervalCount,
      unit_price: unitPrice,
      quantity: quantity,
      start_date: itemStartDate,
      current_period_start: itemPeriodStart, 
      current_period_end: itemPeriodEnd,    
      is_forever: isForever,
      features: JSON.stringify(featuresArray) 
    });
  }

  const payload = {
    stripe_subscription_id: subId,
    nup_center_id: nupCenterId,
    start_date: startDate,
    is_forever: isForever, 
    precancelled_date: precancelledDate,
    cancellation_date: cancellationDate,
    hasDurationMismatch: hasDurationMismatch,
    revokedAccessDate: revokedAccessDate,
    current_state: subscription.status,
    source: 'stripe',
    sourceCreation: sourceCreation,
    payment_method_type: paymentMethodType,
    market: null,           
    paymentMethodType: paymentMethodType,   
    pendingPayment: pendingPayment,
    items: subscriptionItems,
    stripe_event_id: event.id,
    event_type: event.type,
    raw_payload: event
  };

  await upsertSubscriptionData(payload);

  log("INFO", "SUBSCRIPTION-SERVICE", `Upsert routed to DB for ${subId}`);
}


// ─── processInvoiceEvent ─────────────────────────────────────────
    // 1. Check if invoice.subscription exists (ignore one-offs).
    // 2. Extract amount_paid, status, and generated dates.
    // 3. Look inside invoice.lines to find the specific stripe_item_id ('si_...').
    // 4. Call dbQueries.js to increment the item's number_of_renovations.
    // 5. Call dbQueries.js to update the parent's last_invoice_* columns.
// ──────────────────────────────────────────────────────────────────────────────────
async function processInvoiceEvent(event) {
  const invoice = event.data.object;
  
  const subId = invoice.parent?.subscription_details?.subscription;

  if (!subId) {
    log("INFO", "SUBSCRIPTION-SERVICE", `Ignored Invoice ${invoice.id} / No subscription attached`);
    return;
  }

  log("INFO", "SUBSCRIPTION-SERVICE", `Processing Invoice for Sub: ${subId}`);

  const liveSubscription = await fetchLatestSubscription(subId);

  await processSubscriptionUpsert({
    id: `manual_fetch_for_invoice_${event.id}`, 
    type: 'customer.subscription.updated',
    data: { object: liveSubscription }
  });

  const status = invoice.status; 
  const amount = (status === 'paid' ? invoice.amount_paid : invoice.amount_due) / 100; 
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
    stripe_subscription_id: subId,
    last_invoice_id: invoice.id,
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
}


module.exports = { 
  processSubscriptionUpsert, 
  processInvoiceEvent
  
};