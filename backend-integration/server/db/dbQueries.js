const { pool } = require('./db');
const { log } = require("../utils/logger")


// ────── Function to get analytics from database ───────────────────── 
// ─── We query center events and daily results
// ─── We use parameterized queries to prevent SQL injection attacks
// ────────────────────────────────────────────────────────────────────
async function getAnalyticsByCenterId(centerId) {
  if (!centerId) return null;
  
  try {
    log("INFO", "ANALYTICS", "Fetching analytics", { centerId });

    // 1. Totales: Sumamos todo al vuelo desde la tabla de estadísticas diarias
    const totalsResult = await pool.query(
      `SELECT 
         COALESCE(SUM(total_logins), 0) AS total_logins,
         COALESCE(SUM(activities_started), 0) AS total_activities,
         COALESCE(SUM(sessions_created), 0) AS total_sessions_created,
         COALESCE(SUM(sessions_assigned), 0) AS total_sessions_assigned,
         COALESCE(SUM(sessions_started), 0) AS total_sessions_started,
         COALESCE(SUM(sessions_finished), 0) AS total_sessions_finished,
         COALESCE(SUM(tests_started), 0) AS total_tests_started,
         COALESCE(SUM(tests_finished), 0) AS total_tests_finished,
         COALESCE(SUM(reports_created), 0) AS total_reports_created,
         COALESCE(SUM(exercises_downloaded), 0) AS total_exercises,
         COALESCE(SUM(materials_downloaded), 0) AS total_materials,
         MAX(stat_date) AS last_activity_date
       FROM daily_stats 
       WHERE center_id = $1`,
      [String(centerId)]
    );
    
    // 2. Gráficas: Evolución diaria (excluimos id y center_id para no engordar el JSON)
    const dailyResult = await pool.query(
      `SELECT 
         stat_date,
         active_therapists,
         total_logins,
         activities_started,
         sessions_created,
         sessions_assigned,
         sessions_started,
         sessions_finished,
         tests_started,
         tests_finished,
         reports_created,
         exercises_downloaded,
         materials_downloaded
       FROM daily_stats 
       WHERE center_id = $1 
       ORDER BY stat_date ASC`,
      [String(centerId)]
    );

    if (dailyResult.rows.length === 0) {
      log("WARN", "ANALYTICS", "No analytics found", { centerId });
      return null;
    }

    log("INFO", "ANALYTICS", "Analytics fetched successfully", { centerId });
  
    return {
      totals: totalsResult.rows[0],
      daily: dailyResult.rows
    };
  } catch (error) {
    log("ERROR", "ANALYTICS", "Error fetching analytics", { error: error.message });
    return { error: error.message };
  }
}


// Añade esto en tu archivo de consultas a la BD (dbQueries.js)
async function getSubscriptionByCenterId(centerId) {
  try {
    const query = `
      SELECT 
        s.current_state,
        s.is_forever,
        s.precancelled_date,
        s.backend_subscription_id,
        json_agg(
          json_build_object(
            'product_name', si.product_name,
            'billing_interval', si.billing_interval,
            'unit_price', si.unit_price,
            'quantity', si.quantity,
            'current_period_end', si.current_period_end,
            'features', si.features
          )
        ) as items
      FROM subscriptions s
      LEFT JOIN subscription_items si ON s.stripe_subscription_id = si.stripe_subscription_id
      WHERE s.nup_center_id = $1
      GROUP BY 
        s.stripe_subscription_id, 
        s.current_state, 
        s.is_forever, 
        s.precancelled_date, 
        s.backend_subscription_id,
        s.updated_at
      ORDER BY s.updated_at DESC
      LIMIT 1;
    `;

    const result = await pool.query(query, [centerId]);

    if (result.rows.length === 0) return null;

    const sub = result.rows[0];
    
    // Aplanar todas las features de todos los items en un solo array limpio
    let allFeatures = [];
    if (sub.items && Array.isArray(sub.items)) {
      sub.items.forEach(item => {
        if (item.features && Array.isArray(item.features)) {
          allFeatures = [...allFeatures, ...item.features];
        }
      });
    }

    return {
      current_state: sub.current_state,
      is_forever: sub.is_forever,
      precancelled_date: sub.precancelled_date,
      backend_subscription_id: sub.backend_subscription_id,
      items: sub.items,
      features: allFeatures // Array listo para el UsageChart.tsx
    };

  } catch (error) {
    console.error("❌ Error fetching subscription:", error);
    return { error: error.message };
  }
}


