const { v4: uuidv4 } = require('uuid');
const { supabase } = require('./db');

function ms() {
  return new Date().toISOString();
}

function socketLog(...args) {
  console.log('[RTC-SOCKET]', ...args);
}

function makeCallKey(vetId) {
  return `call:vet:${vetId}`;
}

function makeUserSocketKey(userId) {
  return `user:socket:${userId}`;
}

function makeCallerCallKey(userId) {
  return `call:caller:${userId}`;
}

// Helper para guardar en DB usando Supabase
async function guardarLlamadaEnDB(callObj, extra = {}) {
  try {
    const {
      id,
      callerId,
      vetId,
      estado,
      motivo,
      created_at,
      accepted_at,
      ended_at,
    } = callObj;

    const { data: existingData, error: fetchError } = await supabase
      .from('llamadas')
      .select('duracion_minutos, duracion_segundos, duracion_formato, motivo, precio')
      .eq('id', id)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Error al obtener llamada existente:', fetchError);
      return { error: fetchError };
    }

    let duracionMin = existingData?.duracion_minutos || null;
    let duracionSeg = existingData?.duracion_segundos || null;
    let duracionFormato = existingData?.duracion_formato || null;
    let motivoFinal = extra.motivo || existingData?.motivo || motivo || "emergencia";
    let precioFinal = extra.precio || existingData?.precio || null;

    if (ended_at && accepted_at) {
      const diffMs = new Date(ended_at) - new Date(accepted_at);
      duracionMin = Math.floor(diffMs / 60000);
      duracionSeg = Math.floor(diffMs / 1000);
      const minutos = Math.floor(duracionSeg / 60);
      const segundos = duracionSeg % 60;
      duracionFormato = `${minutos}:${segundos.toString().padStart(2, '0')}`;
    }

    const updateData = {
      id,
      caller_id: callerId || null,
      vet_id: vetId,
      estado,
      motivo: motivoFinal,
      created_at,
      accepted_at: accepted_at || null,
      ended_at: ended_at || null,
      duracion_minutos: duracionMin,
      duracion_segundos: duracionSeg,
      duracion_formato: duracionFormato,
      precio: precioFinal,
      grabacion_url: extra.grabacion_url || null,
      cliente_nombre: extra.cliente_nombre || null,
      cliente_telefono: extra.cliente_telefono || null,
      cliente_localizacion: extra.cliente_localizacion || null,
    };

    socketLog('Guardando en DB:', updateData);

    const { data, error } = await supabase
      .from('llamadas')
      .upsert([updateData], { onConflict: 'id' });

    if (error) {
      console.error('Error guardando llamada en Supabase:', error);
      return { error };
    }

    socketLog('Llamada guardada en DB:', {
      id,
      estado,
      duracion_minutos: duracionMin,
      duracion_segundos: duracionSeg,
      duracion_formato: duracionFormato,
      motivo: motivoFinal,
      precio: precioFinal,
      cliente_nombre: extra.cliente_nombre,
      cliente_telefono: extra.cliente_telefono,
    });
    return { data };
  } catch (err) {
    console.error('Error guardando llamada en DB:', err);
    return { error: err.message };
  }
}

