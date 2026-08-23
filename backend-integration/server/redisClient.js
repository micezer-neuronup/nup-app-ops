// server/redisClient.js
const redis = require('redis');
const { log } = require('./utils/logger');

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || 6379;

const redisClient = redis.createClient({
  socket: {
    host: REDIS_HOST,
    port: REDIS_PORT,
  },
});

redisClient.on('error', (err) => {
  log('ERROR', 'REDIS', `Redis error: ${err.message}`);
});

redisClient.on('connect', () => {
  log('INFO', 'REDIS', 'Connected to Redis');
});

redisClient.connect().catch((err) => {
  log('ERROR', 'REDIS', `Failed to connect to Redis: ${err.message}`);
});

async function getCache(key) {
  try {
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    log('ERROR', 'REDIS', `Error getting cache key ${key}: ${error.message}`);
    return null;
  }
}

async function setCache(key, value, ttlSeconds = 14400) {
  try {
    await redisClient.set(key, JSON.stringify(value), { EX: ttlSeconds });
    return true;
  } catch (error) {
    log('ERROR', 'REDIS', `Error setting cache key ${key}: ${error.message}`);
    return false;
  }
}

async function deleteCache(key) {
  try {
    await redisClient.del(key);
    return true;
  } catch (error) {
    log('ERROR', 'REDIS', `Error deleting cache key ${key}: ${error.message}`);
    return false;
  }
}

module.exports = {
  redisClient,
  getCache,
  setCache,
  deleteCache,
};