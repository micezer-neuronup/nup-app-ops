const dotenv = require('dotenv');
const path = require('path');

// Carga tus variables de entorno igual que en tu script principal
const envFile = process.env.NODE_ENV === 'production' ? '../.env.production' : '../.env.development';
const envPath = path.resolve(__dirname, envFile);
dotenv.config({ path: envPath });

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const ITEM_OBJECT_ID = "2-203892072";        
const ACCOUNT_SUB_OBJECT_ID = "2-203896755"; 

async function deleteAllRecords(objectTypeId, objectName) {
  console.log(`\n🧹 Iniciando limpieza de ${objectName}...`);
  let hasMore = true;
  let after = undefined;
  let totalDeleted = 0;

  while (hasMore) {
    try {
      // 1. Obtener hasta 100 registros
      const url = `https://api.hubapi.com/crm/v3/objects/${objectTypeId}?limit=100${after ? `&after=${after}` : ''}`;
      const searchRes = await fetch(url, {
        headers: { 'Authorization': `Bearer ${HUBSPOT_TOKEN}` }
      });
      const searchData = await searchRes.json();

      if (!searchData.results || searchData.results.length === 0) {
        console.log(`✨ No quedan más registros en ${objectName}.`);
        break;
      }

      // Preparar los IDs para el borrado masivo
      const idsToDelete = searchData.results.map(record => ({ id: record.id }));

      // 2. Enviar a la papelera (Archive)
      const deleteRes = await fetch(`https://api.hubapi.com/crm/v3/objects/${objectTypeId}/batch/archive`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${HUBSPOT_TOKEN}` 
        },
        body: JSON.stringify({ inputs: idsToDelete })
      });

      if (!deleteRes.ok) {
        console.error(`❌ Error al borrar lote:`, await deleteRes.text());
        break;
      }

      totalDeleted += idsToDelete.length;
      console.log(`🗑️ Lote borrado. Total eliminados: ${totalDeleted}`);

      // 3. Comprobar si hay más páginas
      if (searchData.paging && searchData.paging.next) {
        after = searchData.paging.next.after;
      } else {
        hasMore = false;
      }
    } catch (error) {
      console.error("⛔ Error de conexión:", error.message);
      break;
    }
  }
  console.log(`✅ Limpieza completada para ${objectName}.`);
}

async function run() {
  console.log("🚀 Iniciando protocolo de purga total...");
  // Borramos primero los ítems hijos para no dejar huérfanos
  await deleteAllRecords(ITEM_OBJECT_ID, "Subscription Items");
  // Luego borramos los padres
  await deleteAllRecords(ACCOUNT_SUB_OBJECT_ID, "Account Subscriptions");
  console.log("\n🎉 ¡Portal de HubSpot limpio! Ya puedes ejecutar tu script principal.");
}

run();