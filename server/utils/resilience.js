export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const withTimeout = async (promise, timeoutMs, label = 'Operation') => {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
};

export const withRetry = async (task, { retries = 3, baseDelayMs = 250, factor = 2 } = {}) => {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await task(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= retries) break;
      const backoffMs = baseDelayMs * (factor ** (attempt - 1));
      const jitterMs = Math.floor(Math.random() * 100);
      await delay(backoffMs + jitterMs);
    }
  }

  throw lastError;
};