// Setup socket handlers
function setupSocketHandlers(io, redis) {
  const socketToUser = new Map();
  
  // Verificar que Redis esté conectado
  if (redis.status !== 'ready') {
    console.warn('⚠️ Redis no está listo, algunas funciones pueden no trabajar');
  }

  io.on('connection', (socket) => {
    socketLog('conectado', socket.id);

    socket.on('register', async ({ userId, role }) => {
      try {
        if (!userId) return;
        await redis.set(makeUserSocketKey(userId), socket.id);
        socketToUser.set(socket.id, userId);
        socketLog(`register user=${userId} role=${role} socket=${socket.id}`);
        socket.emit('registered', { ok: true });
      } catch (err) {
        console.error('Error register:', err);
      }
    });

    socket.on('iniciar_llamada', async ({ usuarioId, veterinarioId, motivo, extra }) => {
      try {
        if (!usuarioId || !veterinarioId) {
          socket.emit('llamada_error', { message: 'usuarioId y veterinarioId requeridos' });
          return;
        }
        const callKey = makeCallKey(veterinarioId);
        const existing = await redis.get(callKey);
        if (existing) {
          socket.emit('llamada_ocupado', { message: 'Veterinario ocupado' });
          return;
        }

        await redis.set(makeUserSocketKey(usuarioId), socket.id);
        socketToUser.set(socket.id, usuarioId);

        const callObj = {
          id: uuidv4(),
          callerId: usuarioId,
          callerSocketId: socket.id,
          vetId: veterinarioId,
          estado: 'ringing',
          motivo: motivo || "emergencia",
          created_at: ms(),
          extra: extra || {},
        };
        await redis.set(callKey, JSON.stringify(callObj), 'EX', 60 * 30);
        const callerCallKey = makeCallerCallKey(usuarioId);
        await redis.set(callerCallKey, veterinarioId, 'EX', 60 * 30);

        await guardarLlamadaEnDB(callObj, callObj.extra);

        const vetSocketId = await redis.get(makeUserSocketKey(veterinarioId));
        if (vetSocketId) {
          io.to(vetSocketId).emit('incoming_call', {
            call: {
              ...callObj,
              cliente_nombre: extra?.cliente_nombre,
              cliente_telefono: extra?.cliente_telefono,
            },
            from: usuarioId,
          });
          socket.emit('llamada_iniciada', { message: 'Llamada enviada', call: callObj });
        } else {
          socket.emit('llamada_rechazada', { message: 'Veterinario no disponible' });
          await redis.del(callKey);
          await redis.del(callerCallKey);
        }
      } catch (err) {
        console.error('Error iniciar_llamada:', err);
        socket.emit('llamada_error', { message: 'Error interno' });
      }
    });

    socket.on('aceptar_llamada', async ({ veterinarioId, usuarioId }) => {
      try {
        const callKey = makeCallKey(veterinarioId);
        const data = await redis.get(callKey);
        if (!data) {
          socket.emit('aceptar_error', { message: 'No existe llamada' });
          return;
        }
        const callObj = JSON.parse(data);
        if (callObj.callerId !== usuarioId) {
          socket.emit('aceptar_error', { message: 'IDs no coinciden' });
          return;
        }
        callObj.estado = 'accepted';
        callObj.accepted_at = ms();
        await redis.set(callKey, JSON.stringify(callObj), 'EX', 60 * 120);

        await guardarLlamadaEnDB(callObj, callObj.extra || {});

        const callerSocket = callObj.callerSocketId || (await redis.get(makeUserSocketKey(usuarioId)));
        if (callerSocket) io.to(callerSocket).emit('call_accepted', { veterinarianId: veterinarioId, call: callObj });
        socket.emit('accepted_ack', { ok: true, call: callObj });
      } catch (err) {
        console.error('aceptar_llamada err', err);
        socket.emit('aceptar_error', { message: 'Error interno' });
      }
    });

    socket.on('rechazar_llamada', async ({ veterinarioId, usuarioId, motivo }) => {
      try {
        const callKey = makeCallKey(veterinarioId);
        const data = await redis.get(callKey);
        if (!data) {
          socket.emit('rechazar_error', { message: 'No existe llamada' });
          return;
        }
        const callObj = JSON.parse(data);

        callObj.estado = 'rejected';
        callObj.ended_at = ms();
        await guardarLlamadaEnDB(callObj, { ...callObj.extra, motivo });

        const callerSocket = callObj.callerSocketId || (await redis.get(makeUserSocketKey(usuarioId)));
        if (callerSocket) {
          io.to(callerSocket).emit('llamada_rechazada', { veterinarianId: veterinarioId, reason: motivo || 'Veterinario no disponible' });
        }

        await redis.del(callKey);
        const callerCallKey = makeCallerCallKey(usuarioId);
        await redis.del(callerCallKey);
        socket.emit('rechazar_ack', { ok: true });
      } catch (err) {
        console.error('rechazar_llamada err', err);
        socket.emit('rechazar_error', { message: 'Error interno' });
      }
    });

    socket.on('finalizar_llamada', async ({ usuarioId, veterinarioId, extra }) => {
      try {
        const callKey = makeCallKey(veterinarioId);
        const data = await redis.get(callKey);
        if (data) {
          const callObj = JSON.parse(data);
          callObj.estado = 'ended';
          callObj.ended_at = ms();

          const combinedExtra = { 
            ...callObj.extra, 
            ...extra,
            motivo: extra?.motivo || callObj.motivo || "emergencia",
            precio: extra?.precio || null,
          };

          await guardarLlamadaEnDB(callObj, combinedExtra);

          const callerSocket = callObj.callerSocketId || (await redis.get(makeUserSocketKey(callObj.callerId)));
          const vetSocket = await redis.get(makeUserSocketKey(veterinarioId));
          if (callerSocket) io.to(callerSocket).emit('call_ended', { by: usuarioId || 'system' });
          if (vetSocket) io.to(vetSocket).emit('call_ended', { by: usuarioId || 'system' });

          await redis.del(callKey);
          const callerCallKey = makeCallerCallKey(callObj.callerId);
          await redis.del(callerCallKey);

          socketLog(`Llamada finalizada: vet=${veterinarioId}, caller=${callObj.callerId}`);
        }
        socket.emit('finalizar_ack', { ok: true });
      } catch (err) {
        console.error('finalizar_llamada err', err);
        socket.emit('finalizar_error', { message: 'Error interno' });
      }
    });

    socket.on('webrtc_offer', async ({ from: fromId, to: toId, sdp }) => {
      try {
        const targetSocket = await redis.get(makeUserSocketKey(toId));
        if (targetSocket) {
          io.to(targetSocket).emit('webrtc_offer', { from: fromId, sdp });
        } else {
          socket.emit('signaling_error', { message: 'Destino no conectado' });
        }
      } catch (err) {
        console.error('webrtc_offer err', err);
      }
    });

    socket.on('webrtc_answer', async ({ from: fromId, to: toId, sdp }) => {
      try {
        const targetSocket = await redis.get(makeUserSocketKey(toId));
        if (targetSocket) {
          io.to(targetSocket).emit('webrtc_answer', { from: fromId, sdp });
        } else {
          socket.emit('signaling_error', { message: 'Destino no conectado' });
        }
      } catch (err) {
        console.error('webrtc_answer err', err);
      }
    });

    socket.on('webrtc_ice_candidate', async ({ from: fromId, to: toId, candidate }) => {
      try {
        const targetSocket = await redis.get(makeUserSocketKey(toId));
        if (targetSocket) {
          io.to(targetSocket).emit('webrtc_ice_candidate', { from: fromId, candidate });
        }
      } catch (err) {
        console.error('webrtc_ice_candidate err', err);
      }
    });

    socket.on('disconnect', async () => {
      const userId = socketToUser.get(socket.id);
      socketLog('disconnect', socket.id, 'userId=', userId);
      try {
        if (userId) {
          await redis.del(makeUserSocketKey(userId));
          socketToUser.delete(socket.id);

          const callerCallKey = makeCallerCallKey(userId);
          const vetId = await redis.get(callerCallKey);
          if (vetId) {
            const callKey = makeCallKey(vetId);
            const val = await redis.get(callKey);
            if (val) {
              const callObj = JSON.parse(val);
              if (callObj.callerId === userId) {
                const vetSocket = await redis.get(makeUserSocketKey(vetId));
                if (vetSocket) io.to(vetSocket).emit('call_ended', { by: userId, reason: 'caller disconnected' });
                callObj.estado = 'ended';
                callObj.ended_at = ms();
                await guardarLlamadaEnDB(callObj, { ...callObj.extra, motivo: 'caller disconnected' });
                await redis.del(callKey);
              }
            }
            await redis.del(callerCallKey);
          }

          const vetCallKey = makeCallKey(userId);
          const vetVal = await redis.get(vetCallKey);
          if (vetVal) {
            const callObj = JSON.parse(vetVal);
            const callerSocket = await redis.get(makeUserSocketKey(callObj.callerId));
            if (callerSocket) io.to(callerSocket).emit('call_ended', { by: userId, reason: 'vet disconnected' });
            callObj.estado = 'ended';
            callObj.ended_at = ms();
            await guardarLlamadaEnDB(callObj, { ...callObj.extra, motivo: 'vet disconnected' });
            await redis.del(vetCallKey);
            const callerCallKey = makeCallerCallKey(callObj.callerId);
            await redis.del(callerCallKey);
          }
        }
      } catch (err) {
        console.error('Disconnect cleanup error', err);
      }
    });
  });
}

