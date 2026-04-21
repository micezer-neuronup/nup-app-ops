// db/dbQueries.js
const { pool } = require('./db');

async function getAnalyticsByCenterId(centerId) {
  if (!centerId) return null;
  
  try {
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
    
    if (centerResult.rows.length === 0) return null;
    
    return {
      totals: centerResult.rows[0],
      daily: dailyResult.rows
    };
  } catch (error) {
    console.error('Error fetching analytics:', error);
    return { error: error.message };
  }
}

async function refreshAnalytics(centerId) {
  return getAnalyticsByCenterId(centerId);
}

module.exports = { getAnalyticsByCenterId, refreshAnalytics };