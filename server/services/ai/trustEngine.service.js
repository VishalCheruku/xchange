import { requestStructuredLLM } from './aiClient.service.js';
import {
  classifyRiskAlert,
  contradictionSignals,
  mediaMismatchSignals,
  trustScoreFromSignals,
} from './heuristics.js';

const lower = (value) => String(value || '').toLowerCase();
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const unique = (list = []) => Array.from(new Set(list.filter(Boolean)));

const detectRedFlags = (message = '') => {
  const text = lower(message);
  const flags = [];
  if (/(urgent|right now|immediately|hurry)/i.test(text)) {
    flags.push('Urgency pressure detected');
  }
  if (/(send advance|pay first|gift card|crypto only)/i.test(text)) {
    flags.push('Payment pressure before verification');
  }
  if (/(trust me only|no questions|do not inspect)/i.test(text)) {
    flags.push('Avoidance behavior');
  }
  if (/(maybe|not sure|idk)/i.test(text)) {
    flags.push('Vague response pattern');
  }
  return flags;
};

const readChatHistory = (payload) => {
  if (Array.isArray(payload?.chatHistory)) return payload.chatHistory;
  if (Array.isArray(payload?.history)) return payload.history;
  return [];
};

const evaluateResponseQuality = (messages = []) => {
  if (messages.length === 0) return 0.55;
  const texts = messages.map((entry) => String(entry?.text || '')).filter(Boolean);
  if (texts.length === 0) return 0.5;
  const avgLength = texts.reduce((sum, text) => sum + text.length, 0) / texts.length;
  const detailTokens = ['condition', 'pickup', 'location', 'invoice', 'warranty', 'payment', 'model'];
  const detailHits = texts.reduce((sum, text) => {
    const lowered = text.toLowerCase();
    return sum + detailTokens.filter((token) => lowered.includes(token)).length;
  }, 0);
  const questionCount = texts.filter((text) => text.includes('?')).length;
  const quality = 0.35 + Math.min(0.25, avgLength / 200) + Math.min(0.25, detailHits / 12) + Math.min(0.15, questionCount / Math.max(texts.length, 1));
  return clamp(Number(quality.toFixed(2)), 0.1, 1);
};

const evaluateChatConsistency = (messages = []) => {
  if (messages.length < 2) return 0.6;
  const texts = messages.map((entry) => lower(entry?.text));
  const vagueCount = texts.filter((text) => /(maybe|idk|not sure|hmm)/i.test(text)).length;
  const pressureCount = texts.filter((text) => /(urgent|hurry|right now|pay first)/i.test(text)).length;
  const shortCount = texts.filter((text) => text.trim().length > 0 && text.trim().length <= 3).length;
  const base = 0.82 - (vagueCount / texts.length) * 0.28 - (pressureCount / texts.length) * 0.24 - (shortCount / texts.length) * 0.16;
  return clamp(Number(base.toFixed(2)), 0.1, 1);
};

