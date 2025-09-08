require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const Redis = require('ioredis'); // Cambiado a ioredis

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

// Setup Redis adapter con ioredis
async function setupRedisAdapter() {
  if (!process.env.REDIS_URL) {
    console.warn('⚠️ REDIS_URL not set — Socket.IO Redis adapter disabled. Using in-memory adapter.');
    return;
  }
  try {
    const pubClient = new Redis(process.env.REDIS_URL, {
      tls: {
        rejectUnauthorized: false,
      },
    });

    const subClient = new Redis(process.env.REDIS_URL, {
      tls: {
        rejectUnauthorized: false,
      },
    });
    
    const { createAdapter } = require('@socket.io/redis-adapter');
    io.adapter(createAdapter(pubClient, subClient));
    
    console.log('✅ Socket.IO Redis adapter configured');
  } catch (err) {
    console.error('❌ Error configuring Socket.IO Redis adapter', err);
  }
}

// Initialize
(async () => {
  await setupRedisAdapter();
  setupSocketHandlers(io, ioredis);
})();

// Routes
const rtcRoutes = require('./routes');
app.use('/api/rtc', rtcRoutes(io, ioredis));

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ RTC-Service corriendo en http://localhost:${PORT}`);
});