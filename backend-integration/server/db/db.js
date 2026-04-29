const { Pool } = require('pg');
const { log } = require("../utils/logger")

// ────── Database Connection Configuration ───────────────
// ─── Pool to establish connection to the database
// ─── We export it to use it in other files
// ────────────────────────────────────────────────────────
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT),
});

pool.on('connect', () => 
  log("INFO", "DB", "PostgreSQL connected")
);

pool.on('error', (err) => 
  log("ERROR", "DB", "Database error", { error: err.message })
);

module.exports = { pool };