// ────── Function to Upsert Subscription Data ────────────────────────────────────────────────────
// ─── Uses a Postgres transaction to ensure data integrity across 3 tables
// ─── Upsert handles both creation AND updates safely
// ─── Since features are always up to date, we delete and insert
// ─── If any query should fail, a rollback is performed and error is sent to the webhook route
// ──────────────────────────────────────────────────────────────────────────────────────────────

async function upsertSubscriptionData(data) {
  const client = await pool.connect();
  
  const {
    stripe_subscription_id, 
    nup_center_id,          
    start_date,
    is_forever,           
    precancelled_date,
    cancellation_date,
    hasDurationMismatch,
    pendingPayment,
    current_state,
    source,
    revokedAccessDate,
    creation_source,
    payment_method_type,
    items, 
    stripe_event_id,
    event_type,
    raw_payload
  } = data;

  try {
    log("INFO", "SUBSCRIPTION", `Starting DB transaction for ${event_type}`, { subId: stripe_subscription_id });
    await client.query('BEGIN');

    // ────────────────────────────────────────────────────────────────────────
    // 2. UPSERT PARENT: subscriptions
    // ────────────────────────────────────────────────────────────────────────
    await client.query(
      `INSERT INTO subscriptions (
         stripe_subscription_id, nup_center_id, start_date, is_forever, 
         precancelled_date, cancellation_date, revoked_access_date, has_duration_mismatch, current_state, 
         source, source_creation, payment_method_type, pending_payment
       ) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (stripe_subscription_id) 
       DO UPDATE SET 
         nup_center_id = EXCLUDED.nup_center_id,
         start_date = EXCLUDED.start_date,
         is_forever = EXCLUDED.is_forever,
         precancelled_date = EXCLUDED.precancelled_date,
         cancellation_date = EXCLUDED.cancellation_date,
         revoked_access_date = EXCLUDED.revoked_access_date,
         has_duration_mismatch = EXCLUDED.has_duration_mismatch,
         current_state = EXCLUDED.current_state,
         source = EXCLUDED.source,
         source_creation = EXCLUDED.source_creation,
         payment_method_type = EXCLUDED.payment_method_type,
         pending_payment = EXCLUDED.pending_payment`,
      [
        stripe_subscription_id,       // $1
        nup_center_id,                // $2
        start_date,                   // $3
        is_forever,                   // $4
        precancelled_date,            // $5
        cancellation_date,            // $6
        revokedAccessDate,            // $7
        hasDurationMismatch,          // $8
        current_state,                // $9
        source || 'stripe',           // $10
        creation_source,              // $11
        payment_method_type,          // $12 (Fixed alignment)
        pendingPayment                // $13 (Fixed alignment)
      ]
    );

    // ────────────────────────────────────────────────────────────────────────
    // 3. SYNC CHILDREN: subscription_items (Preserving Renovation Counters!)
    // ────────────────────────────────────────────────────────────────────────
    if (items && items.length > 0) {
      // Create an array of the current item IDs from Stripe
      const currentItemIds = items.map(item => item.stripe_item_id);

      // A. Delete items from DB that were removed from the Stripe subscription
      await client.query(
        `DELETE FROM subscription_items 
         WHERE stripe_subscription_id = $1 AND stripe_item_id != ALL($2)`,
        [stripe_subscription_id, currentItemIds]
      );

      // B. Upsert the active items (Safely updating dates without losing number_of_renovations)
      for (const item of items) {
        console.log(`[DB TRACE] Inserting Item: ${item.stripe_item_id}`);
        console.log(`[DB TRACE] Expected End Date:`, item.current_period_end);
        
        await client.query(
          `INSERT INTO subscription_items (
             stripe_subscription_id, stripe_item_id, stripe_product_id, 
             product_name, billing_interval, interval_count, unit_price, quantity, features, 
             start_date, current_period_start, current_period_end, is_forever
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT (stripe_item_id) 
           DO UPDATE SET 
             stripe_product_id = EXCLUDED.stripe_product_id,
             product_name = EXCLUDED.product_name,
             billing_interval = EXCLUDED.billing_interval,
             interval_count = EXCLUDED.interval_count,
             unit_price = EXCLUDED.unit_price,
             quantity = EXCLUDED.quantity,
             features = EXCLUDED.features,
             start_date = EXCLUDED.start_date,
             current_period_start = EXCLUDED.current_period_start,
             current_period_end = EXCLUDED.current_period_end,
             is_forever = EXCLUDED.is_forever`,
          [
            stripe_subscription_id,       // $1
            item.stripe_item_id,          // $2
            item.stripe_product_id,       // $3
            item.product_name,            // $4 (Fixed alignment)
            item.billing_interval,        // $5 (Fixed alignment)
            item.interval_count,          // $6 (Fixed alignment)
            item.unit_price,              // $7 (Fixed alignment)
            item.quantity,                // $8 (Fixed alignment)
            item.features,                // $9 (Fixed alignment)
            item.start_date,              // $10 (Fixed alignment)
            item.current_period_start,    // $11 (Fixed alignment)
            item.current_period_end,      // $12 (Fixed alignment)
            item.is_forever               // $13 (Fixed alignment & added to VALUES)
          ]
        );
      }
    } else {
      // If Stripe payload has 0 items, wipe them all
      await client.query(`DELETE FROM subscription_items WHERE stripe_subscription_id = $1`, [stripe_subscription_id]);
    }

    // ────────────────────────────────────────────────────────────────────────
    // 4. LOG AUDIT TRAIL: subscription_events
    // ────────────────────────────────────────────────────────────────────────
    await client.query(
      `INSERT INTO subscription_events (stripe_event_id, stripe_subscription_id, event_type, raw_payload)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (stripe_event_id) DO NOTHING`, // Safely ignore duplicate doorbell rings
      [stripe_event_id, stripe_subscription_id, event_type, JSON.stringify(raw_payload)]
    );

    await client.query('COMMIT');
    log("INFO", "SUBSCRIPTION", `Successfully committed transaction`, { subId: stripe_subscription_id });

  } catch (error) {
    await client.query('ROLLBACK');
    log("ERROR", "SUBSCRIPTION", "Transaction failed, rolling back", { error: error.message, subId: stripe_subscription_id });
    throw error; 
  } finally {
    client.release();
  }
}


