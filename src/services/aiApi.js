const DEFAULT_BASE = import.meta.env.VITE_AI_API_BASE_URL || 'http://localhost:8787';
const AI_TIMEOUT_MS = 30000;

const withTimeout = async (url, options = {}, timeoutMs = AI_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
};

const getJson = async (path, userId) => {
  const response = await withTimeout(`${DEFAULT_BASE}${path}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': String(userId || 'anonymous'),
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`AI API ${path} failed (${response.status}): ${detail}`);
  }

  return response.json();
};

const postJson = async (path, payload) => {
  const response = await withTimeout(`${DEFAULT_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': String(payload?.userId || 'anonymous'),
    },
    body: JSON.stringify(payload || {}),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`AI API ${path} failed (${response.status}): ${detail}`);
  }

  return response.json();
};

export const aiApiBaseUrl = DEFAULT_BASE;

export const fetchFullAIInsights = async (payload) => {
  try {
    const data = await postJson('/api/ai/full', payload);
    return data?.result || null;
  } catch (error) {
    console.warn('Full AI insights unavailable, fallback to normal UX:', error?.message || error);
    return null;
  }
};

export const fetchAdaptiveProfile = async (userId) => {
  try {
    const data = await getJson(`/api/ai/profile?userId=${encodeURIComponent(String(userId || 'anonymous'))}`, userId);
    return data?.profile || null;
  } catch (error) {
    console.warn('Adaptive profile unavailable:', error?.message || error);
    return null;
  }
};

export const rankListingsByProfile = async ({ userId, listings }) => {
  try {
    const data = await postJson('/api/ai/rank-listings', { userId, listings });
    return {
      rankedListings: data?.rankedListings || [],
      profile: data?.profile || null,
    };
  } catch (error) {
    console.warn('Profile ranking unavailable:', error?.message || error);
    return {
      rankedListings: [],
      profile: null,
    };
  }
};

export const pushAdaptiveInteraction = async ({ userId, interactionType, listing, transaction }) => {
  try {
    const data = await postJson('/api/ai/profile/interactions', {
      userId,
      interactionType,
      listing,
      transaction,
    });
    return data?.profile || null;
  } catch (error) {
    console.warn('Adaptive interaction tracking failed:', error?.message || error);
    return null;
  }
};
