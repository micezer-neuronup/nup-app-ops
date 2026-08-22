const { Client } = require('pg');

// Configuración de tu conexión local al Sandbox
const client = new Client({
  user: 'michael',
  host: 'localhost',
  database: 'michael_db',
  password: 'Lc17ma1a2e17b',
  port: 5432,
});

async function getUpsellCandidates() {
  await client.connect();
  
  // Buscamos centros con >= 15 tests en los últimos 7 días
  const query = `
    SELECT 
        center_id,
        SUM(tests_started) AS total_tests
    FROM daily_stats
    WHERE stat_date >= CURRENT_DATE - INTERVAL '7 day'
    GROUP BY center_id
    HAVING SUM(tests_started) >= 15;
  `;

  try {
    const res = await client.query(query);
    console.log("Centros detectados para Upsell:", res.rows);
    return res.rows; // Esto debería devolver solo [{ center_id: 103, total_tests: X }]
  } catch (err) {
    console.error("Error al ejecutar la query de uso:", err.stack);
  } finally {
    await client.end();
  }
}

getUpsellCandidates();