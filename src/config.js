// config.js
const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL, {
  tls: {
    rejectUnauthorized: false, // Necesario para Redis Cloud
  },
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redis.on('connect', () => console.log('✅ Conectado a Redis'));
redis.on('error', (err) => console.error('❌ Error en Redis', err));
redis.on('ready', () => console.log('✅ Redis listo'));
redis.on('reconnecting', () => console.log('🔄 Reconectando a Redis...'));

module.exports = redis;