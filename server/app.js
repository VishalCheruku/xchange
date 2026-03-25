import cors from 'cors';
import express from 'express';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import aiRoutes from './routes/ai.routes.js';

export const createApp = () => {
  const app = express();

  app.use(
    cors({
      origin: env.FRONTEND_ORIGIN,
      methods: ['GET', 'POST'],
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'xchange-ai-orchestrator',
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/ai', aiRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

