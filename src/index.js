require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { createClient } = require('redis');
const { createAdapter } = require('@socket.io/redis-adapter');

const ioredis = require('./config'); // existing ioredis client (used by controllers for KV)
const { setupSocketHandlers } = require('./controllers');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4007;
const server = http.createServer(app);

// Create a Socket.IO server
const io = new Server(server, {
  cors: { origin: '*' },
  // you can tweak pingInterval/pingTimeout here if needed
});

// Setup Redis adapter for Socket.IO (enables horizontal scaling)
async function setupRedisAdapter() {
  if (!process.env.REDIS_URL) {
    console.warn('⚠️ REDIS_URL not set — Socket.IO Redis adapter disabled. Using in-memory adapter.');
    return;
  }
  try {
    const pubClient = createClient({
      url: process.env.REDIS_URL,
      socket: {
        tls: true,
        rejectUnauthorized: false,
        connectTimeout: 10000
      }
    });

    const subClient = pubClient.duplicate();

    pubClient.on('error', (err) => console.error('❌ Pub Client Error:', err.message));
    subClient.on('error', (err) => console.error('❌ Sub Client Error:', err.message));

    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    console.log('✅ Socket.IO Redis adapter configured with Redis Cloud');
  } catch (err) {
    console.error('❌ Error configuring Socket.IO Redis adapter:', err.message);
    console.log('⚠️ Using in-memory adapter instead');
  }
}

// Initialize adapter and handlers
(async () => {
  await setupRedisAdapter();
  setupSocketHandlers(io, ioredis);
})();

// Mount HTTP API routes (controllers expect io and redis via middleware inside routes)
const rtcRoutes = require('./routes');
app.use('/api/rtc', rtcRoutes(io, ioredis));

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ RTC-Service corriendo en http://localhost:${PORT}`);
});
