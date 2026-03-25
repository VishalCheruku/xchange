import { requestStructuredLLM } from './aiClient.service.js';
import {
  applyToneCorrection,
  buildConversationSuggestions,
  classifyIntent,
  classifyTone,
  computeCommitmentScore,
  detectIntentDrift,
  detectMicroSignals,
  parseListingPrice,
} from './heuristics.js';

const sanitizeText = (value) => String(value || '').slice(0, 1200);

const normalizeIntentValue = (intent) => {
  const value = String(intent || '').toLowerCase();
  if (value === 'buying_intent' || value === 'buying') return 'buying';
  if (value === 'negotiation' || value === 'negotiating') return 'negotiating';
  if (value === 'casual_inquiry' || value === 'casual') return 'casual';
  if (value === 'time_wasting_behavior' || value === 'time-wasting') return 'time-wasting';
  return 'casual';
};

export const buildConversationFallback = (payload) => {
  const message = sanitizeText(payload?.message);
  const history = Array.isArray(payload?.history) ? payload.history.slice(-12) : [];
  const responseDelaySeconds = Number(payload?.responseDelaySeconds || 180);
  const listingPrice = parseListingPrice(payload?.listing || {});
  const toneGuardEnabled = Boolean(payload?.toneGuardEnabled);
  const profile = payload?.profile || {};

  const intent = classifyIntent(message);
  const tone = classifyTone(message);
  const commitmentScore = computeCommitmentScore({ message, history, responseDelaySeconds });
  const microSignals = detectMicroSignals(message);
  const intentDrift = detectIntentDrift(history, intent);
  const suggestions = buildConversationSuggestions({ intent, tone, listingPrice, profile });
  const toneCorrection = applyToneCorrection({ message, enabled: toneGuardEnabled });
  const suggestion = suggestions.nextReplies[0] || suggestions.clarificationPrompt;

  return {
    intent,
    tone,
    commitmentScore,
    microSignals,
    intentDrift,
    suggestion,
    suggestions,
    toneCorrection,
    metadata: {
      responseDelaySeconds,
      analyzedAt: new Date().toISOString(),
    },
  };
};

const normalize = (result, fallback) => {
  if (!result || typeof result !== 'object') return fallback;
  const normalizedIntent = normalizeIntentValue(result.intent || fallback.intent);
  const nextReplies = Array.isArray(result?.suggestions?.nextReplies)
    ? result.suggestions.nextReplies.slice(0, 3)
    : fallback.suggestions.nextReplies;

  return {
    intent: normalizedIntent,
    tone: result.tone || fallback.tone,
    commitmentScore: Number.isFinite(result.commitmentScore) ? result.commitmentScore : fallback.commitmentScore,
    microSignals: Array.isArray(result.microSignals) ? result.microSignals : fallback.microSignals,
    intentDrift: result.intentDrift || fallback.intentDrift,
    suggestion: result.suggestion || nextReplies[0] || fallback.suggestion,
    suggestions: {
      nextReplies,
      clarificationPrompt: result?.suggestions?.clarificationPrompt || fallback.suggestions.clarificationPrompt,
      negotiationNudge: result?.suggestions?.negotiationNudge || fallback.suggestions.negotiationNudge,
    },
    toneCorrection: result.toneCorrection || fallback.toneCorrection,
    metadata: fallback.metadata,
  };
};

export const analyzeConversation = async (payload) => {
  const fallback = buildConversationFallback(payload);

  const systemPrompt = `You are Conversation Intelligence for a classified marketplace.
Return ONLY valid JSON with keys:
intent (buying|negotiating|casual|time-wasting), tone (serious|hesitant|aggressive|passive), commitmentScore (0-100), microSignals[], intentDrift{}, suggestion, suggestions{nextReplies[], clarificationPrompt, negotiationNudge}, toneCorrection{applied, rewrittenMessage}, metadata.
Keep suggestions concise and non-repetitive.`;

  const userPrompt = JSON.stringify({
    message: sanitizeText(payload?.message),
    history: Array.isArray(payload?.history) ? payload.history.slice(-10) : [],
    listing: payload?.listing || null,
    profile: payload?.profile || null,
    toneGuardEnabled: Boolean(payload?.toneGuardEnabled),
    fallback,
  });

  const llm = await requestStructuredLLM({
    systemPrompt,
    userPrompt,
    fallback: () => fallback,
  });

  return {
    ...normalize(llm.result, fallback),
    source: llm.source,
  };
};
