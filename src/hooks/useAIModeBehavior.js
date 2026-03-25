import { useMemo, useRef } from 'react';

const normalizeSuggestions = (suggestions = [], maxSuggestions = 2) => (
  [...new Set((suggestions || []).map((entry) => String(entry || '').trim()).filter(Boolean))].slice(0, maxSuggestions)
);

export const deriveAIVisibility = ({ aiModeEnabled, insight }) => {
  if (!aiModeEnabled || !insight) {
    return {
      showAssistBar: false,
      showDealSidebar: false,
      showRiskSignals: false,
    };
  }

  const conversation = insight?.conversation || {};
  const deal = insight?.deal || {};
  const trust = insight?.trust || {};

  const conversationHighImpact =
    ['buying', 'negotiating', 'time-wasting'].includes(String(conversation.intent || '').toLowerCase())
    || ['aggressive', 'hesitant'].includes(String(conversation.tone || '').toLowerCase())
    || Number(conversation.commitmentScore) >= 70
    || Number(conversation.commitmentScore) <= 35;

  const dealHighImpact =
    String(deal.priceEvaluation || '').toLowerCase() !== 'fair'
    || String(deal.dealMomentum || '').toLowerCase() === 'declining'
    || Number(deal?.offerQuality?.score) < 60
    || Number(deal?.dealSuccess?.closeProbability) >= 0.68
    || Number(deal?.dealSuccess?.closeProbability) <= 0.22;

  const showRiskSignals =
    String(trust.riskAlert || '') !== 'High trust interaction'
    || (Array.isArray(trust.warnings) && trust.warnings.length > 0)
    || (Array.isArray(trust.redFlags) && trust.redFlags.length > 0);

  return {
    showAssistBar: conversationHighImpact || showRiskSignals,
    showDealSidebar: dealHighImpact,
    showRiskSignals,
  };
};

export const useAISuggestionGuard = ({
  suggestions = [],
  scopeKey = 'global',
  cooldownMs = 90000,
  maxSuggestions = 2,
}) => {
  const memoryRef = useRef(new Map());

  return useMemo(() => {
    const normalized = normalizeSuggestions(suggestions, maxSuggestions);
    if (normalized.length === 0) return [];

    const now = Date.now();
    const hash = normalized.join('|').toLowerCase();
    const previous = memoryRef.current.get(scopeKey);

    if (previous && previous.hash === hash && now - previous.ts < cooldownMs) {
      return [];
    }

    memoryRef.current.set(scopeKey, { hash, ts: now });
    return normalized;
  }, [suggestions, scopeKey, cooldownMs, maxSuggestions]);
};

