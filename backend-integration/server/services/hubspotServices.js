const { pool } = require('../db/db'); // Ajusta la ruta a tu conexión DB
const fetch = require('node-fetch'); // O el fetch nativo si usas Node 18+
const { log } = require("../utils/logger");

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const ACCOUNT_SUB_OBJECT_ID = "2-203896755"; 
const ITEM_OBJECT_ID = "2-203892072";        
const ASSOC_ITEM_TO_COMPANY = 295; 
const ASSOC_SUB_TO_COMPANY = 313;   
const ASSOC_ITEM_TO_SUB = 316;      



// ────── Function: resolveCompanyData ─────────────────────────────────────────────────────────
// ─── We have 2 object types, company and deal. We define a dictionary with the object types 
// ─── We define a list with all the properties we want to fetch
// ─── If its a company, we do a direct fecth to hubspot and return it
// ─── If its a deal, we fetch the deals associated companies
// ─── The first company that has a nup_center_id is returned
// ────────────────────────────────────────────────────────────────────────────────────────────
async function resolveCompanyData(objectId, objectTypeId) {

  const OBJECT_TYPES = {
    COMPANY: '0-2',
    DEAL: '0-3'
  };

  const companyProperties = [
  'nup_center_id',
  'name',
  'email',
  'commercial_name',
  'company_specialty__por_definir_',
  'cif',
  'region_backend',
  'num_employees',
  'num_patients',
  'last_company_login',
  'nup2go_balance',
  'nup2go_patients',
  'last_nup2go_assignment',
  'last_nup2go_payment_date',
  'segmento',
  'currency__por_definir_',
  'all_subscription_days',
  'market_hubspot',
  'health_score',
  'churn_risk'
];
  if (objectTypeId === OBJECT_TYPES.COMPANY) {
    const url = `https://api.hubapi.com/crm/v3/objects/company/${objectId}?properties=${companyProperties.join(',')}`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${HUBSPOT_TOKEN}` } });
    if (!res.ok) throw new Error(`Company fetch failed: ${res.status}`);
    const data = await res.json();
    if (!data.properties?.nup_center_id) throw new Error('Company has no nup_center_id');
    return data;
  }

  if (objectTypeId === OBJECT_TYPES.DEAL) {

    const dealUrl = `https://api.hubapi.com/crm/v3/objects/deals/${objectId}?associations=company`;

    const dealRes = await fetch(dealUrl, { 
    headers: { 'Authorization': `Bearer ${HUBSPOT_TOKEN}` } 
    });

    if (!dealRes.ok) {
      const errorText = await dealRes.text();
      throw new Error(`Failed to fetch deal ${objectId}: ${dealRes.status} ${errorText}`);
    }

    const dealData = await dealRes.json();
    const companyIds = dealData.associations?.companies?.results?.map(r => r.id) || [];

    if (companyIds.length === 0) {
      throw new Error(`Deal ${objectId} has no associated companies`);
    }

    for (const companyId of companyIds) {
      const url = `https://api.hubapi.com/crm/v3/objects/company/${companyId}?properties=nup_center_id,${companyProperties.join(',')}`;
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${HUBSPOT_TOKEN}` } });
    
      if (!res.ok) continue;
    
      const company = await res.json();
      if (company.properties?.nup_center_id) {
        return company;
      }
    }

    throw new Error('No associated company with nup_center_id found for this deal');
  }

  throw new Error(`Unsupported object type: ${objectTypeId}`);
}


const intervalMap = { "day": "daily", "daily": "daily", "week": "weekly", "weekly": "weekly", "month": "monthly", "monthly": "monthly", "year": "yearly", "yearly": "yearly" };
const sourceMap = { "stripe": "Stripe", "manual": "Backend" };
const statusMap = { "active": "active", "trialing": "trial", "trial": "trial", "canceled": "canceled", "cancelled": "canceled", "trial_canceled": "trial_canceled", "past_due": "past_due" };

const formatHsDate = (dateVal) => {
  if (!dateVal) return "";
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().split('T')[0]; 
};





async function findCompanyHubspotId(nupCenterId) {
  const response = await fetch('https://api.hubapi.com/crm/v3/objects/companies/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${HUBSPOT_TOKEN}` },
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: "nup_center_id", operator: "EQ", value: String(nupCenterId) }] }]
    })
  });
  const data = await response.json();
  if (!response.ok || data.total === 0) throw new Error(`Empresa nup_center_id '${nupCenterId}' no encontrada.`);
  return data.results[0].id;
}

