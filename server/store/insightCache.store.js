const cache = new Map();
const previousSuggestions = new Map();

const ttlMs = 5 * 60 * 1000;

export const setInsightCache = (key, value) => {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
};

export const getInsightCache = (key) => {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(key);
    return null;
  }
  return hit.value;
};

export const suppressRepeatedSuggestions = (conversationId, suggestions = []) => {
  const key = String(conversationId || 'global');
  const previous = new Set(previousSuggestions.get(key) || []);
  const next = suggestions.filter((item) => !previous.has(item));
  previousSuggestions.set(key, suggestions);
  return next;
};

