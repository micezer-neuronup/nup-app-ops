const dotenv = require('dotenv');
const path = require('path');
const { Pool } = require('pg');

const envFile = process.env.NODE_ENV === 'production' ? '../.env.production' : '../.env.development';
const envPath = path.resolve(__dirname, envFile);
dotenv.config({ path: envPath });

// ============================================================================
// CONFIGURACIÓN DE CREDENCIALES Y OBJETOS
// ============================================================================
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN

const ITEM_OBJECT_ID = "2-203892072";        
const ACCOUNT_SUB_OBJECT_ID = "2-203896755"; 

const ASSOC_ITEM_TO_COMPANY = 295; 
const ASSOC_SUB_TO_COMPANY = 313;   
const ASSOC_ITEM_TO_SUB = 316;      

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME, 
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
});

const intervalMap = {
  "day": "daily", "daily": "daily",
  "week": "weekly", "weekly": "weekly",
  "month": "monthly", "monthly": "monthly",
  "year": "yearly", "yearly": "yearly"
};

const sourceMap = { "stripe": "Stripe", "manual": "Backend" };
const statusMap = {
  "active": "active", "trialing": "trial", "trial": "trial",
  "canceled": "canceled", "cancelled": "canceled", "trial_canceled": "trial_canceled",
  "past_due": "past_due"
};

// ============================================================================
// FLUJO PRINCIPAL DE MIGRACIÓN / SINCRONIZACIÓN MASIVA
// ============================================================================
async function main() {
  console.log("🚀 [INICIO] Sincronización masiva de todo el universo de suscripciones...");

  try {
    // 1. LEER TODAS LAS SUSCRIPCIONES E ÍTEMS DE POSTGRES
    const { rows: allSubs } = await pool.query(`SELECT * FROM subscriptions;`);
    const { rows: allItems } = await pool.query(`SELECT * FROM subscription_items;`);

    if (allSubs.length === 0) {
      console.log("ℹ️ No hay suscripciones en la base de datos para sincronizar.");
      return;
    }

    console.log(`✅ [DB] Extraídas ${allSubs.length} suscripciones y ${allItems.length} ítems.`);

    const formatHsDate = (dateVal) => dateVal ? new Date(dateVal).toISOString() : "";
    const subIdToHubspotIdMap = {};

    // 2. PROCESAR CADA SUSCRIPCIÓN (PADRE)
    for (const sub of allSubs) {
      console.log(`\n-------------------------------------------------------------`);
      console.log(`📦 Procesando Suscripción Padre: ${sub.subscription_id}`);

      if (!sub.nup_center_id) {
        console.log(`⚠️ Skip: Suscripción ${sub.subscription_id} no tiene nup_center_id.`);
        continue;
      }

      // Buscar Empresa vinculada en HubSpot
      let companyHubspotId;
      try {
        companyHubspotId = await findCompanyHubspotId(sub.nup_center_id);
      } catch (err) {
        console.log(`❌ Skip: ${err.message}`);
        continue;
      }

      // Preparar payload del Padre para el Batch Upsert (procesado individual para controlar mapeos)
      // Preparar payload del Padre (Solo con las propiedades validadas en HubSpot)
      const subInputs = [{
        idProperty: "subscription_id_unique",
        id: sub.subscription_id,
        properties: {
          account_name: sub.center_name ? `Suscripción - ${sub.center_name}` : `Suscripción - ${sub.subscription_id}`,
          subscription_id_unique: sub.subscription_id,
          status: statusMap[String(sub.current_state).toLowerCase()] || "active",
          isforever: sub.is_forever ? "true" : "false",
          payment_method_type: sub.payment_method_type || "",
          source: sourceMap[String(sub.creation_source).toLowerCase()] || "Stripe",
          start_date: formatHsDate(sub.start_date),
          precancelled_date: formatHsDate(sub.precanceled_date),
          subscription_finish_date: formatHsDate(sub.cancelation_date)
        }
      }];

      const subUpsertRes = await fetch(`https://api.hubapi.com/crm/v3/objects/${ACCOUNT_SUB_OBJECT_ID}/batch/upsert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${HUBSPOT_TOKEN}` },
        body: JSON.stringify({ inputs: subInputs })
      });

      const subUpsertData = await subUpsertRes.json();
      if (!subUpsertRes.ok) {
        console.error(`❌ Falló Upsert de Suscripción ${sub.subscription_id}:`, JSON.stringify(subUpsertData));
        continue;
      }

      const hubspotSubId = subUpsertData.results[0].id;
      subIdToHubspotIdMap[sub.subscription_id] = hubspotSubId;
      console.log(`✅ Account Subscription sincronizada. HS ID: ${hubspotSubId}`);

      // Crear Asociación: Suscripción Padre ➔ Empresa
      await createAssociation(ACCOUNT_SUB_OBJECT_ID, hubspotSubId, "company", companyHubspotId, ASSOC_SUB_TO_COMPANY);

      // 3. PROCESAR LOS ÍTEMS HIJOS DE ESTA SUSCRIPCIÓN ESPECÍFICA
      const relatedItems = allItems.filter(item => item.subscription_id === sub.subscription_id);
      
      if (relatedItems.length === 0) {
        console.log(`ℹ️ La suscripción no tiene ítems hijos asociados en este momento.`);
        continue;
      }

      const itemInputs = relatedItems.map(item => {
        let featuresText = "";
        try {
          // Si guardaste las features como JSONB, vendrán estructuradas como objeto/array de JS directamente
          const parsed = typeof item.features === 'string' ? JSON.parse(item.features) : item.features;
          featuresText = Array.isArray(parsed) ? parsed.join(", ") : String(parsed || "");
        } catch (e) {
          featuresText = String(item.features || "");
        }

        return {
          idProperty: "stripe_item_id_unique",
          id: item.stripe_item_id,
          properties: {
            subscription_item_name: `${item.product_name || 'Item'} - ${item.stripe_item_id}`,
            stripe_item_id_unique: item.stripe_item_id,
            nup_center_id: sub.nup_center_id,
            
            // ✅ Ahora tirará del nuevo intervalMap en minúsculas
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
            stripe_product_id: item.stripe_product_id || "",
            subscription_id: item.subscription_id,
            status: statusMap[String(item.status).toLowerCase()],
            precanceled_date:item.precanceled_date
            
          }
        };
      });

      console.log(`🚀 Sincronizando ${itemInputs.length} Subscription Items para este padre...`);
      const itemsUpsertRes = await fetch(`https://api.hubapi.com/crm/v3/objects/${ITEM_OBJECT_ID}/batch/upsert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${HUBSPOT_TOKEN}` },
        body: JSON.stringify({ inputs: itemInputs })
      });

      const itemsUpsertData = await itemsUpsertRes.json();
      if (!itemsUpsertRes.ok) {
        console.error(`❌ Falló Upsert de ítems para ${sub.subscription_id}:`, JSON.stringify(itemsUpsertData));
        continue;
      }
      console.log(`✅ Ítems sincronizados con éxito.`);

      // 4. CREAR LAS ASOCIACIONES DE LOS ÍTEMS (Ítem ➔ Empresa e Ítem ➔ Suscripción Padre)
      for (const record of itemsUpsertData.results) {
        const hubspotItemId = record.id;

        // Enlace: Ítem ➔ Empresa
        await createAssociation(ITEM_OBJECT_ID, hubspotItemId, "company", companyHubspotId, ASSOC_ITEM_TO_COMPANY);

        // Enlace: Ítem ➔ Suscripción Padre
        await createAssociation(ITEM_OBJECT_ID, hubspotItemId, ACCOUNT_SUB_OBJECT_ID, hubspotSubId, ASSOC_ITEM_TO_SUB);
      }
    }

    console.log("\n-------------------------------------------------------------");
    console.log("🎉 [FIN] ¡Sincronización masiva completada con éxito!");

  } catch (error) {
    console.error("⛔ [ERROR CRÍTICO]:", error.message);
  } finally {
    await pool.end();
  }
}