// REST handlers
async function iniciarLlamadaREST(req, res) {
  try {
    const { usuarioId, veterinarioId, motivo, extra } = req.body;
    if (!usuarioId || !veterinarioId) return res.status(400).json({ error: 'usuarioId y veterinarioId son requeridos' });
    const callKey = makeCallKey(veterinarioId);
    const existing = await req.redis.get(callKey);
    if (existing) return res.status(409).json({ error: 'Veterinario ocupado' });
    const callerSocket = await req.redis.get(makeUserSocketKey(usuarioId));
    if (!callerSocket) return res.status(404).json({ error: 'Usuario no conectado' });

    const callObj = {
      id: uuidv4(),
      callerId: usuarioId,
      callerSocketId: callerSocket,
      vetId: veterinarioId,
      estado: 'ringing',
      motivo: motivo || "emergencia",
      created_at: ms(),
      extra: extra || {},
    };
    await req.redis.set(callKey, JSON.stringify(callObj), 'EX', 60 * 30);
    const callerCallKey = makeCallerCallKey(usuarioId);
    await req.redis.set(callerCallKey, veterinarioId, 'EX', 60 * 30);

    await guardarLlamadaEnDB(callObj, callObj.extra);

    const vetSocket = await req.redis.get(makeUserSocketKey(veterinarioId));
    if (vetSocket) {
      req.io.to(vetSocket).emit('incoming_call', {
        call: {
          ...callObj,
          cliente_nombre: extra?.cliente_nombre,
          cliente_telefono: extra?.cliente_telefono,
        },
        from: usuarioId,
      });
    }
    return res.status(201).json({ message: 'Llamada iniciada', call: callObj });
  } catch (err) {
    console.error('iniciarLlamadaREST err', err);
    return res.status(500).json({ error: 'Error interno' });
  }
}

