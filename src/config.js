require('dotenv').config();
const Redis = require('ioredis');

// Configuración optimizada para Redis Cloud
const redis = new Redis(process.env.REDIS_URL, {
  tls: {
    rejectUnauthorized: false
  },
  connectTimeout: 10000,
  retryStrategy: (times) => {
    if (times > 3) return null; // Stop retrying after 3 attempts
    return Math.min(times * 200, 3000); // Retry with backoff
  }
});

redis.on('connect', () => console.log('✅ Conectado a Redis'));
redis.on('error', (err) => console.error('❌ Error en Redis:', err.message));
redis.on('ready', () => console.log('✅ Redis listo para usar'));
redis.on('reconnecting', () => console.log('🔄 Reconectando a Redis...'));

module.exports = redis;