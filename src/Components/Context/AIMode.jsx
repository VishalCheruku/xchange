import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import {
  aiApiBaseUrl,
  fetchAdaptiveProfile,
  fetchFullAIInsights,
  pushAdaptiveInteraction,
  rankListingsByProfile,
} from '../../services/aiApi';

const STORAGE_KEY = 'xchange_ai_mode';
const STORAGE_TONE_GUARD = 'xchange_ai_tone_guard';
const CLIENT_AI_CACHE_TTL_MS = 2 * 60 * 1000;
const REALTIME_TIMEOUT_MS = 31000;

const AIModeContext = createContext(null);

export const useAIMode = () => useContext(AIModeContext);

const createRequestId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

const toNumber = (value) => {
  const parsed = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

const scopeKeyFromPayload = (payload = {}) =>
  [
    String(payload?.userId || 'anonymous'),
    String(payload?.conversationId || 'global'),
    String(payload?.listing?.id || payload?.itemId || 'none'),
  ].join(':');

const buildBasicRealtimeFallback = (payload = {}) => {
  const message = String(payload?.message || payload?.latestMessage || '').toLowerCase();
  const listingPrice = toNumber(payload?.listing?.price);
  const intent = /buy|take|available|interested/.test(message)
    ? 'buying'
    : /price|offer|discount|final|last price/.test(message)
      ? 'negotiating'
      : /ok|hmm|later|maybe/.test(message)
        ? 'time-wasting'
        : 'casual';
  const tone = /urgent|now|hurry|asap/.test(message)
    ? 'aggressive'
    : /maybe|not sure|hmm/.test(message)
      ? 'hesitant'
      : message.length <= 6
        ? 'passive'
        : 'serious';

  const nextReplies = intent === 'negotiating'
    ? ['Can you share your best final price?', 'Would you accept a slightly lower offer today?']
    : intent === 'buying'
      ? ['I can confirm pickup time now.', 'Can you share item condition details?']
      : ['Can you clarify the condition and pickup location?'];

  const riskAlert = /(pay first|advance|crypto|gift card)/.test(message)
    ? 'Proceed with caution'
    : 'High trust interaction';
  const warnings = riskAlert === 'Proceed with caution' ? ['proceed with caution'] : ['high trust'];

  return {
    conversation: {
      intent,
      tone,
      commitmentScore: intent === 'buying' || intent === 'negotiating' ? 66 : 44,
      microSignals: [],
      intentDrift: { detected: false, from: null, to: intent, confidence: 0.58 },
      suggestion: nextReplies[0],
      suggestions: {
        nextReplies,
        clarificationPrompt: 'Can you confirm item condition and pickup plan?',
        negotiationNudge: 'Move in small steps and close with a clear next action.',
      },
      toneCorrection: { applied: false, rewrittenMessage: '' },
      metadata: { analyzedAt: new Date().toISOString(), fallback: 'client-basic' },
      source: 'client_basic_fallback',
      cache: 'fallback',
      durationMs: 0,
    },
    deal: {
      priceEvaluation: 'fair',
      marketReference: { median: listingPrice, lowBand: listingPrice, highBand: listingPrice },
      multiScenarioPricing: {
        fastSale: listingPrice ? Math.round(listingPrice * 0.94) : null,
        balanced: listingPrice,
        maxProfit: listingPrice ? Math.round(listingPrice * 1.08) : null,
      },
      priceInsights: {
        evaluation: 'fair',
        strategies: {
          fastSale: listingPrice ? Math.round(listingPrice * 0.94) : null,
          balanced: listingPrice,
          maxProfit: listingPrice ? Math.round(listingPrice * 1.08) : null,
        },
      },
      dealSuccess: { closeProbability: 0.52, timeToCloseHours: 36, etaHours: 36 },
      regretPrediction: { buyerRegretProbability: 0.27, sellerRegretProbability: 0.25 },
      dealMomentum: 'stagnant',
      structuredNegotiationGuidance: ['offer', 'counter', 'adjust', 'close'],
      negotiationSuggestions: {
        flow: ['offer', 'counter', 'adjust', 'close'],
        hint: 'Share one concrete offer and a pickup time window.',
      },
      offerQuality: {
        score: 58,
        fairness: 0.58,
        seriousness: 0.56,
        likelihoodToClose: 0.52,
        label: 'workable',
      },
      metadata: { analyzedAt: new Date().toISOString(), fallback: 'client-basic' },
      source: 'client_basic_fallback',
      cache: 'fallback',
      durationMs: 0,
    },
    trust: {
      trustScore: riskAlert === 'Proceed with caution' ? 46 : 74,
      trustBadge: riskAlert === 'Proceed with caution' ? 'low' : 'medium',
      redFlags: riskAlert === 'Proceed with caution' ? ['Payment pressure before verification'] : [],
      truthConfidence: riskAlert === 'Proceed with caution' ? 58 : 81,
      truthConfidenceScore: riskAlert === 'Proceed with caution' ? 58 : 81,
      riskAlert,
      warnings,
      behaviorPattern: {
        scamLikePatternsDetected: riskAlert === 'Proceed with caution',
        repeatedSuspiciousActivity: false,
        indicators: riskAlert === 'Proceed with caution' ? ['Payment pressure before verification'] : [],
      },
      metadata: { analyzedAt: new Date().toISOString(), fallback: 'client-basic' },
      source: 'client_basic_fallback',
      cache: 'fallback',
      durationMs: 0,
    },
    generatedAt: new Date().toISOString(),
  };
};

export const AIModeProvider = ({ children }) => {
  const [aiModeEnabled, setAIModeEnabled] = useState(() => localStorage.getItem(STORAGE_KEY) === '1');
  const [toneGuardEnabled, setToneGuardEnabled] = useState(() => localStorage.getItem(STORAGE_TONE_GUARD) !== '0');
  const [socketOnline, setSocketOnline] = useState(false);
  const socketRef = useRef(null);
  const pendingRef = useRef(new Map());
  const insightCacheRef = useRef(new Map());

  const setInsightCache = (scopeKey, result) => {
    if (!scopeKey || !result) return;
    insightCacheRef.current.set(scopeKey, {
      result,
      expiresAt: Date.now() + CLIENT_AI_CACHE_TTL_MS,
    });
  };

  const getInsightCache = (scopeKey) => {
    const hit = insightCacheRef.current.get(scopeKey);
    if (!hit) return null;
    if (Date.now() > hit.expiresAt) {
      insightCacheRef.current.delete(scopeKey);
      return null;
    }
    return hit.result;
  };

  const resolvePending = (requestId, result, error) => {
    const pending = pendingRef.current.get(requestId);
    if (!pending) return;
    if (pending.timeoutId) clearTimeout(pending.timeoutId);
    pendingRef.current.delete(requestId);
    if (result) setInsightCache(pending.scopeKey, result);
    Promise.resolve().then(() => {
      pending.callback?.(result || null, error || null);
    });
  };

  const flushPendingWithFallback = (reason) => {
    const requestIds = Array.from(pendingRef.current.keys());
    requestIds.forEach((requestId) => {
      const pending = pendingRef.current.get(requestId);
      if (!pending) return;
      const cached = getInsightCache(pending.scopeKey);
      const basic = cached || buildBasicRealtimeFallback(pending.payload);
      resolvePending(requestId, basic || null, reason);
    });
  };

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, aiModeEnabled ? '1' : '0');
  }, [aiModeEnabled]);

  useEffect(() => {
    localStorage.setItem(STORAGE_TONE_GUARD, toneGuardEnabled ? '1' : '0');
  }, [toneGuardEnabled]);

  useEffect(() => {
    if (!aiModeEnabled) {
      flushPendingWithFallback('AI mode disabled');
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setSocketOnline(false);
      return;
    }

    if (socketRef.current) return;

    const socket = io(aiApiBaseUrl, {
      transports: ['websocket'],
      autoConnect: true,
    });
    socketRef.current = socket;

    socket.on('connect', () => setSocketOnline(true));
    socket.on('disconnect', () => {
      setSocketOnline(false);
      flushPendingWithFallback('AI realtime unavailable');
    });
    socket.on('ai:insight', (message) => {
      const requestId = message?.requestId;
      if (!requestId) return;
      resolvePending(requestId, message?.result || null, null);
    });
    socket.on('ai:error', (message) => {
      const requestId = message?.requestId;
      if (!requestId) return;
      const pending = pendingRef.current.get(requestId);
      if (!pending) return;
      const cached = getInsightCache(pending.scopeKey);
      const basic = cached || buildBasicRealtimeFallback(pending.payload);
      resolvePending(requestId, basic || null, message?.error || 'AI socket error');
    });

    return () => {
      flushPendingWithFallback('AI socket reset');
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setSocketOnline(false);
    };
  }, [aiModeEnabled]);

  const requestRealtimeInsight = (payload, callback) => {
    if (!aiModeEnabled) return null;

    const safePayload = payload || {};
    const scopeKey = scopeKeyFromPayload(safePayload);
    const requestId = createRequestId();
    const timeoutId = setTimeout(() => {
      const pending = pendingRef.current.get(requestId);
      if (!pending) return;
      const cached = getInsightCache(pending.scopeKey);
      const basic = cached || buildBasicRealtimeFallback(pending.payload);
      resolvePending(requestId, basic || null, 'AI timeout');
    }, REALTIME_TIMEOUT_MS);

    pendingRef.current.set(requestId, {
      callback,
      timeoutId,
      payload: safePayload,
      scopeKey,
    });

    const socket = socketRef.current;
    if (socket?.connected) {
      socket.emit('ai:message', {
        ...safePayload,
        requestId,
        aiMode: aiModeEnabled,
        toneGuardEnabled,
      });
      return requestId;
    }

    const cached = getInsightCache(scopeKey);
    if (cached) {
      resolvePending(requestId, cached, 'AI realtime unavailable');
    } else {
      const basic = buildBasicRealtimeFallback(safePayload);
      resolvePending(requestId, basic, 'AI realtime unavailable');
    }

    fetchFullAIInsights({
      ...safePayload,
      requestId,
      aiMode: aiModeEnabled,
      toneGuardEnabled,
    })
      .then((result) => {
        if (!result) return;
        setInsightCache(scopeKey, result);
      })
      .catch(() => {});

    return requestId;
  };

  const analyzeMarketplaceContext = async (payload) => {
    if (!aiModeEnabled) return null;
    const safePayload = payload || {};
    const scopeKey = scopeKeyFromPayload(safePayload);
    const direct = await fetchFullAIInsights({
      ...safePayload,
      toneGuardEnabled,
      aiMode: aiModeEnabled,
    });
    if (direct) {
      setInsightCache(scopeKey, direct);
      return direct;
    }

    const cached = getInsightCache(scopeKey);
    if (cached) return cached;
    return buildBasicRealtimeFallback(safePayload);
  };

  const getAdaptiveProfile = async (userId) => {
    if (!aiModeEnabled || !userId) return null;
    return fetchAdaptiveProfile(userId);
  };

  const rankListingsForProfile = async ({ userId, listings }) => {
    if (!aiModeEnabled || !userId || !Array.isArray(listings) || listings.length === 0) {
      return { rankedListings: [], profile: null };
    }
    return rankListingsByProfile({ userId, listings });
  };

  const trackAdaptiveInteraction = async (payload) => {
    if (!aiModeEnabled || !payload?.userId) return null;
    return pushAdaptiveInteraction(payload);
  };

  const value = useMemo(
    () => ({
      aiModeEnabled,
      setAIModeEnabled,
      toggleAIMode: () => setAIModeEnabled((prev) => !prev),
      toneGuardEnabled,
      setToneGuardEnabled,
      socketOnline,
      requestRealtimeInsight,
      analyzeMarketplaceContext,
      getAdaptiveProfile,
      rankListingsForProfile,
      trackAdaptiveInteraction,
    }),
    [aiModeEnabled, toneGuardEnabled, socketOnline],
  );

  return <AIModeContext.Provider value={value}>{children}</AIModeContext.Provider>;
};
