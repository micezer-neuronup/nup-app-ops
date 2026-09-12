// scripts/testWebhook.js
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../../.env.development') });

const { processSubscriptionUpsert } = require('../services/subscriptionServices');



// Evento simulado de Stripe
const fakeEvent = {
  id: 'evt_test_manual_' + Date.now(),
  type: 'customer.subscription.updated',
  created: Math.floor(Date.now() / 1000),
  data: {
    object: {
      id: 'sub_9RiP8LpKHcu2WL',  // <--- CAMBIA ESTO POR EL ID QUE QUIERAS PROBAR
      customer: 'cus_9RiPQdtOlMyNZl'
    }
  }
};

async function test() {
  console.log('🚀 Simulando webhook para:', fakeEvent.data.object.id);
  try {
    await processSubscriptionUpsert(fakeEvent);
    console.log('✅ Webhook procesado correctamente');
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    process.exit();
  }
}

test();