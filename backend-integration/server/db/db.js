const { Pool } = require('pg');
const { log } = require("../utils/logger");

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT),  
  max: 2, 
  idleTimeoutMillis: 10000, 
  connectionTimeoutMillis: 5000, 
});

pool.on('connect', () => 
  log("INFO", "DB", "PostgreSQL connected")
);

pool.on('error', (err) => 
  log("ERROR", "DB", "Database error", { error: err.message })
);

module.exports = { pool };