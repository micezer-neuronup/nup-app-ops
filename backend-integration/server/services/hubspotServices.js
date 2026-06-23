const { pool } = require('../db/db'); // Ajusta la ruta a tu conexión DB
const fetch = require('node-fetch'); // O el fetch nativo si usas Node 18+
const { log } = require("../utils/logger");

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const ACCOUNT_SUB_OBJECT_ID = "2-203896755"; 
const ITEM_OBJECT_ID = "2-203892072";        
const ASSOC_ITEM_TO_COMPANY = 295; 
const ASSOC_SUB_TO_COMPANY = 313;   
const ASSOC_ITEM_TO_SUB = 316;      

const intervalMap = { "day": "daily", "daily": "daily", "week": "weekly", "weekly": "weekly", "month": "monthly", "monthly": "monthly", "year": "yearly", "yearly": "yearly" };
const sourceMap = { "stripe": "Stripe", "manual": "Backend" };
const statusMap = { "active": "active", "trialing": "trial", "trial": "trial", "canceled": "canceled", "cancelled": "canceled", "trial_canceled": "trial_canceled", "past_due": "past_due" };
const formatHsDate = (dateVal) => {
  if (!dateVal) return "";
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return "";
  
  // Extraemos solo la parte YYYY-MM-DD (ej: "2026-06-23")
  return d.toISOString().split('T')[0]; 
};
// --- Funciones auxiliares de tu script original ---
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
      log("WARN", "HUBSPOT-SYNC", `Sub ${subscriptionId} no tiene nup_center_id. Ignorando.`);
      return 'NO_COMPANY'; // Cambiamos a 'no_company' para excluirlo permanentemente
    }

    let companyHubspotId;
    try {
      companyHubspotId = await findCompanyHubspotId(sub.nup_center_id);
    } catch (err) {
      log("WARN", "HUBSPOT-SYNC", `❌ Empresa nup_center_id '${sub.nup_center_id}' no encontrada en HubSpot para sub ${subscriptionId}.`);
      return 'NO_COMPANY'; // ✨ DETECTAMOS ERROR CRÍTICO DE DATOS
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

    log("INFO", "HUBSPOT-SYNC", `✅ Suscripción ${subscriptionId} enviada a HubSpot.`);
    return true; // Éxito

  } catch (error) {
    log("ERROR", "HUBSPOT-SYNC", `❌ Error sincronizando ${subscriptionId}: ${error.message}`);
    return false; // Fallo genérico (ej: Rate limit o red)
  }
}

module.exports = { syncSingleSubscriptionToHubspot };