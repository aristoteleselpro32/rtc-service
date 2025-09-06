require('dotenv').config();
const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL);

redis.on('connect', () => console.log('✅ Conectado a Redis'));
redis.on('error', (err) => console.error('❌ Error en Redis', err));

module.exports = redis;
