import path from 'node:path';

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: toNumber(process.env.AI_SERVER_PORT, 8787),
  FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
  AI_TIMEOUT_MS: toNumber(process.env.AI_TIMEOUT_MS, 30000),
  AI_RETRIES: toNumber(process.env.AI_RETRIES, 3),
  RATE_LIMIT_PER_MINUTE: toNumber(process.env.AI_RATE_LIMIT_PER_MINUTE, 10),
  AUDIT_LOG_PATH: process.env.AI_AUDIT_LOG_PATH || path.resolve(process.cwd(), 'server', 'logs', 'ai-audit.log'),
};