async function createAssociation(fromType, fromId, toType, toId, assocId) {
  await fetch(`https://api.hubapi.com/crm/v4/objects/${fromType}/${fromId}/associations/${toType}/${toId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${HUBSPOT_TOKEN}` },
    body: JSON.stringify([{ "associationCategory": "USER_DEFINED", "associationTypeId": assocId }])
  });
}

async function syncSingleSubscriptionToHubspot(subscriptionId) {
  try {
    // 1. Obtener datos frescos de TU base de datos
    const { rows: subRows } = await pool.query(`SELECT * FROM subscriptions WHERE subscription_id = $1`, [subscriptionId]);
    if (subRows.length === 0) return false;
    const sub = subRows[0];

    if (!sub.nup_center_id) {
      // Pasado a console para no saturar el archivo de logs
      console.log(`[HUBSPOT-SYNC][WARN] Sub ${subscriptionId} no tiene nup_center_id. Ignorando.`);
      return 'NO_COMPANY'; 
    }

    let companyHubspotId;
    try {
      companyHubspotId = await findCompanyHubspotId(sub.nup_center_id);
    } catch (err) {
      // Pasado a console para no saturar el archivo de logs
      console.log(`[HUBSPOT-SYNC][WARN] Empresa nup_center_id '${sub.nup_center_id}' no encontrada en HubSpot para sub ${subscriptionId}.`);
      return 'NO_COMPANY'; 
    }

    // 2. Sincronizar Padre
    const subInputs = [{
      idProperty: "subscription_id_unique",
      id: String(sub.subscription_id),
      properties: {
        account_name: sub.center_name ? `Suscripción - ${sub.center_name}` : `Suscripción - ${sub.subscription_id}`,
        subscription_id_unique: sub.subscription_id,
        status: statusMap[String(sub.current_state).toLowerCase()] || "active",
        isforever: sub.is_forever ? "true" : "false",
        payment_method_type: sub.payment_method_type || "",
        source: sourceMap[String(sub.source || sub.creation_source).toLowerCase()] || "Stripe",
        start_date: formatHsDate(sub.start_date),
        precancelled_date: formatHsDate(sub.precancelled_date || sub.precanceled_date), 
        subscription_finish_date: formatHsDate(sub.cancelation_date)
      }
    }];

    const subRes = await fetch(`https://api.hubapi.com/crm/v3/objects/${ACCOUNT_SUB_OBJECT_ID}/batch/upsert`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${HUBSPOT_TOKEN}` },
      body: JSON.stringify({ inputs: subInputs })
    });
    
    const subData = await subRes.json();
    if (!subRes.ok) throw new Error(`Fallo Upsert Padre: ${JSON.stringify(subData)}`);
    
    const hubspotSubId = subData.results[0].id;
    await createAssociation(ACCOUNT_SUB_OBJECT_ID, hubspotSubId, "company", companyHubspotId, ASSOC_SUB_TO_COMPANY);

    // 3. Sincronizar Hijos
    const { rows: relatedItems } = await pool.query(`SELECT * FROM subscription_items WHERE subscription_id = $1`, [subscriptionId]);
    
    if (relatedItems.length > 0) {
      const itemInputs = relatedItems.map(item => {
        let featuresText = "";
        try {
          const parsed = typeof item.features === 'string' ? JSON.parse(item.features) : item.features;
          featuresText = Array.isArray(parsed) ? parsed.join(", ") : String(parsed || "");
        } catch (e) { featuresText = String(item.features || ""); }

        const safeItemId = item.item_id || `manual_${item.subscription_id}_${item.product_name?.replace(/\s+/g, '_')}`;
        const itemName = item.item_id ? `${item.product_name || 'Item'} - ${item.item_id}` : (item.product_name || 'Producto Manual');

        return {
          idProperty: "stripe_item_id_unique",
          id: String(safeItemId),
          properties: {
            subscription_item_name: itemName,
            stripe_item_id_unique: safeItemId,
            nup_center_id: sub.nup_center_id,
            billing_interval: intervalMap[String(item.billing_interval).toLowerCase()] || "monthly", 
            payment_frequency: item.payment_frequency || 1,
            unit_price: item.unit_price || 0,
            quantity: item.quantity,            
            start_date: formatHsDate(item.start_date),
            current_period_start: formatHsDate(item.current_period_start),
            current_period_end: formatHsDate(item.current_period_end),
            isforever: item.is_forever ? "true" : "false",
            features: featuresText,
            number_of_renovations: item.number_of_renovations || 0,
            product_name: item.product_name || "",
            stripe_product_id: item.product_id || "", 
            subscription_id: item.subscription_id,
            status: statusMap[String(item.status).toLowerCase()],
            precanceled_date: formatHsDate(item.precanceled_date || item.precancelled_date)
          }
        };
      });

      const itemsRes = await fetch(`https://api.hubapi.com/crm/v3/objects/${ITEM_OBJECT_ID}/batch/upsert`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${HUBSPOT_TOKEN}` },
        body: JSON.stringify({ inputs: itemInputs })
      });
      
      const itemsData = await itemsRes.json();
      if (!itemsRes.ok) throw new Error(`Fallo Upsert Hijos: ${JSON.stringify(itemsData)}`);

      for (const record of itemsData.results) {
        await createAssociation(ITEM_OBJECT_ID, record.id, "company", companyHubspotId, ASSOC_ITEM_TO_COMPANY);
        await createAssociation(ITEM_OBJECT_ID, record.id, ACCOUNT_SUB_OBJECT_ID, hubspotSubId, ASSOC_ITEM_TO_SUB);
      }
    }

    console.log(`[HUBSPOT-SYNC] Suscripción ${subscriptionId} enviada a HubSpot.`);
    return true; 

  } catch (error) {
    console.error(`[HUBSPOT-SYNC][ERROR] Error sincronizando ${subscriptionId}: ${error.message}`);
    return false; 
  }
}

