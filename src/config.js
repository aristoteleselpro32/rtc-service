// config.js
const Redis = require('ioredis');

const redis = new Redis({
  host: 'redis-11222.c323.us-east-1-2.ec2.redns.redis-cloud.com',
  port: 11222,
  username: 'default',
  password: 'L7BkBpcldBCIInrixyd4DQotyvLxLGgQ',
  tls: {
    rejectUnauthorized: false,
    servername: 'redis-11222.c323.us-east-1-2.ec2.redns.redis-cloud.com'
  },
  retryStrategy: (times) => {
    const delay = Math.min(times * 100, 3000);
    return delay;
  },
  maxRetriesPerRequest: 3,
  enableReadyCheck: false
});

redis.on('connect', () => console.log('✅ Conectado a Redis'));
redis.on('error', (err) => console.error('❌ Error en Redis:', err.message));
redis.on('ready', () => console.log('✅ Redis listo y autenticado'));
redis.on('reconnecting', () => console.log('🔄 Reconectando a Redis...'));

module.exports = redis;