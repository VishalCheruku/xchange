import { env } from '../config/env.js';
import { SlidingWindowLimiter, readUserKey } from '../utils/rateLimiter.js';

const limiter = new SlidingWindowLimiter({
  limit: env.RATE_LIMIT_PER_MINUTE,
  windowMs: 60 * 1000,
});

export const checkRequestRate = (req, res, next) => {
  const key = readUserKey(req);
  const result = limiter.attempt(key);

  if (!result.allowed) {
    res.status(429).json({
      ok: false,
      error: 'Rate limit exceeded',
      limit: env.RATE_LIMIT_PER_MINUTE,
      retryAfterMs: result.retryAfterMs,
    });
    return;
  }

  res.setHeader('X-RateLimit-Limit', String(env.RATE_LIMIT_PER_MINUTE));
  res.setHeader('X-RateLimit-Remaining', String(result.remaining));
  next();
};

export const checkSocketRate = (userId) => limiter.attempt(String(userId || 'anonymous'));

