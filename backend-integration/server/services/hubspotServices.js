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
const formatHsDate = (dateVal) => dateVal ? new Date(dateVal).toISOString() : "";

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

// --- FUNCIÓN PRINCIPAL DE SINCRONIZACIÓN ---
async function syncSingleSubscriptionToHubspot(subscriptionId) {
  try {
    // 1. Obtener datos frescos de TU base de datos
    const { rows: subRows } = await pool.query(`SELECT * FROM subscriptions WHERE subscription_id = $1`, [subscriptionId]);
    if (subRows.length === 0) return false;
    const sub = subRows[0];

    if (!sub.nup_center_id) {
      log("WARN", "HUBSPOT-SYNC", `Sub ${subscriptionId} no tiene nup_center_id. Ignorando.`);
      return true; // Devolvemos true para que deje de estar PENDING, ya que no podemos hacer nada
    }

    const companyHubspotId = await findCompanyHubspotId(sub.nup_center_id);

    // 2. Sincronizar Padre
    const subInputs = [{
      idProperty: "subscription_id_unique",
      id: sub.subscription_id,
      properties: {
        account_name: sub.center_name ? `Suscripción - ${sub.center_name}` : `Suscripción - ${sub.subscription_id}`,
        subscription_id_unique: sub.subscription_id,
        status: statusMap[String(sub.current_state).toLowerCase()] || "active",
        isforever: sub.is_forever ? "true" : "false",
        payment_method_type: sub.payment_method_type || "",
        source: sourceMap[String(sub.source || sub.creation_source).toLowerCase()] || "Stripe",
        start_date: formatHsDate(sub.start_date),
        precancelled_date: formatHsDate(sub.precancelled_date), // Ojo: usa el nombre de BD correcto
        subscription_finish_date: formatHsDate(sub.cancelation_date)
      }
    }];

    const subRes = await fetch(`https://api.hubapi.com/crm/v3/objects/${ACCOUNT_SUB_OBJECT_ID}/batch/upsert`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${HUBSPOT_TOKEN}` },
      body: JSON.stringify({ inputs: subInputs })
    });
    const subData = await subRes.json();
    if (!subRes.ok) throw new Error("Fallo Upsert Padre");
    
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

        return {
          idProperty: "stripe_item_id_unique",
          id: item.item_id, // ✨ Ahora se llama item_id en BD
          properties: {
            subscription_item_name: `${item.product_name || 'Item'} - ${item.item_id}`,
            stripe_item_id_unique: item.item_id,
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
            stripe_product_id: item.product_id || "", // ✨ Ahora product_id
            subscription_id: item.subscription_id,
            status: statusMap[String(item.status).toLowerCase()],
            precanceled_date: formatHsDate(item.precanceled_date)
          }
        };
      });

      const itemsRes = await fetch(`https://api.hubapi.com/crm/v3/objects/${ITEM_OBJECT_ID}/batch/upsert`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${HUBSPOT_TOKEN}` },
        body: JSON.stringify({ inputs: itemInputs })
      });
      const itemsData = await itemsRes.json();
      if (!itemsRes.ok) throw new Error("Fallo Upsert Hijos");

      for (const record of itemsData.results) {
        await createAssociation(ITEM_OBJECT_ID, record.id, "company", companyHubspotId, ASSOC_ITEM_TO_COMPANY);
        await createAssociation(ITEM_OBJECT_ID, record.id, ACCOUNT_SUB_OBJECT_ID, hubspotSubId, ASSOC_ITEM_TO_SUB);
      }
    }

    log("INFO", "HUBSPOT-SYNC", `✅ Suscripción ${subscriptionId} enviada a HubSpot en tiempo real.`);
    return true; // Éxito

  } catch (error) {
    log("ERROR", "HUBSPOT-SYNC", `❌ Error sincronizando ${subscriptionId}: ${error.message}`);
    return false; // Falló, se quedará en PENDING
  }
}

module.exports = { syncSingleSubscriptionToHubspot };