import { requestStructuredLLM } from './aiClient.service.js';
import { computeMomentum, evaluatePrice, parseListingPrice, scoreOfferQuality } from './heuristics.js';

const toNumber = (value) => {
  const parsed = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

const extractOfferAmountFromText = (text = '') => {
  const lowered = String(text || '').toLowerCase();
  if (!/(offer|price|rs|₹|final)/i.test(lowered)) return null;
  const match = lowered.match(/(\d{2,7}(?:\.\d+)?)/);
  if (!match) return null;
  const amount = Number(match[1]);
  return Number.isFinite(amount) ? amount : null;
};

const extractOffersFromChat = (history = []) => {
  if (!Array.isArray(history)) return [];
  const prices = [];
  history.forEach((entry) => {
    const amount = extractOfferAmountFromText(entry?.text || '');
    if (Number.isFinite(amount)) {
      prices.push({ amount });
    }
  });
  return prices;
};

export const buildDealFallback = (payload) => {
  const listing = payload?.listing || {};
  const listingPrice = parseListingPrice(listing);
  const comparablePrices = Array.isArray(payload?.comparablePrices)
    ? payload.comparablePrices.map(toNumber).filter((n) => Number.isFinite(n))
    : [];
  const explicitOffers = Array.isArray(payload?.offers) ? payload.offers : [];
  const chatOffers = extractOffersFromChat(payload?.chatHistory || payload?.history || []);
  const offers = [...explicitOffers, ...chatOffers];
  const incomingOffer = toNumber(payload?.incomingOffer?.amount)
    || extractOfferAmountFromText(payload?.latestMessage || payload?.message || '');
  const chatMessages = Array.isArray(payload?.chatHistory || payload?.history)
    ? (payload?.chatHistory || payload?.history)
    : [];
  const chatActivityScore = Math.min(1, chatMessages.length / 10);
  const profile = payload?.profile || {};
  const profileStyle = profile?.negotiationStyle || 'balanced';
  const budgetBand = profile?.pricePreferences?.budgetBand || 'balanced';

  const price = evaluatePrice({ listingPrice, comparablePrices });
  const momentum = computeMomentum({ offers });
  const quality = scoreOfferQuality({
    offerAmount: incomingOffer,
    listingPrice,
    medianPrice: price.marketReference.median,
  });

  let closeProbability = 0.55;
  if (price.priceEvaluation === 'underpriced') closeProbability += 0.15;
  if (price.priceEvaluation === 'overpriced') closeProbability -= 0.16;
  if (momentum === 'rising') closeProbability += 0.12;
  if (momentum === 'declining') closeProbability -= 0.14;
  if (chatActivityScore >= 0.7) closeProbability += 0.08;
  if (chatActivityScore <= 0.2) closeProbability -= 0.06;
  if (profileStyle === 'aggressive') closeProbability += 0.04;
  if (profileStyle === 'premium') closeProbability -= 0.03;
  closeProbability += (quality.score - 50) / 200;
  closeProbability = Math.min(0.97, Math.max(0.05, closeProbability));

  const timeToCloseHours = Math.round((1 - closeProbability) * 96) + 2;
  const buyerRegret = Math.min(0.9, Math.max(0.05, price.priceEvaluation === 'overpriced' ? 0.58 : 0.28));
  const sellerRegret = Math.min(0.9, Math.max(0.05, price.priceEvaluation === 'underpriced' ? 0.61 : 0.26));
  const flow = ['offer', 'counter', 'adjust', 'close'];
  let negotiationHint = quality.score >= 70
    ? 'Move from counter to close with a small time-bound concession.'
    : 'Anchor clearly, then adjust in small steps before closing.';
  if (profileStyle === 'aggressive') {
    negotiationHint = 'Start with a firmer anchor and keep concessions minimal until close.';
  } else if (profileStyle === 'premium') {
    negotiationHint = 'Defend value first, then trade speed for a premium close.';
  }

  const strategyMultiplier = profileStyle === 'aggressive'
    ? { fastSale: 0.97, balanced: 0.98, maxProfit: 1.03 }
    : profileStyle === 'premium'
      ? { fastSale: 1.01, balanced: 1.03, maxProfit: 1.08 }
      : { fastSale: 1, balanced: 1, maxProfit: 1 };
  const personalizedStrategies = {
    fastSale: Number.isFinite(price.multiScenarioPricing.fastSale)
      ? Math.round(price.multiScenarioPricing.fastSale * strategyMultiplier.fastSale)
      : null,
    balanced: Number.isFinite(price.multiScenarioPricing.balanced)
      ? Math.round(price.multiScenarioPricing.balanced * strategyMultiplier.balanced)
      : null,
    maxProfit: Number.isFinite(price.multiScenarioPricing.maxProfit)
      ? Math.round(price.multiScenarioPricing.maxProfit * strategyMultiplier.maxProfit)
      : null,
  };

  return {
    priceEvaluation: price.priceEvaluation,
    marketReference: price.marketReference,
    multiScenarioPricing: personalizedStrategies,
    priceInsights: {
      evaluation: price.priceEvaluation,
      strategies: personalizedStrategies,
    },
    dealSuccess: {
      closeProbability: Number(closeProbability.toFixed(2)),
      timeToCloseHours,
      etaHours: timeToCloseHours,
    },
    regretPrediction: {
      buyerRegretProbability: Number(buyerRegret.toFixed(2)),
      sellerRegretProbability: Number(sellerRegret.toFixed(2)),
    },
    dealMomentum: momentum,
    structuredNegotiationGuidance: flow,
    negotiationSuggestions: {
      flow,
      hint: negotiationHint,
      strategyProfile: {
        negotiationStyle: profileStyle,
        budgetBand,
      },
    },
    offerQuality: quality,
    metadata: {
      analyzedAt: new Date().toISOString(),
      chatMessagesAnalyzed: chatMessages.length,
    },
  };
};

const normalize = (result, fallback) => {
  if (!result || typeof result !== 'object') return fallback;
  return {
    priceEvaluation: result.priceEvaluation || fallback.priceEvaluation,
    marketReference: result.marketReference || fallback.marketReference,
    multiScenarioPricing: result.multiScenarioPricing || fallback.multiScenarioPricing,
    priceInsights: result.priceInsights || fallback.priceInsights,
    dealSuccess: result.dealSuccess || fallback.dealSuccess,
    regretPrediction: result.regretPrediction || fallback.regretPrediction,
    dealMomentum: result.dealMomentum || fallback.dealMomentum,
    structuredNegotiationGuidance: Array.isArray(result.structuredNegotiationGuidance)
      ? result.structuredNegotiationGuidance
      : fallback.structuredNegotiationGuidance,
    negotiationSuggestions: result.negotiationSuggestions || fallback.negotiationSuggestions,
    offerQuality: result.offerQuality || fallback.offerQuality,
    metadata: fallback.metadata,
  };
};

export const analyzeDeal = async (payload) => {
  const fallback = buildDealFallback(payload);

  const systemPrompt = `You are Deal Intelligence for a classified marketplace.
Return ONLY valid JSON with keys:
priceEvaluation, marketReference, multiScenarioPricing, priceInsights, dealSuccess, regretPrediction, dealMomentum, structuredNegotiationGuidance, negotiationSuggestions, offerQuality, metadata.
Use dealMomentum labels: rising | stagnant | declining.
Keep outputs short and actionable.`;

  const userPrompt = JSON.stringify({
    listing: payload?.listing || null,
    comparablePrices: Array.isArray(payload?.comparablePrices) ? payload.comparablePrices.slice(0, 50) : [],
    offers: Array.isArray(payload?.offers) ? payload.offers.slice(-20) : [],
    chatHistory: Array.isArray(payload?.chatHistory || payload?.history)
      ? (payload?.chatHistory || payload?.history).slice(-25)
      : [],
    latestMessage: payload?.latestMessage || payload?.message || '',
    incomingOffer: payload?.incomingOffer || null,
    profile: payload?.profile || null,
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
