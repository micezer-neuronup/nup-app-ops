const fs = require('fs');
const dotenv = require('dotenv');
const path = require('path');

let envFile = process.env.NODE_ENV === 'production' ? '../../.env.production' : '../../.env.development';
let envPath = path.resolve(__dirname, envFile);

if (!fs.existsSync(envPath)) {
  envPath = path.resolve(__dirname, '../../.env');
}

dotenv.config({ path: envPath });

if (!process.env.DB_PASSWORD || !process.env.STRIPE_SECRET_KEY) {
  console.error("[FATAL ERROR] Faltan variables (DB_PASSWORD o STRIPE_SECRET_KEY). Revisa tu .env");
  process.exit(1);
}

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const SUB_ID = 'sub_HwP2wQgxAKAotN';

// ============================================================================
// LÓGICA DE EXTRACCIÓN MÁXIMA
// ============================================================================
async function dumpFullSubscriptionData() {
  console.log(`[INFO] Extrayendo la suscripción ${SUB_ID} con expansión máxima...`);
  
  try {
    // Le pedimos a Stripe que no nos dé solo IDs, sino que nos traiga los objetos completos
    const subscription = await stripe.subscriptions.retrieve(SUB_ID, {
      expand: [
        'customer', 
        'latest_invoice', 
        'default_payment_method',
        'schedule',
        'items.data.price.product'
      ]
    });

    // Preparamos el archivo de salida
    const fileName = `full_dump_${SUB_ID}.json`;
    const outputPath = path.join(__dirname, fileName);

    // Escribimos el JSON formateado (2 espacios) para que sea fácil de inspeccionar
    fs.writeFileSync(outputPath, JSON.stringify(subscription, null, 2), 'utf-8');

    console.log(`[ÉXITO] 🎉 Volcado completo guardado en:`);
    console.log(`-> ${outputPath}`);
    console.log(`\n[INSTRUCCIONES] Abre el archivo '${fileName}' en VS Code y busca '147710'. ¡Ahí estará la ruta exacta!`);

  } catch (error) {
    console.error(`[ERROR] Fallo al recuperar la suscripción de Stripe:`, error.message);
  }
}

dumpFullSubscriptionData();