import { env } from '../../config/env.js';
import { auditLog } from '../auditLogger.service.js';
import { getInsightCache, setInsightCache, suppressRepeatedSuggestions } from '../../store/insightCache.store.js';
import {
  getPersonalizationSummary,
  getUserProfile,
  updateFromConversation,
  updateFromDeal,
} from '../../store/adaptiveProfile.store.js';
import { analyzeConversation, buildConversationFallback } from './conversationAnalyzer.service.js';
import { analyzeDeal, buildDealFallback } from './dealEngine.service.js';
import { analyzeTrust, buildTrustFallback } from './trustEngine.service.js';
import {
  applyConversationOutputPolicy,
  applyDealOutputPolicy,
  applyTrustOutputPolicy,
} from './outputPolicy.service.js';
import { buildSystemGoal } from './goalEngine.service.js';

const MAX_TEXT_LENGTH = 1200;
const MAX_HISTORY_ITEMS = 40;
const MAX_OFFERS = 30;
const MAX_PRICES = 60;

const sanitizeText = (value) => String(value || '').slice(0, MAX_TEXT_LENGTH);

const sanitizeList = (list = [], maxItems = MAX_HISTORY_ITEMS) => {
  if (!Array.isArray(list)) return [];
  return list.slice(-maxItems);
};

const normalizePayload = (payload = {}) => {
  const history = sanitizeList(payload?.history || payload?.chatHistory, MAX_HISTORY_ITEMS).map((entry) => ({
    senderId: String(entry?.senderId || ''),
    text: sanitizeText(entry?.text || ''),
    createdAtMs: Number.isFinite(Number(entry?.createdAtMs)) ? Number(entry.createdAtMs) : null,
  }));

  const listing = payload?.listing || {};
  const offers = sanitizeList(payload?.offers, MAX_OFFERS).map((offer) => ({
    amount: Number(offer?.amount),
    status: String(offer?.status || 'pending'),
  }));
  const comparablePrices = sanitizeList(payload?.comparablePrices, MAX_PRICES).map((value) => Number(value));

  return {
    ...payload,
    userId: String(payload?.userId || 'anonymous'),
    conversationId: payload?.conversationId ? String(payload.conversationId) : null,
    message: sanitizeText(payload?.message || payload?.latestMessage || ''),
    latestMessage: sanitizeText(payload?.latestMessage || payload?.message || ''),
    responseDelaySeconds: Number(payload?.responseDelaySeconds || 180),
    history,
    chatHistory: history,
    listing: {
      id: listing?.id ? String(listing.id) : null,
      title: sanitizeText(listing?.title || ''),
      category: listing?.category ? String(listing.category) : null,
      price: Number(listing?.price),
      description: sanitizeText(listing?.description || ''),
      imageUrl: listing?.imageUrl || null,
      images: Array.isArray(listing?.images) ? listing.images.slice(0, 8) : [],
      videoUrl: listing?.videoUrl || null,
    },
    comparablePrices: comparablePrices.filter((value) => Number.isFinite(value)),
    offers: offers.filter((offer) => Number.isFinite(offer.amount)),
    incomingOffer: {
      amount: Number(payload?.incomingOffer?.amount),
      status: String(payload?.incomingOffer?.status || payload?.offerStatus || 'pending'),
    },
    profile: payload?.profile || {},
    behavior: payload?.behavior || {},
    aiMode: Boolean(payload?.aiMode),
    toneGuardEnabled: Boolean(payload?.toneGuardEnabled),
  };
};

const stableKey = (prefix, payload) => {
  const raw = JSON.stringify({
    userId: payload?.userId || 'anon',
    conversationId: payload?.conversationId || 'none',
    listingId: payload?.listing?.id || 'none',
    message: payload?.message || '',
  });
  return `${prefix}:${Buffer.from(raw).toString('base64').slice(0, 120)}`;
};

