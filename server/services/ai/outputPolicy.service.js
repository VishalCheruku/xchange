const MAX_TEXT = 150;
const MAX_REPLY_COUNT = 2;

const GENERIC_PATTERNS = [
  /as an ai/i,
  /it depends/i,
  /let me know/i,
  /can you provide more details/i,
  /i cannot/i,
  /not sure/i,
];

const ACTION_PATTERNS = [
  /\bask\b/i,
  /\boffer\b/i,
  /\bcounter\b/i,
  /\bconfirm\b/i,
  /\bshare\b/i,
  /\bverify\b/i,
  /\bset\b/i,
  /\bclose\b/i,
  /\bcompare\b/i,
  /\bmeet\b/i,
  /\bpickup\b/i,
];

const compact = (text) => String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);

const unique = (items = []) => {
  const set = new Set();
  const result = [];
  items.forEach((item) => {
    const key = String(item || '').trim().toLowerCase();
    if (!key || set.has(key)) return;
    set.add(key);
    result.push(String(item || '').trim());
  });
  return result;
};

const looksGeneric = (text) => {
  const value = String(text || '').trim();
  if (!value) return true;
  return GENERIC_PATTERNS.some((pattern) => pattern.test(value));
};

const looksActionable = (text) => ACTION_PATTERNS.some((pattern) => pattern.test(String(text || '')));

const hasContext = (text, payload = {}) => {
  const value = String(text || '').toLowerCase();
  if (!value) return false;
  const listing = payload?.listing || {};
  const tokens = [
    String(listing?.title || '').toLowerCase(),
    String(listing?.category || '').toLowerCase(),
    String(payload?.conversationId || '').toLowerCase(),
    String(payload?.message || payload?.latestMessage || '').toLowerCase().slice(0, 40),
  ].filter(Boolean);
  if (tokens.some((token) => token && value.includes(token))) return true;
  if (/(price|offer|pickup|condition|payment|delivery|today|final)/i.test(value)) return true;
  return false;
};

const conversationFallbackReply = (payload = {}) => {
  const listingPrice = Number(payload?.listing?.price);
  const intentHint = /price|offer|final|discount/i.test(String(payload?.message || payload?.latestMessage || ''))
    ? 'Offer a clear amount and ask for quick confirmation.'
    : 'Ask to confirm item condition and pickup time.';
  if (Number.isFinite(listingPrice) && listingPrice > 0) {
    return `Ask for a final quote near Rs ${listingPrice} and confirm pickup today.`;
  }
  return intentHint;
};

const trustActionFallback = (riskAlert = '') => {
  if (String(riskAlert).toLowerCase().includes('mismatch')) {
    return 'Verify photos against the listing details before payment.';
  }
  if (String(riskAlert).toLowerCase().includes('caution')) {
    return 'Use a public meetup spot and avoid advance payment.';
  }
  return 'Confirm meetup location and payment method once.';
};

export const applyConversationOutputPolicy = (conversation = {}, payload = {}) => {
  const suggestionCandidates = [
    conversation?.suggestion,
    ...(Array.isArray(conversation?.suggestions?.nextReplies) ? conversation.suggestions.nextReplies : []),
    conversation?.suggestions?.clarificationPrompt,
  ]
    .map((item) => compact(item))
    .filter(Boolean)
    .filter((item) => !looksGeneric(item));

  const nextReplies = unique(
    suggestionCandidates.filter((item) => looksActionable(item) && hasContext(item, payload)),
  ).slice(0, MAX_REPLY_COUNT);

  const fallbackReply = conversationFallbackReply(payload);
  const suggestion = compact(
    nextReplies[0]
      || suggestionCandidates.find((item) => looksActionable(item))
      || fallbackReply,
  );

  const clarificationPrompt = compact(
    conversation?.suggestions?.clarificationPrompt
      || 'Confirm condition, pickup location, and payment method.',
  );
  const negotiationNudge = compact(
    conversation?.suggestions?.negotiationNudge
      || 'Make one clear offer, then set a close deadline.',
  );

  return {
    ...conversation,
    suggestion,
    suggestions: {
      nextReplies: nextReplies.length > 0 ? nextReplies : [fallbackReply],
      clarificationPrompt,
      negotiationNudge,
    },
    outputRules: {
      concise: true,
      actionable: looksActionable(suggestion),
      contextAware: hasContext(suggestion, payload),
      impact: ['improve_deal', 'save_time'],
    },
  };
};

export const applyDealOutputPolicy = (deal = {}, payload = {}) => {
  const hint = compact(deal?.negotiationSuggestions?.hint);
  const listingPrice = Number(payload?.listing?.price);
  const fallbackHint = Number.isFinite(listingPrice) && listingPrice > 0
    ? `Counter near Rs ${Math.round(listingPrice * 0.96)} and close with a pickup time.`
    : 'Counter once, then close with a clear pickup window.';

  const normalizedHint = compact(
    !looksGeneric(hint) && looksActionable(hint) ? hint : fallbackHint,
  );

  const flow = Array.isArray(deal?.structuredNegotiationGuidance)
    ? unique(deal.structuredNegotiationGuidance.map((step) => compact(step))).slice(0, 4)
    : ['offer', 'counter', 'adjust', 'close'];

  return {
    ...deal,
    structuredNegotiationGuidance: flow.length > 0 ? flow : ['offer', 'counter', 'adjust', 'close'],
    negotiationSuggestions: {
      ...(deal?.negotiationSuggestions || {}),
      flow: flow.length > 0 ? flow : ['offer', 'counter', 'adjust', 'close'],
      hint: normalizedHint,
      quickActions: {
        improveDeal: 'Anchor one concrete number and request a decision.',
        reduceRisk: 'Confirm item condition before finalizing the offer.',
        saveTime: 'Set pickup time in the same message as your counter.',
      },
    },
    outputRules: {
      concise: true,
      actionable: true,
      contextAware: hasContext(normalizedHint, payload),
      impact: ['improve_deal', 'save_time'],
    },
  };
};

export const applyTrustOutputPolicy = (trust = {}, payload = {}) => {
  const warningPool = Array.isArray(trust?.warnings) ? trust.warnings : [];
  const normalizedWarnings = unique(
    warningPool
      .map((warning) => compact(warning).toLowerCase())
      .map((warning) => {
        if (warning.includes('caution')) return 'proceed with caution';
        if (warning.includes('mismatch')) return 'mismatch detected';
        if (warning.includes('high trust')) return 'high trust';
        return '';
      })
      .filter(Boolean),
  ).slice(0, 2);

  const riskAlert = compact(trust?.riskAlert || 'Proceed with caution');
  const trustAction = trustActionFallback(riskAlert);

  return {
    ...trust,
    warnings: normalizedWarnings.length > 0 ? normalizedWarnings : ['proceed with caution'],
    riskAlert,
    action: compact(trustAction),
    outputRules: {
      concise: true,
      actionable: true,
      contextAware: hasContext(trustAction, payload),
      impact: ['reduce_risk', 'save_time'],
    },
  };
};
