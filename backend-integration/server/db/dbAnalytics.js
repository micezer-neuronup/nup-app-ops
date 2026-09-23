const { pool } = require('./db');
const { log } = require("../utils/logger");


const { getCompanyDataWithCache,getCompanyDataByNupCenterId  } = require('../services/hubspotServices');


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

    // ✅ Nueva consulta para oportunidades comerciales
    const opportunitiesResult = await pool.query(
  `SELECT 
     o.id, 
     o.type, 
     o.product, 
     o.trigger_source, 
     o.trigger_details, 
     o.ai_justification, 
     o.status, 
     o.created_at, 
     o.updated_at,
     o.reported_at,
     o.total_tests_60d,
     o.active_days_60d,
     o.avg_daily_60d,
     o.score,
     COALESCE(
       (SELECT json_agg(
          json_build_object(
            'detected_at', d.detected_at,
            'total_tests_day', d.total_tests_day
          ) ORDER BY d.detected_at DESC
        )
        FROM opportunity_detections d
        WHERE d.opportunity_id = o.id
       ), '[]'::json
     ) AS detections
   FROM commercial_opportunity o
   WHERE o.center_id = $1
   ORDER BY o.created_at DESC`,
  [String(centerId)]
);

    if (dailyResult.rows.length === 0 && featuresResult.rows.length === 0 && opportunitiesResult.rows.length === 0) {
      log("WARN", "ANALYTICS", "No data found for center", { centerId });
      return null; 
    }

    log("INFO", "ANALYTICS", "Analytics fetched successfully", { centerId });
  
    return {
      totals: totalsResult.rows[0],
      daily: dailyResult.rows,
      feature_requests: featuresResult.rows,
      opportunities: opportunitiesResult.rows  // Nueva clave
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

// Nueva función para actualizar el estado de una oportunidad comercial
async function updateOpportunityStatus(id, status) {
  try {
    const query = `
      UPDATE commercial_opportunity 
      SET status = $2, updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `;
    const result = await pool.query(query, [id, status]);
    
    if (result.rows.length === 0) return null;
    return result.rows[0];
  } catch (error) {
    console.error("❌ Error updating opportunity status:", error);
    return { error: error.message };
  }
}


async function getAllOpportunities(filters = {}) {
  const { status, search } = filters;
  
  try {
    let query = `
      SELECT 
        o.id, 
        o.center_id,
        o.type, 
        o.product, 
        o.trigger_source, 
        o.trigger_details, 
        o.ai_justification, 
        o.status, 
        o.created_at, 
        o.updated_at,
        o.reported_at,
        o.total_tests_60d,
        o.active_days_60d,
        o.avg_daily_60d,
        o.score,
        o.upsell_object,
        o.upsell_owner_id,
        o.upsell_owner_name,
        COALESCE(
          (SELECT json_agg(
             json_build_object(
               'detected_at', d.detected_at,
               'total_tests_day', d.total_tests_day
             ) ORDER BY d.detected_at DESC
           )
           FROM opportunity_detections d
           WHERE d.opportunity_id = o.id
          ), '[]'::json
        ) AS detections
      FROM commercial_opportunity o
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND o.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (search) {
      query += ` AND o.center_id::text ILIKE $${paramIndex}`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY o.created_at DESC`;

    const result = await pool.query(query, params);
    const opportunities = result.rows;

    // 🔥 Ejecutar en SERIE (una por una) para evitar rate limit
    const enriched = [];
    for (const opp of opportunities) {
      try {
        const companyData = await getCompanyDataWithCache(opp.center_id);
        
        if (companyData && companyData.id) {
          const features = companyData.properties?.subscription_features || '';
          const hasTestAll = features.includes('test_all');
          
          enriched.push({
            ...opp,
            hubspot_company_id: companyData.id,
            hubspot_portal_id: companyData.portalId || null,
            hubspot_ui_domain: companyData.uiDomain || 'app.hubspot.com',
            center_name: companyData.properties?.commercial_name || `Centro ${opp.center_id}`,
            email: companyData.properties?.email || '-',
            phone: companyData.properties?.phone || '-',
            segment: companyData.properties?.segmento || '-',
            market: companyData.properties?.market_hubspot || '-',
            has_test_all: hasTestAll,
            trigger_details: opp.trigger_details || null,
          });
        } else {
          enriched.push({
            ...opp,
            hubspot_company_id: null,
            hubspot_portal_id: null,
            hubspot_ui_domain: 'app.hubspot.com',
            center_name: `Centro ${opp.center_id}`,
            email: '-',
            phone: '-',
            segment: '-',
            market: '-',
            has_test_all: false,
            trigger_details: opp.trigger_details || null,
          });
        }
      } catch (error) {
        log("WARN", "HUBSPOT", `Error enriching opportunity ${opp.id}: ${error.message}`);
        enriched.push({
          ...opp,
          hubspot_company_id: null,
          hubspot_portal_id: null,
          hubspot_ui_domain: 'app.hubspot.com',
          center_name: `Centro ${opp.center_id}`,
          email: '-',
          phone: '-',
          segment: '-',
          market: '-',
          has_test_all: false,
          trigger_details: opp.trigger_details || null,
        });
      }
    }

    // Filtrar oportunidades que tienen test_all
    const filtered = enriched.filter(opp => !opp.has_test_all);
    log("INFO", "DB", `Fetched ${opportunities.length} opportunities, filtered to ${filtered.length} (${opportunities.length - filtered.length} have test_all)`);

    return filtered;

  } catch (error) {
    log("ERROR", "DB", `Error fetching opportunities: ${error.message}`);
    throw error;
  }
}


async function assignUpsellOpportunity(opportunityId, { upsellObject, upsellOwnerId, upsellOwnerName }) {
  // 1. Obtener center_id y ai_justification de la oportunidad
  const result = await pool.query(
    `SELECT center_id, ai_justification FROM commercial_opportunity WHERE id = $1`,
    [opportunityId]
  );
  if (result.rows.length === 0) {
    throw new Error('Opportunity not found');
  }
  const centerId = result.rows[0].center_id;
  const aiJustification = result.rows[0].ai_justification || '';

  // 2. Obtener companyId de HubSpot
  const companyData = await getCompanyDataByNupCenterId(centerId);
  if (!companyData || !companyData.id) {
    throw new Error('HubSpot company not found');
  }
  const companyId = companyData.id;

  // 3. PATCH a la compañía en HubSpot con las tres propiedades
  const patchPayload = {
    properties: {
      upsell_opportunity_object: upsellObject || '',
      upsell_opportunity_owner: upsellOwnerId || '',
      upsell_ai_justification: aiJustification
    }
  };

  const hsResponse = await fetch(
    `https://api.hubapi.com/crm/v3/objects/companies/${companyId}`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${process.env.HUBSPOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(patchPayload)
    }
  );

  if (!hsResponse.ok) {
    const errorText = await hsResponse.text();
    throw new Error(`HubSpot API error: ${hsResponse.status} - ${errorText}`);
  }

  // 4. Guardar en BD
  await pool.query(
    `UPDATE commercial_opportunity 
     SET upsell_object = $1, upsell_owner_id = $2, upsell_owner_name = $3, updated_at = NOW()
     WHERE id = $4`,
    [upsellObject || null, upsellOwnerId || null, upsellOwnerName || null, opportunityId]
  );

  return {
    upsellObject,
    upsellOwnerId,
    upsellOwnerName,
  };
}



module.exports = { 
  getAnalyticsByCenterId, 
  updateFeatureRequestStatus,
  updateOpportunityStatus,
  getAllOpportunities,
  assignUpsellOpportunity
};