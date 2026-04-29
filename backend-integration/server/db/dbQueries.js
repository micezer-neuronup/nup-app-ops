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

module.exports = { getAnalyticsByCenterId };