// config.js
const Redis = require('ioredis');

// Configuración EXPLÍCITA para Redis Cloud
const redisConfig = {
  host: 'redis-11222.c323.us-east-1-2.ec2.redns.redis-cloud.com',
  port: 11222,
  username: 'default', 
  password: 'L7BkBpcldBCIInrixyd4DQotyvLxLGgQ',
  tls: {
    rejectUnauthorized: false,
    // Opciones SSL específicas para Redis Cloud
    ciphers: 'DEFAULT:@SECLEVEL=1',
    minVersion: 'TLSv1.2',
    maxVersion: 'TLSv1.3'
  },
  connectTimeout: 10000,
  maxRetriesPerRequest: 1, // REDUCIDO para fail-fast
  enableReadyCheck: true,
  retryStrategy: (times) => {
    if (times > 3) return null; // Máximo 3 intentos
    return Math.min(times * 200, 1000);
  }
};

const redis = new Redis(redisConfig);

// Event handlers
redis.on('connect', () => console.log('✅ Conectando a Redis Cloud...'));
redis.on('ready', () => console.log('✅ Redis Cloud conectado y autenticado'));
redis.on('error', (err) => {
  console.error('❌ Error de Redis:', err.message);
  // Log adicional para debugging SSL
  if (err.code === 'ERR_SSL_WRONG_VERSION_NUMBER') {
    console.error('🔍 Problema de TLS/SSL: Revisa configuración SSL');
  }
});
redis.on('end', () => console.log('🔌 Conexión Redis cerrada'));
redis.on('reconnecting', () => console.log('🔄 Reconectando a Redis...'));

// Test de conexión después de conectar
redis.on('ready', async () => {
  try {
    await redis.set('connection_test', 'success');
    const test = await redis.get('connection_test');
    console.log('🧪 Test de conexión:', test);
  } catch (err) {
    console.error('❌ Test de conexión falló:', err.message);
  }
});

module.exports = redis;