const compactPayload = (payload = {}) => ({
  userId: payload.userId || null,
  conversationId: payload.conversationId || null,
  listing: payload.listing
    ? {
        id: payload.listing.id || null,
        title: payload.listing.title || null,
        category: payload.listing.category || null,
        price: payload.listing.price || null,
      }
    : null,
  message: payload.message || '',
  historySize: Array.isArray(payload.history) ? payload.history.length : 0,
  offersSize: Array.isArray(payload.offers) ? payload.offers.length : 0,
});

const safeAuditLog = async (entry) => {
  try {
    await auditLog(entry);
  } catch (error) {
    console.error('AI audit logging failed:', error);
  }
};

const messageRateFromHistory = (history = []) => {
  if (!Array.isArray(history) || history.length < 2) return 0;
  const timestamps = history
    .map((entry) => Number(entry?.createdAtMs))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  if (timestamps.length < 2) return 0;
  const spanMs = timestamps[timestamps.length - 1] - timestamps[0];
  if (spanMs <= 0) return 0;
  return Number(((timestamps.length / spanMs) * 60000).toFixed(3));
};

const attachLayerMeta = (output, startAt, cache = 'miss') => ({
  ...output,
  durationMs: Date.now() - startAt,
  cache,
});

const logLayerResult = async ({ layer, payload, result, cacheKey }) => {
  await safeAuditLog({
    layer,
    timeoutMs: env.AI_TIMEOUT_MS,
    retries: env.AI_RETRIES,
    cacheKey,
    cache: result?.cache || 'miss',
    durationMs: result?.durationMs || 0,
    input: compactPayload(payload),
    output: result,
  });
};

export const runConversationLayer = async (rawPayload) => {
  const payload = normalizePayload(rawPayload);
  const start = Date.now();
  const cacheKey = stableKey('conversation', payload);
  const cached = getInsightCache(cacheKey);
  if (cached) {
    const hit = attachLayerMeta(applyConversationOutputPolicy(cached, payload), start, 'hit');
    await logLayerResult({ layer: 'conversation', payload, result: hit, cacheKey });
    return hit;
  }

  const profile = getUserProfile(payload?.userId);
  let result;
  try {
    const output = await analyzeConversation({ ...payload, profile });
    const nextReplies = suppressRepeatedSuggestions(
      payload?.conversationId || payload?.userId || 'global',
      output?.suggestions?.nextReplies || [],
    );
    output.suggestions = {
      ...(output?.suggestions || {}),
      nextReplies,
    };
    if (!output.suggestion) {
      output.suggestion = nextReplies[0] || output?.suggestions?.clarificationPrompt || '';
    }
    updateFromConversation(payload?.userId, {
      responseDelaySeconds: payload?.responseDelaySeconds || 180,
      harshToneCount: output?.tone === 'aggressive' ? 1 : 0,
      hesitantToneCount: output?.tone === 'hesitant' ? 1 : 0,
      messageRatePerMinute: messageRateFromHistory(payload?.history || payload?.chatHistory || []),
      category: payload?.listing?.category,
    });
    result = attachLayerMeta(applyConversationOutputPolicy(output, payload), start, 'miss');
  } catch (error) {
    const fallback = buildConversationFallback(payload);
    result = attachLayerMeta(
      {
        ...applyConversationOutputPolicy(fallback, payload),
        source: 'fallback_orchestrator_error',
        error: error?.message || String(error),
      },
      start,
      'miss',
    );
  }

  setInsightCache(cacheKey, result);
  await logLayerResult({ layer: 'conversation', payload, result, cacheKey });
  return result;
};

