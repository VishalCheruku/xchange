const toNumber = (value) => {
  const parsed = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const containsAny = (text, tokens) => tokens.some((token) => text.includes(token));

export const parseListingPrice = (listing) => toNumber(listing?.price);

export const classifyIntent = (message = '') => {
  const text = message.toLowerCase();
  if (containsAny(text, ['buy', 'take it', 'i will take', 'can i get', 'available'])) return 'buying';
  if (containsAny(text, ['last price', 'best price', 'final', 'can you do', 'offer'])) return 'negotiating';
  if (containsAny(text, ['hello', 'hi', 'details', 'color', 'size', '?'])) return 'casual';
  if (containsAny(text, ['later maybe', 'just checking', 'no budget', 'timepass'])) return 'time-wasting';
  return 'casual';
};

export const classifyTone = (message = '') => {
  const text = message.toLowerCase();
  if (containsAny(text, ['idiot', 'stupid', 'nonsense', 'shut up'])) return 'aggressive';
  if (containsAny(text, ['not sure', 'maybe', 'hmm', 'let me think'])) return 'hesitant';
  if (containsAny(text, ['ok', 'fine', 'whatever'])) return 'passive';
  return 'serious';
};

export const detectMicroSignals = (message = '') => {
  const text = message.toLowerCase();
  const map = [
    { keyword: 'ok', signal: 'soft_ack', strength: 0.3 },
    { keyword: 'hmm', signal: 'hesitation', strength: 0.5 },
    { keyword: 'last price', signal: 'price_pressure', strength: 0.75 },
    { keyword: 'final', signal: 'decision_point', strength: 0.8 },
    { keyword: 'urgent', signal: 'time_pressure', strength: 0.7 },
  ];
  return map.filter((entry) => text.includes(entry.keyword));
};

const getRecentMessageRate = (history = []) => {
  const timed = history
    .map((entry) => Number(entry?.createdAtMs))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  if (timed.length < 2) return 0;
  const windowMs = timed[timed.length - 1] - timed[0];
  if (windowMs <= 0) return 0;
  const perMinute = (timed.length / windowMs) * 60000;
  return perMinute;
};

const extractOfferValues = (history = [], message = '') => {
  const source = [...history.map((entry) => String(entry?.text || '')), String(message || '')];
  const prices = [];
  source.forEach((text) => {
    const lowered = text.toLowerCase();
    if (!containsAny(lowered, ['offer', 'price', 'rs', '₹', 'final'])) return;
    const match = lowered.match(/(\d{2,7}(?:\.\d+)?)/);
    if (!match) return;
    const value = Number(match[1]);
    if (Number.isFinite(value)) prices.push(value);
  });
  return prices;
};

export const computeCommitmentScore = ({
  message = '',
  history = [],
  responseDelaySeconds = 180,
}) => {
  let score = 45;
  const text = message.toLowerCase();
  const questionSpecificityTokens = ['pickup', 'location', 'warranty', 'condition', 'invoice', 'payment'];
  const specificityHits = questionSpecificityTokens.filter((token) => text.includes(token)).length;
  const recentRate = getRecentMessageRate(history);
  const offerValues = extractOfferValues(history, message);

  if (text.includes('?')) score += 6;
  score += Math.min(14, specificityHits * 4);
  if (containsAny(text, ['today', 'pickup', 'location', 'payment'])) score += 10;
  if (containsAny(text, ['offer', 'final', 'price'])) score += 10;
  if (containsAny(text, ['maybe later', 'not now', 'just looking'])) score -= 18;
  if (/\d/.test(text)) score += 8;

  if (responseDelaySeconds <= 120) score += 10;
  if (responseDelaySeconds > 900) score -= 16;

  if (recentRate >= 1.5) score += 10;
  if (recentRate > 0 && recentRate < 0.2) score -= 8;

  if (history.length >= 6) score += 6;
  if (history.length <= 1) score -= 6;

  if (offerValues.length >= 2) {
    const progression = offerValues[offerValues.length - 1] - offerValues[0];
    if (progression > 0) score += 8;
    if (progression < 0) score -= 4;
  }

  return clamp(Math.round(score), 0, 100);
};

export const detectIntentDrift = (history = [], currentIntent = 'casual') => {
  if (history.length < 4) {
    return { detected: false, from: null, to: currentIntent, confidence: 0.2 };
  }

  const recentIntents = history.slice(-4).map((entry) => classifyIntent(entry?.text || ''));
  const previous = recentIntents[0];
  const changed = previous !== currentIntent;
  return {
    detected: changed,
    from: changed ? previous : currentIntent,
    to: currentIntent,
    confidence: changed ? 0.72 : 0.35,
  };
};

export const buildConversationSuggestions = ({ intent, tone, listingPrice, profile = {} }) => {
  const nextReplies = [];
  if (intent === 'buying') {
    nextReplies.push('Share pickup window and preferred payment method.');
    nextReplies.push('Confirm item condition with one specific detail.');
  }
  if (intent === 'negotiating') {
    nextReplies.push('Counter with a clear number and short justification.');
    nextReplies.push('Offer a small concession for faster closure today.');
  }
  if (tone === 'hesitant') {
    nextReplies.push('Use confidence framing: one clear option + timeframe.');
  }
  if (tone === 'aggressive') {
    nextReplies.push('Keep wording neutral and move discussion to facts.');
  }
  if (nextReplies.length === 0) {
    nextReplies.push('Ask one concrete question to progress the deal.');
  }

  const style = profile?.negotiationStyle || 'balanced';
  if (style === 'aggressive') {
    nextReplies.push('Use a firm anchor and ask for immediate confirmation.');
  } else if (style === 'premium' || style === 'firm') {
    nextReplies.push('Keep the tone confident and hold value with one clear counter.');
  } else {
    nextReplies.push('Offer one small concession to reduce back-and-forth.');
  }

  const responseSpeed = profile?.responseSpeed || 'normal';
  if (responseSpeed === 'fast') {
    nextReplies.push('Close with a short, time-bound next step.');
  }

  const clarificationPrompt = 'Can you confirm item condition, accessories, and pickup area?';
  const negotiationNudge = listingPrice
    ? `Try anchoring near Rs ${Math.round(listingPrice * 0.95)} to keep momentum.`
    : 'Use a specific price anchor to avoid vague back-and-forth.';

  return { nextReplies, clarificationPrompt, negotiationNudge };
};

export const applyToneCorrection = ({ message = '', enabled = false }) => {
  const tone = classifyTone(message);
  if (!enabled || tone !== 'aggressive') {
    return { applied: false, rewrittenMessage: message };
  }
  let rewritten = message;
  rewritten = rewritten.replace(/\b(stupid|idiot|nonsense)\b/gi, '');
  rewritten = rewritten.replace(/\s{2,}/g, ' ').trim();
  rewritten = `Please clarify your point. ${rewritten}`.trim();
  return { applied: true, rewrittenMessage: rewritten };
};

export const evaluatePrice = ({ listingPrice, comparablePrices = [] }) => {
  const prices = comparablePrices.filter((n) => Number.isFinite(n) && n > 0);
  if (Number.isFinite(listingPrice) && listingPrice > 0) prices.push(listingPrice);
  if (prices.length === 0) {
    return {
      priceEvaluation: 'fair',
      marketReference: { median: null, lowBand: null, highBand: null },
      multiScenarioPricing: { fastSale: null, balanced: null, maxProfit: null },
    };
  }

  const sorted = [...prices].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const lowBand = Math.round(median * 0.9);
  const highBand = Math.round(median * 1.1);

  let priceEvaluation = 'fair';
  if (listingPrice < lowBand) priceEvaluation = 'underpriced';
  if (listingPrice > highBand) priceEvaluation = 'overpriced';

  return {
    priceEvaluation,
    marketReference: { median: Math.round(median), lowBand, highBand },
    multiScenarioPricing: {
      fastSale: Math.round(median * 0.9),
      balanced: Math.round(median),
      maxProfit: Math.round(median * 1.12),
    },
  };
};

export const computeMomentum = ({ offers = [] }) => {
  if (!Array.isArray(offers) || offers.length < 2) return 'stagnant';
  const lastThree = offers.slice(-3).map((o) => toNumber(o?.amount)).filter((n) => Number.isFinite(n));
  if (lastThree.length < 2) return 'stagnant';
  const trend = lastThree[lastThree.length - 1] - lastThree[0];
  if (trend > 0) return 'rising';
  if (trend < 0) return 'declining';
  return 'stagnant';
};

export const scoreOfferQuality = ({ offerAmount, listingPrice, medianPrice }) => {
  const base = Number.isFinite(offerAmount) ? offerAmount : 0;
  const list = Number.isFinite(listingPrice) ? listingPrice : medianPrice;
  if (!Number.isFinite(base) || !Number.isFinite(list) || list <= 0) {
    return { score: 50, fairness: 0.5, seriousness: 0.5, likelihoodToClose: 0.5, label: 'neutral' };
  }
  const ratio = base / list;
  const fairness = clamp(1 - Math.abs(1 - ratio), 0, 1);
  const seriousness = clamp(ratio >= 0.7 ? 0.8 : ratio >= 0.5 ? 0.55 : 0.3, 0, 1);
  const likelihoodToClose = clamp((fairness + seriousness) / 2, 0, 1);
  const score = Math.round(likelihoodToClose * 100);
  const label = score >= 75 ? 'strong' : score >= 55 ? 'workable' : 'weak';
  return { score, fairness, seriousness, likelihoodToClose, label };
};

export const trustScoreFromSignals = ({
  profileCompleteness = 0.5,
  contradictionCount = 0,
  urgencyFlags = 0,
  responseConsistency = 0.6,
  pastReports = 0,
}) => {
  let score = 60;
  score += Math.round(profileCompleteness * 20);
  score += Math.round(responseConsistency * 15);
  score -= contradictionCount * 12;
  score -= urgencyFlags * 10;
  score -= pastReports * 15;
  return clamp(score, 0, 100);
};

export const classifyRiskAlert = (trustScore, redFlags) => {
  if (trustScore >= 80 && redFlags.length === 0) return 'High trust interaction';
  if (trustScore <= 45 || redFlags.length >= 2) return 'Proceed with caution';
  return 'Possible mismatch';
};

export const contradictionSignals = (listing = {}, message = '') => {
  const text = message.toLowerCase();
  const flags = [];
  const listingDescription = String(listing?.description || '').toLowerCase();
  if (listingDescription.includes('new') && text.includes('used')) {
    flags.push('Condition mismatch: listing says new but chat suggests used');
  }
  if (listingDescription.includes('original') && text.includes('copy')) {
    flags.push('Authenticity mismatch between listing and chat');
  }
  if ((listingDescription.includes('bill') || listingDescription.includes('invoice')) && /(no bill|no invoice)/i.test(text)) {
    flags.push('Document mismatch: listing claims bill/invoice but chat denies it');
  }
  if (listingDescription.includes('warranty') && /(no warranty)/i.test(text)) {
    flags.push('Warranty mismatch between listing and chat');
  }
  return flags;
};

export const mediaMismatchSignals = (listing = {}, message = '') => {
  const text = String(message || '').toLowerCase();
  const flags = [];
  const hasImages = Boolean(listing?.imageUrl) || (Array.isArray(listing?.images) && listing.images.length > 0);
  const hasVideo = Boolean(listing?.videoUrl);

  if (hasImages && /(no photo|no photos|no image|cannot share photo)/i.test(text)) {
    flags.push('Media mismatch: listing has images but chat says no photos');
  }
  if (hasVideo && /(no video|cannot share video)/i.test(text)) {
    flags.push('Media mismatch: listing has video but chat says no video');
  }

  return flags;
};