export const buildTrustFallback = (payload) => {
  const listing = payload?.listing || {};
  const latestMessage = payload?.latestMessage || '';
  const profile = payload?.profile || {};
  const userProfile = profile?.userProfile || {};
  const behavior = payload?.behavior || {};
  const chatHistory = readChatHistory(payload);
  const allMessages = [
    ...chatHistory.map((entry) => String(entry?.text || '')).filter(Boolean),
    String(latestMessage || ''),
  ].filter(Boolean);

  const contradictions = unique(allMessages.flatMap((text) => contradictionSignals(listing, text)));
  const mediaMismatches = unique(allMessages.flatMap((text) => mediaMismatchSignals(listing, text)));
  const redFlags = unique([
    ...allMessages.flatMap((text) => detectRedFlags(text)),
    ...contradictions,
    ...mediaMismatches,
  ]);
  const urgencyFlags = redFlags.filter((f) => lower(f).includes('urgency')).length;
  const contradictionCount = contradictions.length + mediaMismatches.length;
  const profileCompleteness = Number(profile?.completeness || 0.5);
  const derivedResponseQuality = evaluateResponseQuality(chatHistory);
  const derivedChatConsistency = evaluateChatConsistency(chatHistory);
  const behaviorConsistency = Number.isFinite(Number(behavior?.responseConsistency))
    ? Number(behavior.responseConsistency)
    : Number(userProfile?.responseBehavior?.messageRatePerMinute > 0.5 ? 0.7 : 0.58);
  const responseConsistency = clamp(
    Number(((behaviorConsistency + derivedResponseQuality + derivedChatConsistency) / 3).toFixed(2)),
    0.05,
    1,
  );
  const pastReports = Number(
    behavior?.pastReports
      ?? userProfile?.transactionPatterns?.suspiciousInteractions
      ?? 0,
  );

  const trustScore = trustScoreFromSignals({
    profileCompleteness,
    contradictionCount,
    urgencyFlags,
    responseConsistency,
    pastReports,
  });

  const mediaPenalty = mediaMismatches.length * 14;
  const truthConfidenceScore = Math.max(
    5,
    Math.min(100, Math.round(100 - contradictionCount * 18 - mediaPenalty - urgencyFlags * 8)),
  );
  const riskAlert = classifyRiskAlert(trustScore, redFlags);
  const warnings = [];
  if (riskAlert === 'High trust interaction') warnings.push('high trust');
  if (riskAlert === 'Proceed with caution') warnings.push('proceed with caution');
  if (riskAlert === 'Possible mismatch') warnings.push('mismatch detected');
  if (mediaMismatches.length > 0) warnings.push('mismatch detected');
  if (pastReports >= 2) warnings.push('proceed with caution');

  return {
    trustScore,
    trustBadge: trustScore >= 80 ? 'high' : trustScore >= 55 ? 'medium' : 'low',
    redFlags,
    truthConfidence: truthConfidenceScore,
    truthConfidenceScore,
    riskAlert,
    warnings: unique(warnings),
    behaviorPattern: {
      scamLikePatternsDetected: redFlags.length >= 3 || pastReports >= 2 || mediaMismatches.length > 0,
      repeatedSuspiciousActivity: pastReports >= 2 || warnings.filter((w) => w === 'proceed with caution').length >= 2,
      indicators: unique([...redFlags, ...mediaMismatches]),
    },
    trustComponents: {
      chatConsistency: derivedChatConsistency,
      responseQuality: derivedResponseQuality,
      profileCompleteness,
      pastBehaviorRisk: clamp(pastReports / 4, 0, 1),
    },
    metadata: {
      analyzedAt: new Date().toISOString(),
      messagesAnalyzed: allMessages.length,
    },
  };
};

const normalize = (result, fallback) => {
  if (!result || typeof result !== 'object') return fallback;
  const truthConfidenceValue = Number.isFinite(result.truthConfidence)
    ? result.truthConfidence
    : Number.isFinite(result.truthConfidenceScore)
      ? result.truthConfidenceScore
      : fallback.truthConfidence;
  const warnings = Array.isArray(result.warnings) ? result.warnings : fallback.warnings;
  return {
    trustScore: Number.isFinite(result.trustScore) ? result.trustScore : fallback.trustScore,
    trustBadge: result.trustBadge || fallback.trustBadge,
    redFlags: Array.isArray(result.redFlags) ? result.redFlags.slice(0, 4) : fallback.redFlags,
    truthConfidence: truthConfidenceValue,
    truthConfidenceScore: Number.isFinite(result.truthConfidenceScore)
      ? result.truthConfidenceScore
      : fallback.truthConfidenceScore,
    riskAlert: result.riskAlert || fallback.riskAlert,
    warnings: unique(warnings),
    behaviorPattern: result.behaviorPattern || fallback.behaviorPattern,
    trustComponents: result.trustComponents || fallback.trustComponents,
    metadata: fallback.metadata,
  };
};

export const analyzeTrust = async (payload) => {
  const fallback = buildTrustFallback(payload);

  const systemPrompt = `You are Trust & Risk Intelligence for a classified marketplace.
Return ONLY valid JSON with keys:
trustScore (0-100), redFlags[], truthConfidence (0-100), warnings[], trustBadge, truthConfidenceScore, riskAlert, behaviorPattern, trustComponents, metadata.
Warnings should use: "proceed with caution", "high trust", "mismatch detected".
Do not produce verbose text.`;

  const userPrompt = JSON.stringify({
    listing: payload?.listing || null,
    latestMessage: String(payload?.latestMessage || ''),
    chatHistory: Array.isArray(payload?.chatHistory || payload?.history)
      ? (payload?.chatHistory || payload?.history).slice(-25)
      : [],
    profile: payload?.profile || {},
    behavior: payload?.behavior || {},
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