async function getCompanyDataByNupCenterId(nupCenterId) {
  if (!nupCenterId) return null;

  try {
    const searchResponse = await fetch('https://api.hubapi.com/crm/v3/objects/companies/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'nup_center_id',
                operator: 'EQ',
                value: String(nupCenterId)
              }
            ]
          }
        ]
      })
    });

    if (!searchResponse.ok) {
      throw new Error(`HubSpot search failed: ${searchResponse.status}`);
    }

    const searchData = await searchResponse.json();

    if (searchData.total === 0 || searchData.results.length === 0) {
      log("WARN", "HUBSPOT", `Company not found for nup_center_id: ${nupCenterId}`);
      return null;
    }

    const result = searchData.results[0];
    const companyObjectId = result.id;
    const portalId = result.portalId;
    const uiDomain = result.uiDomain || 'app.hubspot.com'; // ✅ Añadido uiDomain

    const companyData = await resolveCompanyData(companyObjectId, '0-2');

    return {
      ...companyData,
      portalId: portalId,
      uiDomain: uiDomain, // ✅ Devuelve uiDomain
    };

  } catch (error) {
    log("ERROR", "HUBSPOT", `Error fetching company by nup_center_id ${nupCenterId}: ${error.message}`);
    return null;
  }
}



module.exports = { 
  syncSingleSubscriptionToHubspot,
  resolveCompanyData, 
  getCompanyDataByNupCenterId,
 };