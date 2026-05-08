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

    const centerResult = await pool.query(
      `SELECT total_events, total_exercises, total_sessions, total_logins, last_activity_date, updated_at 
       FROM centers WHERE center_id = $1`,
      [String(centerId)]
    );
    
    const dailyResult = await pool.query(
      `SELECT date, exercises, sessions, logins 
       FROM center_daily_stats 
       WHERE center_id = $1 
       ORDER BY date ASC`,
      [String(centerId)]
    );
    
    if (centerResult.rows.length === 0) {
      log("WARN", "ANALYTICS", "No analytics found", { centerId });
      return null;
    }

    log("INFO", "ANALYTICS", "Analytics fetched successfully", { centerId });
  
    return {
      totals: centerResult.rows[0],
      daily: dailyResult.rows
    };
  } catch (error) {
log("ERROR", "ANALYTICS", "Error fetching analytics", { error: error.message });
    return { error: error.message };
  }
}


// ────── Function to Upsert Subscription Data ─────────────
// ─── Uses a Postgres transaction to ensure data integrity across 3 tables
// ─── Upsert handles both creation AND updates safely
// ─── Triggered when a webhook enters the server
// ─── Grab a dedicated client from the pool to run a transaction
// ─── A webhook updates various tables, we need all changes applied or none
// ─── We start transaction
// ─── A subscription created webhook will try to insert, if it exists, it updates
// ─── Since features are always up to date, we delete and insert to mantain them uodated in the database
// ─── Then we register the record for Subscription Records
// ─── Then we commit the transaction
// ─── If any query should fail, a rollback is performed and error is sent to the webhoook route
// ────────────────────────────────────────────────────────────────────
async function upsertSubscriptionData(data) {
  const client = await pool.connect();
  
  // Destructure the data object for clean variables
  const {
    stripe_sub_id,
    status, // Maps to current_state
    start_date,
    end_date,
    cancellation_date,
    payment_method,
    items, // Array of products
    event_type,
    raw_payload
  } = data;

  try {
    log("INFO", "SUBSCRIPTION", `Starting DB transaction for ${event_type}`, { subId: stripe_sub_id });
    await client.query('BEGIN');

    // 1. Upsert the Parent Subscription (Protects CRM columns)
    await client.query(
      `INSERT INTO subscriptions (
         stripe_sub_id, start_date, end_date, next_renewal_date, 
         cancellation_date, current_state, source, payment_method
       ) 
       VALUES ($1, $2, $3, $4, $5, $6, 'stripe', $7)
       ON CONFLICT (stripe_sub_id) 
       DO UPDATE SET 
         end_date = EXCLUDED.end_date,
         next_renewal_date = EXCLUDED.next_renewal_date,
         cancellation_date = EXCLUDED.cancellation_date,
         current_state = EXCLUDED.current_state,
         payment_method = EXCLUDED.payment_method,
         updated_at = CURRENT_TIMESTAMP`,
      [
        stripe_sub_id, 
        start_date, 
        end_date, 
        end_date, // next_renewal_date mirrors end_date from Stripe
        cancellation_date, 
        status, 
        payment_method
      ]
    );

    // 2. Sync the Child Products (Wipe and Replace)
    await client.query(`DELETE FROM subscription_items WHERE stripe_sub_id = $1`, [stripe_sub_id]);

    if (items && items.length > 0) {
      for (const item of items) {
        await client.query(
          `INSERT INTO subscription_items (
             stripe_sub_id, stripe_product_id, type_of_subscription, features, quantity
           ) VALUES ($1, $2, $3, $4, $5)`,
          [
            stripe_sub_id, 
            item.stripe_product_id, 
            item.type_of_subscription, 
            item.features, // This is already JSON stringified in server.js
            item.quantity
          ]
        );
      }
    }

    // 3. Log the Raw Event History (Using the new table name)
    await client.query(
      `INSERT INTO subscription_events (stripe_event_id, stripe_sub_id, event_type, raw_payload)
       VALUES ($1, $2, $3, $4)`,
      [raw_payload.id, stripe_sub_id, event_type, JSON.stringify(raw_payload)]
    );

    await client.query('COMMIT');
    log("INFO", "SUBSCRIPTION", `Successfully committed transaction`, { subId: stripe_sub_id });

  } catch (error) {
    await client.query('ROLLBACK');
    log("ERROR", "SUBSCRIPTION", "Transaction failed, rolling back", { error: error.message, subId: stripe_sub_id });
    throw error; 
  } finally {
    client.release();
  }
}

module.exports = { 
  getAnalyticsByCenterId, 
  upsertSubscriptionData 
};
