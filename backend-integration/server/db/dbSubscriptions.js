const { pool } = require('./db');
const { log } = require("../utils/logger");

async function getSubscriptionByCenterId(centerId) {
  try {
    const query = `
      SELECT 
        s.subscription_id,
        s.hubspot_subscription_id,
        s.nup_center_id,
        s.segment,
        s.manages_own_payment,
        s.center_name,
        s.start_date,
        s.precancelled_date,
        s.cancelation_date,
        s.revoked_access_date,
        s.current_state,
        s.currency,
        s.creation_source,
        s.source,
        s.payment_method_type,
        s.market,
        s.is_forever,
        s.pending_payment,
        s.updated_at,
        json_agg(
          json_build_object(
            'item_id', si.item_id,
            'hubspot_item_id', si.hubspot_item_id,
            'subscription_id', si.subscription_id,
            'nup_center_id', si.nup_center_id,
            'product_id', si.product_id,
            'product_name', si.product_name,
            'billing_interval', si.billing_interval,
            'payment_frequency', si.payment_frequency,
            'unit_price', si.unit_price,
            'features', si.features,
            'quantity', si.quantity,
            'start_date', si.start_date,
            'current_period_start', si.current_period_start,
            'current_period_end', si.current_period_end,
            'is_forever', si.is_forever,
            'status', si.status,
            'precanceled_date', si.precanceled_date,
            'updated_at', si.updated_at
          )
        ) as items
      FROM subscriptions s
      LEFT JOIN subscription_items si ON s.subscription_id = si.subscription_id
      WHERE s.nup_center_id = $1
      GROUP BY 
        s.subscription_id
      ORDER BY MAX(si.current_period_end) DESC NULLS LAST, s.updated_at DESC;
    `;

    const result = await pool.query(query, [centerId]);
    
    if (result.rowCount === 0) return null;

    const allSubs = result.rows;

    allSubs.forEach(sub => {
      if (sub.items && Array.isArray(sub.items)) {
        sub.items = sub.items.filter(item => item.item_id !== null);
      } else {
        sub.items = [];
      }
    });

    const activeStates = ['active', 'trial', 'trialing', 'past_due'];
    let activeSub = allSubs.find(s => activeStates.includes(s.current_state));

    if (!activeSub) {
      activeSub = allSubs[0]; 
    }

    let activeFeatures = [];
    activeSub.items.forEach(item => {
      if ((item.status === 'active' || activeSub.is_forever) && item.features && Array.isArray(item.features)) {
        activeFeatures = [...activeFeatures, ...item.features];
      }
    });

    return {
      ...activeSub,
      features: [...new Set(activeFeatures)],
      history: allSubs
    };

  } catch (error) {
    return { error: error.message };
  }
}