// ============================================================================
// FUNCIONES AUXILIARES DE API HUBSPOT
// ============================================================================

async function findCompanyHubspotId(nupCenterId) {
  const response = await fetch('https://api.hubapi.com/crm/v3/objects/companies/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${HUBSPOT_TOKEN}` },
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: "nup_center_id", operator: "EQ", value: String(nupCenterId) }] }]
    })
  });
  const data = await response.json();
  if (!response.ok || data.total === 0) throw new Error(`Empresa con nup_center_id '${nupCenterId}' no encontrada en HubSpot.`);
  return data.results[0].id;
}

async function createAssociation(fromObjectType, fromId, toObjectType, toId, associationTypeId) {
  const response = await fetch(`https://api.hubapi.com/crm/v4/objects/${fromObjectType}/${fromId}/associations/${toObjectType}/${toId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${HUBSPOT_TOKEN}` },
    body: JSON.stringify([{ "associationCategory": "USER_DEFINED", "associationTypeId": associationTypeId }])
  });
  
  if (!response.ok) {
     const err = await response.json();
     console.error(`  ⚠️ [ERROR RELACIÓN] No se pudo crear relación ${fromObjectType}(${fromId}) ➔ ${toObjectType}(${toId}) [Regla: ${associationTypeId}]:`, err.message);
  }
  return response.ok;
}

main();