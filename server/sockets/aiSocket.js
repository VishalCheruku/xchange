import { checkSocketRate } from '../middleware/rateLimit.js';
import { runAllLayers } from '../services/ai/aiOrchestrator.service.js';
import { readUserKey } from '../utils/rateLimiter.js';

export const registerAISocket = (io) => {
  io.on('connection', (socket) => {
    const userId = readUserKey(socket);

    socket.on('ai:message', async (payload = {}) => {
      const uid = payload?.userId || userId;
      const rate = checkSocketRate(uid);
      if (!rate.allowed) {
        socket.emit('ai:error', {
          ok: false,
          error: 'Rate limit exceeded',
          retryAfterMs: rate.retryAfterMs,
        });
        return;
      }

      if (!payload?.aiMode) {
        socket.emit('ai:insight', {
          ok: true,
          aiMode: false,
          requestId: payload?.requestId || null,
          result: null,
        });
        return;
      }

      try {
        const result = await runAllLayers({
          ...payload,
          userId: uid,
        });
        socket.emit('ai:insight', {
          ok: true,
          aiMode: true,
          requestId: payload?.requestId || null,
          result,
        });
      } catch (error) {
        console.error('Socket AI message failed:', error);
        socket.emit('ai:error', {
          ok: false,
          requestId: payload?.requestId || null,
          error: error?.message || 'AI processing failed',
        });
      }
    });
  });
};