async function finalizarLlamadaREST(req, res) {
  try {
    const { id, usuarioId, veterinarioId, precio, grabacion_url, cliente_nombre, cliente_telefono, cliente_localizacion, motivo } = req.body;
    if (!id && !veterinarioId) return res.status(400).json({ error: 'id o veterinarioId requerido' });

    const callKey = makeCallKey(veterinarioId);
    const data = await req.redis.get(callKey);
    let callObj = {
      id,
      callerId: usuarioId || null,
      vetId: veterinarioId || null,
      estado: 'ended',
      ended_at: ms(),
      motivo: motivo || "emergencia",
    };
    let combinedExtra = { precio, grabacion_url, cliente_nombre, cliente_telefono, cliente_localizacion, motivo };

    if (data) {
      const storedCallObj = JSON.parse(data);
      callObj = { ...storedCallObj, estado: 'ended', ended_at: ms(), motivo: motivo || storedCallObj.motivo || "emergencia" };
      combinedExtra = { ...storedCallObj.extra, precio, grabacion_url, cliente_nombre, cliente_telefono, cliente_localizacion, motivo };
    }

    await guardarLlamadaEnDB(callObj, combinedExtra);

    if (veterinarioId) {
      await req.redis.del(callKey);
      const callerCallKey = makeCallerCallKey(usuarioId);
      await req.redis.del(callerCallKey);
    }

    return res.json({ message: 'Llamada finalizada y guardada' });
  } catch (err) {
    console.error('finalizarLlamadaREST err', err);
    return res.status(500).json({ error: 'Error interno' });
  }
}

module.exports = {
  setupSocketHandlers,
  iniciarLlamadaREST,
  finalizarLlamadaREST,
};