export const runDealLayer = async (rawPayload) => {
  const payload = normalizePayload(rawPayload);
  const start = Date.now();
  const cacheKey = stableKey('deal', payload);
  const cached = getInsightCache(cacheKey);
  if (cached) {
    const hit = attachLayerMeta(applyDealOutputPolicy(cached, payload), start, 'hit');
    await logLayerResult({ layer: 'deal', payload, result: hit, cacheKey });
    return hit;
  }

  const profile = getUserProfile(payload?.userId);
  let result;
  try {
    const output = await analyzeDeal({ ...payload, profile });
    updateFromDeal(payload?.userId, {
      listingPrice: Number(payload?.listing?.price),
      offerAmount: Number(payload?.incomingOffer?.amount),
      category: payload?.listing?.category,
      offerStatus: payload?.incomingOffer?.status || payload?.offerStatus || 'pending',
      dealCompleted: Boolean(payload?.dealCompleted),
    });
    result = attachLayerMeta(applyDealOutputPolicy(output, payload), start, 'miss');
  } catch (error) {
    const fallback = buildDealFallback(payload);
    result = attachLayerMeta(
      {
        ...applyDealOutputPolicy(fallback, payload),
        source: 'fallback_orchestrator_error',
        error: error?.message || String(error),
      },
      start,
      'miss',
    );
  }

  setInsightCache(cacheKey, result);
  await logLayerResult({ layer: 'deal', payload, result, cacheKey });
  return result;
};

export const runTrustLayer = async (rawPayload) => {
  const payload = normalizePayload(rawPayload);
  const start = Date.now();
  const cacheKey = stableKey('trust', payload);
  const cached = getInsightCache(cacheKey);
  if (cached) {
    const hit = attachLayerMeta(applyTrustOutputPolicy(cached, payload), start, 'hit');
    await logLayerResult({ layer: 'trust', payload, result: hit, cacheKey });
    return hit;
  }

  const profile = getUserProfile(payload?.userId);
  let result;
  try {
    const output = await analyzeTrust({
      ...payload,
      profile: {
        completeness: payload?.profile?.completeness ?? 0.7,
        profileCompleteness: payload?.profile?.profileCompleteness ?? 0.7,
        userProfile: profile,
      },
    });
    result = attachLayerMeta(applyTrustOutputPolicy(output, payload), start, 'miss');
  } catch (error) {
    const fallback = buildTrustFallback(payload);
    result = attachLayerMeta(
      {
        ...applyTrustOutputPolicy(fallback, payload),
        source: 'fallback_orchestrator_error',
        error: error?.message || String(error),
      },
      start,
      'miss',
    );
  }

  setInsightCache(cacheKey, result);
  await logLayerResult({ layer: 'trust', payload, result, cacheKey });
  return result;
};

export const runAllLayers = async (payload) => {
  const normalized = normalizePayload(payload);
  const start = Date.now();
  const [conversation, deal, trust] = await Promise.all([
    runConversationLayer(normalized),
    runDealLayer(normalized),
    runTrustLayer({ ...normalized, latestMessage: normalized?.message || normalized?.latestMessage || '' }),
  ]);

  const result = {
    conversation,
    deal,
    trust,
    systemGoal: buildSystemGoal({
      payload: normalized,
      conversation,
      deal,
      trust,
    }),
    adaptiveProfile: getPersonalizationSummary(normalized?.userId),
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - start,
  };

  await safeAuditLog({
    layer: 'full',
    timeoutMs: env.AI_TIMEOUT_MS,
    retries: env.AI_RETRIES,
    durationMs: result.durationMs,
    input: compactPayload(normalized),
    output: {
      generatedAt: result.generatedAt,
      durationMs: result.durationMs,
      conversation: {
        intent: result?.conversation?.intent,
        tone: result?.conversation?.tone,
        commitmentScore: result?.conversation?.commitmentScore,
      },
      deal: {
        priceEvaluation: result?.deal?.priceEvaluation,
        dealMomentum: result?.deal?.dealMomentum,
        closeProbability: result?.deal?.dealSuccess?.closeProbability,
      },
      trust: {
        trustScore: result?.trust?.trustScore,
        riskAlert: result?.trust?.riskAlert,
        truthConfidence: result?.trust?.truthConfidence,
      },
      systemGoal: {
        goalHealth: result?.systemGoal?.goalHealth,
        maximize: result?.systemGoal?.maximize,
        minimize: result?.systemGoal?.minimize,
      },
    },
  });

  return result;
};
