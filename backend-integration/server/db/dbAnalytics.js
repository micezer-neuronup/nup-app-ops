const { pool } = require('./db');
const { log } = require("../utils/logger");


const { getCompanyDataWithCache } = require('../services/hubspotServices');


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
      // Búsqueda por center_id (texto) - la búsqueda por nombre la haremos en el frontend
      query += ` AND o.center_id::text ILIKE $${paramIndex}`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY o.created_at DESC`;

    const result = await pool.query(query, params);
    const opportunities = result.rows;

    // En dbAnalytics.js, dentro de getAllOpportunities
const enriched = await Promise.all(opportunities.map(async (opp) => {
  try {
    const companyData = await getCompanyDataWithCache(opp.center_id);
     if (companyData && companyData.id) {
      const features = companyData.properties?.subscription_features || '';
      const hasTestAll = features.includes('test_all');
      
      return {
        ...opp,
        hubspot_company_id: companyData.id,
        hubspot_portal_id: companyData.portalId || null,
        center_name: companyData.properties?.commercial_name || `Centro ${opp.center_id}`,
        email: companyData.properties?.email || '-',
        phone: companyData.properties?.phone || '-',
        segment: companyData.properties?.segmento || '-',
        market: companyData.properties?.market_hubspot || '-',
        has_test_all: hasTestAll,
      };
    }

  } catch (error) {
    log("WARN", "HUBSPOT", `Error enriching opportunity ${opp.id}: ${error.message}`);
  }
  // Fallback
  return {
    ...opp,
    hubspot_company_id: null,
    hubspot_portal_id: null,
    hubspot_ui_domain: 'app.hubspot.com',
    center_name: `Centro ${opp.center_id}`,
    email: '-',
    phone: '-',
    segment: '-',
    market: '-',
    trigger_details: opp.trigger_details || null,
    has_test_all: false
  };
}));

  return enriched.filter(opp => !opp.has_test_all);


  } catch (error) {
    log("ERROR", "DB", `Error fetching opportunities: ${error.message}`);
    throw error;
  }
}



async function createTaskForOpportunity(opportunityId, taskData) {
  const { ownerId, dueDate, subject, body } = taskData;
  
  // 1. Obtener center_id de la oportunidad
  const result = await pool.query(
    `SELECT center_id FROM commercial_opportunity WHERE id = $1`,
    [opportunityId]
  );
  if (result.rows.length === 0) {
    throw new Error('Opportunity not found');
  }
  const centerId = result.rows[0].center_id;

  // 2. Obtener datos de HubSpot (companyId, portalId, etc.)
  const companyData = await getCompanyDataByNupCenterId(centerId);
  if (!companyData || !companyData.id) {
    throw new Error('HubSpot company not found');
  }
  const companyId = companyData.id;
  const portalId = companyData.portalId || '148915792';

  // 3. Construir payload para HubSpot
  const taskPayload = {
    properties: {
      hs_task_subject: subject || `Assessment - Centro ${centerId}`,
      hs_task_body: body || 'Contactar para ofrecer Assessment.',
      hs_task_status: 'NOT_STARTED',
      hs_task_priority: 'HIGH',
      hs_task_type: 'TODO'
    },
    associations: [
      {
        to: { id: companyId },
        types: [
          {
            associationCategory: 'HUBSPOT_DEFINED',
            associationTypeId: 192  // Tarea → Compañía
          }
        ]
      }
    ]
  };

  // Añadir dueño si se proporcionó
  if (ownerId) {
    taskPayload.properties.hubspot_owner_id = ownerId;
  }

  // Añadir fecha de vencimiento si se proporcionó
  if (dueDate) {
    taskPayload.properties.hs_timestamp = new Date(dueDate).toISOString();
  } else {
    // Si no se proporciona, usar +3 días
    taskPayload.properties.hs_timestamp = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  }

  // 4. Llamar a la API de HubSpot para crear la tarea
  const hsResponse = await fetch('https://api.hubapi.com/crm/objects/2026-03/tasks', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.HUBSPOT_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(taskPayload)
  });

  if (!hsResponse.ok) {
    const errorText = await hsResponse.text();
    throw new Error(`HubSpot API error: ${hsResponse.status} - ${errorText}`);
  }
  const hsData = await hsResponse.json();
  const taskId = hsData.id;


  // Después de guardar taskId
  await pool.query(
  `UPDATE commercial_opportunity SET hubspot_task_id = $1, status = 'completed' WHERE id = $2`,
  [taskId, opportunityId]
);

  // 6. Devolver la URL de la tarea
  const taskUrl = `https://app.hubspot.com/contacts/${portalId}/task/${taskId}`;
  return { taskId, taskUrl };
}



module.exports = { 
  getAnalyticsByCenterId, 
  updateFeatureRequestStatus,
  updateOpportunityStatus,
  getAllOpportunities,
  createTaskForOpportunity
};