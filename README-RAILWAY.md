# RTC Service - Railway deployment notes

Este servicio es el núcleo de comunicaciones en tiempo real (WebRTC + signaling) y usa Redis para coordinación y estado.

Cambios realizados:
- Añadido soporte para `@socket.io/redis-adapter` en `src/index.js` (usa `REDIS_URL`).
- `start` script en package.json: `node src/index.js`.
- Añadido `.dockerignore` y `.env.example`.
- Se creó un Dockerfile (existente) se preserva; puede usarse tal cual o reemplazarse por el recomendado.

Variables de entorno requeridas:
- REDIS_URL
- SUPABASE_URL
- SUPABASE_API_KEY
- (opcional) PORT

Importante: Para sesiones P2P con WebRTC en producción probablemente necesitarás un **TURN server** (coturn o un servicio externo). Vea notas en README completo.
