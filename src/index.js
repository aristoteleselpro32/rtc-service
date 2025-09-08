require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const Redis = require('ioredis');

const ioredis = require('./config');
const { setupSocketHandlers } = require('./controllers');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4007;
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*' },
});

// Setup Redis adapter con ioredis - CONFIGURACIÓN ESPECÍFICA PARA REDIS CLOUD
// En tu index.js, modifica la función setupRedisAdapter():
async function setupRedisAdapter() {
  try {
    console.log('🔧 Configurando Redis adapter...');
    
    const redisConfig = {
      host: 'redis-11222.c323.us-east-1-2.ec2.redns.redis-cloud.com',
      port: 11222,
      username: 'default',
      password: 'L7BkBpcldBCIInrixyd4DQotyvLxLGgQ',
      tls: {
        rejectUnauthorized: false,
        ciphers: 'DEFAULT:@SECLEVEL=1',
        minVersion: 'TLSv1.2',
        maxVersion: 'TLSv1.3'
      },
      connectTimeout: 8000,
      maxRetriesPerRequest: 1,
      enableReadyCheck: true
    };

    const pubClient = new Redis(redisConfig);
    const subClient = new Redis(redisConfig);

    // Manejo robusto de errores
    pubClient.on('error', (err) => {
      console.error('❌ Pub Client Error:', err.message);
    });

    subClient.on('error', (err) => {
      console.error('❌ Sub Client Error:', err.message);
    });

    pubClient.on('connect', () => {
      console.log('✅ Pub Client conectado');
    });

    subClient.on('connect', () => {
      console.log('✅ Sub Client conectado');
    });

    // Esperar conexión con timeout
    const connectWithTimeout = (client, name) => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Timeout conectando ${name}`));
        }, 5000);

        client.once('ready', () => {
          clearTimeout(timeout);
          resolve();
        });

        client.once('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
    };

    await Promise.all([
      connectWithTimeout(pubClient, 'pub'),
      connectWithTimeout(subClient, 'sub')
    ]);
    
    const { createAdapter } = require('@socket.io/redis-adapter');
    io.adapter(createAdapter(pubClient, subClient));
    
    console.log('✅ Socket.IO Redis adapter configurado');
    
  } catch (err) {
    console.error('❌ Error configurando Redis adapter:', err.message);
    console.log('⚠️ Usando adapter en memoria para Socket.IO');
  }
}
// Health check simple
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    redis: ioredis.status || 'unknown',
    service: 'RTC-Service'
  });
});

// Initialize
(async () => {
  await setupRedisAdapter();
  setupSocketHandlers(io, ioredis);
})();

// Routes
const rtcRoutes = require('./routes');
app.use('/api/rtc', rtcRoutes(io, ioredis));

// Manejo básico de errores
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ RTC-Service corriendo en http://localhost:${PORT}`);
});

// Verificar conexión a Redis después de iniciar
setTimeout(async () => {
  try {
    if (ioredis.status === 'ready') {
      await ioredis.set('server_start', new Date().toISOString());
      console.log('✅ Redis connection test successful');
    }
  } catch (err) {
    console.error('❌ Redis connection test failed:', err.message);
  }
}, 2000);