async function updateInvoiceData(data) {
  const client = await pool.connect();
  
  // 1. Destructure using the new standardized names
  const {
    stripe_subscription_id,
    last_invoice_id, 
    last_invoice_status,
    last_invoice_amount,
    last_invoice_date,
    paid_items,
    stripe_event_id,
    event_type,
    raw_payload
  } = data;

  try {
    await client.query('BEGIN');

    // ────────────────────────────────────────────────────────────────────────
    // 1. Update the Master Subscription Financials (With Race Condition Fix!)
    // ────────────────────────────────────────────────────────────────────────
    await client.query(
      `UPDATE subscriptions 
       SET 
         last_invoice_status = CASE 
           -- If it's the SAME invoice, never let a 'failed' or 'open' status overwrite 'paid'!
           WHEN last_invoice_id = $1 AND last_invoice_status = 'paid' THEN 'paid'
           ELSE $2 
         END,
         last_invoice_amount = $3,
         last_invoice_date = $4,
         last_invoice_id = $1,
         updated_at = CURRENT_TIMESTAMP
       WHERE stripe_subscription_id = $5`,
      [last_invoice_id, last_invoice_status, last_invoice_amount, last_invoice_date, stripe_subscription_id]
    );

    // ────────────────────────────────────────────────────────────────────────
    // 2. Increment the Renewal Counter (Only loops if invoice was paid)
    // ────────────────────────────────────────────────────────────────────────
    if (paid_items && paid_items.length > 0) {
      for (const stripe_item_id of paid_items) {
        await client.query(
          `UPDATE subscription_items 
           SET number_of_renovations = number_of_renovations + 1 
           WHERE stripe_item_id = $1`,
          [stripe_item_id]
        );
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // 3. Log the Raw Event History
    // ────────────────────────────────────────────────────────────────────────
    await client.query(
      `INSERT INTO subscription_events (stripe_event_id, stripe_subscription_id, event_type, raw_payload)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (stripe_event_id) DO NOTHING`, // Safely ignore duplicate webhooks
      [stripe_event_id, stripe_subscription_id, event_type, JSON.stringify(raw_payload)]
    );

    await client.query('COMMIT');
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { 
  getAnalyticsByCenterId, 
  upsertSubscriptionData,
  updateInvoiceData,
  getSubscriptionByCenterId
};