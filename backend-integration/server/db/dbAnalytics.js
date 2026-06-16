const { pool } = require('./db');
const { log } = require("../utils/logger");

async function getAnalyticsByCenterId(centerId) {
  if (!centerId) return null;
  
  try {
    log("INFO", "ANALYTICS", "Fetching analytics", { centerId });

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
    
    const dailyResult = await pool.query(
      `SELECT 
         stat_date, active_therapists, total_logins, activities_started,
         sessions_created, sessions_assigned, sessions_started, sessions_finished,
         tests_started, tests_finished, reports_created, exercises_downloaded, materials_downloaded
       FROM daily_stats 
       WHERE center_id = $1 
       ORDER BY stat_date ASC`,
      [String(centerId)]
    );

    const featuresResult = await pool.query(
      `SELECT id, feature_name, requested_at, status
       FROM feature_requests
       WHERE center_id = $1
       ORDER BY requested_at DESC`,
      [String(centerId)]
    );

    if (dailyResult.rows.length === 0) {
      log("WARN", "ANALYTICS", "No analytics found", { centerId });
      return null; 
    }

    log("INFO", "ANALYTICS", "Analytics fetched successfully", { centerId });
  
    return {
      totals: totalsResult.rows[0],
      daily: dailyResult.rows,
      feature_requests: featuresResult.rows
    };
  } catch (error) {
    log("ERROR", "ANALYTICS", "Error fetching analytics", { error: error.message });
    return { error: error.message };
  }
}

async function updateFeatureRequestStatus(id, status) {
  try {
    const query = `
      UPDATE feature_requests 
      SET status = $2
      WHERE id = $1
      RETURNING *;
    `;
    const result = await pool.query(query, [id, status]);
    
    if (result.rows.length === 0) return null;
    return result.rows[0];
  } catch (error) {
    console.error("❌ Error updating feature request status:", error);
    return { error: error.message };
  }
}

module.exports = { 
  getAnalyticsByCenterId, 
  updateFeatureRequestStatus
};