async function upsertSubscriptionData(data) {
  const client = await pool.connect();
  
  // Seguro de vida para las variables conflictivas
  const is_forever = data.is_forever !== undefined ? data.is_forever : data.isForever;
  const pending_payment = data.pending_payment !== undefined ? data.pending_payment : data.pendingPayment;
  const safePrecancelledDate = data.precancelled_date || data.precanceled_date || null;

  try {
    log("INFO", "SUBSCRIPTION", `Starting DB transaction for ${data.event_type}`, { subId: data.subscription_id });
    await client.query('BEGIN');

    // ==========================================
    // 1. UPSERT PADRE (DOBLE 'L')
    // ==========================================
    await client.query(
      `INSERT INTO subscriptions (
         subscription_id, hubspot_subscription_id, nup_center_id, segment, 
         manages_own_payment, center_name, start_date, precancelled_date, 
         cancelation_date, revoked_access_date, current_state, currency, 
         creation_source, source, payment_method_type, market, last_invoice_status, 
         last_invoice_amount, last_invoice_date, is_forever, pending_payment, updated_at
       ) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, CURRENT_TIMESTAMP)
       ON CONFLICT (subscription_id) 
       DO UPDATE SET 
         hubspot_subscription_id = EXCLUDED.hubspot_subscription_id,
         nup_center_id = EXCLUDED.nup_center_id,
         segment = EXCLUDED.segment,
         manages_own_payment = EXCLUDED.manages_own_payment,
         center_name = EXCLUDED.center_name,
         start_date = EXCLUDED.start_date,
         precancelled_date = EXCLUDED.precancelled_date,
         cancelation_date = EXCLUDED.cancelation_date,
         revoked_access_date = EXCLUDED.revoked_access_date,
         current_state = EXCLUDED.current_state,
         currency = EXCLUDED.currency,
         creation_source = EXCLUDED.creation_source,
         payment_method_type = EXCLUDED.payment_method_type,
         market = EXCLUDED.market,
         is_forever = EXCLUDED.is_forever,
         pending_payment = EXCLUDED.pending_payment,
         hubspot_sync_status = 'PENDING'
         updated_at = CURRENT_TIMESTAMP`,
      [
        data.subscription_id, data.hubspot_subscription_id, data.nup_center_id, data.segment, 
        data.manages_own_payment, data.center_name, data.start_date, safePrecancelledDate, 
        data.cancelation_date, data.revoked_access_date, data.current_state, data.currency, 
        data.creation_source, data.source || 'stripe', data.payment_method_type, data.market, data.last_invoice_status, 
        data.last_invoice_amount, data.last_invoice_date, is_forever, pending_payment
      ]
    );

    // ==========================================
    // 2. UPSERT HIJOS (UNA SOLA 'L')
    // ==========================================
    if (data.items && data.items.length > 0) {
      const currentItemIds = data.items.map(item => item.item_id);

      // Limpiar los que ya no están
      await client.query(
        `UPDATE subscription_items 
         SET 
           status = 'canceled', 
           precanceled_date = COALESCE(precanceled_date, $3, CURRENT_DATE),
           updated_at = CURRENT_TIMESTAMP
         WHERE subscription_id = $1 AND item_id != ALL($2)`,
        [data.subscription_id, currentItemIds, data.event_date]
      );

      // Insertar o actualizar los vigentes
      for (const item of data.items) {
        const itemFrequency = item.payment_frequency || item.interval_count || 1;
        const itemIsForever = item.is_forever !== undefined ? item.is_forever : is_forever;
        const safeItemPrecanceledDate = item.precanceled_date || item.precancelled_date || safePrecancelledDate;

        await client.query(
          `INSERT INTO subscription_items (
             item_id, hubspot_item_id, subscription_id, nup_center_id, 
             product_id, product_name, billing_interval, payment_frequency, unit_price, 
             features, quantity, start_date, current_period_start, current_period_end, 
             is_forever, number_of_renovations, status, precanceled_date, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, CURRENT_TIMESTAMP)
           ON CONFLICT (item_id) 
           DO UPDATE SET 
             hubspot_item_id = EXCLUDED.hubspot_item_id,
             subscription_id = EXCLUDED.subscription_id,
             nup_center_id = EXCLUDED.nup_center_id,
             product_id = EXCLUDED.product_id,
             product_name = EXCLUDED.product_name,
             billing_interval = EXCLUDED.billing_interval,
             payment_frequency = EXCLUDED.payment_frequency,
             unit_price = EXCLUDED.unit_price,
             features = EXCLUDED.features,
             quantity = EXCLUDED.quantity,
             start_date = EXCLUDED.start_date,
             current_period_start = EXCLUDED.current_period_start,
             current_period_end = EXCLUDED.current_period_end,
             is_forever = EXCLUDED.is_forever,
             status = EXCLUDED.status,
             precanceled_date = EXCLUDED.precanceled_date,
             updated_at = CURRENT_TIMESTAMP`,
          [
            item.item_id, item.hubspot_item_id, data.subscription_id, item.nup_center_id, 
            item.product_id, item.product_name, item.billing_interval, itemFrequency, 
            item.unit_price, item.features, item.quantity, item.start_date, 
            item.current_period_start, item.current_period_end, itemIsForever, 
            item.number_of_renovations || 0, item.status, safeItemPrecanceledDate
          ]
        );
      }
    } else {
      // Si vienen 0 ítems
      await client.query(
        `UPDATE subscription_items 
         SET 
           status = 'canceled', 
           precanceled_date = COALESCE(precanceled_date, $2, CURRENT_DATE), 
           updated_at = CURRENT_TIMESTAMP 
         WHERE subscription_id = $1`, 
        [data.subscription_id, data.event_date]
      );
    }

    // ==========================================
    // 3. REGISTRO DEL EVENTO
    // ==========================================
    await client.query(
      `INSERT INTO subscription_events (event_id, subscription_id, event_type, raw_payload)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (event_id) DO NOTHING`,
      [data.stripe_event_id, data.subscription_id, data.event_type, JSON.stringify(data.raw_payload)]
    );

    await client.query('COMMIT');
    log("INFO", "SUBSCRIPTION", `Successfully committed transaction`, { subId: data.subscription_id });

  } catch (error) {
    await client.query('ROLLBACK');
    log("ERROR", "SUBSCRIPTION", "Transaction failed, rolling back", { error: error.message, subId: data.subscription_id });
    throw error; 
  } finally {
    client.release();
  }
}

async function updateInvoiceData(data) {
  const client = await pool.connect();
  
  const {
    subscription_id, last_invoice_status, last_invoice_amount,
    last_invoice_date, paid_items, stripe_event_id, event_type, raw_payload
  } = data;

  try {
    await client.query('BEGIN');

    const isPaid = last_invoice_status === 'paid';
    
    await client.query(
      `UPDATE subscriptions 
       SET 
         last_invoice_status = $1,
         last_invoice_amount = $2,
         last_invoice_date = $3,
         pending_payment = CASE WHEN $4 = TRUE THEN FALSE ELSE pending_payment END,
         updated_at = CURRENT_TIMESTAMP
       WHERE subscription_id = $5`,
      [last_invoice_status, last_invoice_amount, last_invoice_date, isPaid, subscription_id]
    );

    if (paid_items && paid_items.length > 0) {
      for (const item_id of paid_items) {
        await client.query(
          `UPDATE subscription_items 
           SET 
             number_of_renovations = COALESCE(number_of_renovations, 0) + 1,
             updated_at = CURRENT_TIMESTAMP
           WHERE item_id = $1`, // ✨ item_id
          [item_id]
        );
      }
    }

    await client.query(
      `INSERT INTO subscription_events (event_id, subscription_id, event_type, raw_payload)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (event_id) DO NOTHING`,
      [data.stripe_event_id, data.subscription_id, data.event_type, JSON.stringify(data.raw_payload)]
    );

    await client.query('COMMIT');
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}


async function markHubspotSyncStatus(subscriptionId, status) {
  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE subscriptions SET hubspot_sync_status = $1 WHERE subscription_id = $2`,
      [status, subscriptionId]
    );
  } catch (error) {
    console.error(`[ERROR] No se pudo actualizar el estado de sync a ${status} para ${subscriptionId}:`, error.message);
  } finally {
    client.release();
  }
}

module.exports = { 
  getSubscriptionByCenterId,
  upsertSubscriptionData,
  updateInvoiceData,
  markHubspotSyncStatus
};