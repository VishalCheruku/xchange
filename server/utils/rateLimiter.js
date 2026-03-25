export class SlidingWindowLimiter {
  constructor({ limit, windowMs }) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.events = new Map();
  }

  attempt(key) {
    const now = Date.now();
    const threshold = now - this.windowMs;
    const history = this.events.get(key) || [];
    const fresh = history.filter((ts) => ts > threshold);

    if (fresh.length >= this.limit) {
      this.events.set(key, fresh);
      return { allowed: false, remaining: 0, retryAfterMs: fresh[0] + this.windowMs - now };
    }

    fresh.push(now);
    this.events.set(key, fresh);

    return { allowed: true, remaining: this.limit - fresh.length, retryAfterMs: 0 };
  }
}

export const readUserKey = (source = {}) => {
  const fromHeader = source?.headers?.['x-user-id'];
  const fromBody = source?.body?.userId;
  const fromQuery = source?.query?.userId;
  const fromSocket = source?.handshake?.auth?.userId || source?.handshake?.query?.userId;
  return String(fromHeader || fromBody || fromQuery || fromSocket || 'anonymous');
};

