import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), 'server', 'data');
const DATA_FILE = path.join(DATA_DIR, 'adaptive-profiles.json');

const DEFAULT_PROFILE = {
  pricePreferences: {
    minSeen: null,
    maxSeen: null,
    medianSeen: null,
    preferredRange: { min: null, max: null },
    budgetBand: 'balanced',
    seenPrices: [],
  },
  categoryAffinity: {},
  negotiationStyle: 'balanced',
  avgOfferDeltaPct: 0,
  responseSpeed: 'normal',
  riskSensitivity: 'medium',
  responseBehavior: {
    avgResponseDelaySeconds: 180,
    messageRatePerMinute: 0,
    aggressiveToneRatio: 0,
    hesitantToneRatio: 0,
    samples: 0,
  },
  transactionPatterns: {
    totalOffers: 0,
    acceptedOffers: 0,
    rejectedOffers: 0,
    completedDeals: 0,
    avgDiscountPct: 0,
    suspiciousInteractions: 0,
    tradedCategories: {},
  },
  interactionCount: 0,
  updatedAt: null,
};

const profiles = new Map();
let persistTimer = null;

const toNumber = (value) => {
  const parsed = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const ensureDataPath = () => {
  fs.mkdirSync(DATA_DIR, { recursive: true });
};

const cloneDefault = () => JSON.parse(JSON.stringify(DEFAULT_PROFILE));

const mergeCategoryAffinity = (existing, category, weight = 1) => {
  const next = { ...(existing || {}) };
  if (!category) return next;
  next[category] = Number((next[category] || 0) + weight);
  return next;
};

const computeMedian = (values = []) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const updatePricePreferences = (pricePreferences, priceValues = []) => {
  const prices = [...(pricePreferences?.seenPrices || [])];
  priceValues.forEach((value) => {
    if (Number.isFinite(value) && value > 0) prices.push(value);
  });
  const trimmed = prices.slice(-200);
  const median = computeMedian(trimmed);
  const sorted = [...trimmed].sort((a, b) => a - b);
  const q25 = sorted.length ? sorted[Math.floor(sorted.length * 0.25)] : null;
  const q75 = sorted.length ? sorted[Math.floor(sorted.length * 0.75)] : null;

  let budgetBand = 'balanced';
  if (Number.isFinite(median) && median <= 1500) budgetBand = 'value';
  if (Number.isFinite(median) && median >= 20000) budgetBand = 'premium';

  return {
    minSeen: trimmed.length ? Math.min(...trimmed) : null,
    maxSeen: trimmed.length ? Math.max(...trimmed) : null,
    medianSeen: median,
    preferredRange: { min: q25, max: q75 },
    budgetBand,
    seenPrices: trimmed,
  };
};

const deriveNegotiationStyle = (avgOfferDeltaPct = 0, budgetBand = 'balanced') => {
  if (avgOfferDeltaPct <= -14) return 'aggressive';
  if (avgOfferDeltaPct >= -3 && budgetBand === 'premium') return 'premium';
  if (avgOfferDeltaPct >= -3) return 'firm';
  return 'balanced';
};

const deriveResponseSpeed = (avgDelaySeconds = 180) => {
  if (avgDelaySeconds < 120) return 'fast';
  if (avgDelaySeconds > 600) return 'slow';
  return 'normal';
};

const deriveRiskSensitivity = (profile) => {
  const aggressiveRatio = profile?.responseBehavior?.aggressiveToneRatio || 0;
  const suspicious = profile?.transactionPatterns?.suspiciousInteractions || 0;
  if (suspicious >= 3 || aggressiveRatio > 0.32) return 'high';
  if (suspicious === 0 && aggressiveRatio < 0.12) return 'medium';
  return 'medium-high';
};

const serializeMap = () => {
  const obj = {};
  profiles.forEach((value, key) => {
    obj[key] = value;
  });
  return obj;
};

const schedulePersist = () => {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    ensureDataPath();
    fs.writeFile(DATA_FILE, JSON.stringify(serializeMap(), null, 2), 'utf8', (error) => {
      if (error) {
        console.error('Failed to persist adaptive profiles:', error);
      }
    });
  }, 250);
};

const loadProfiles = () => {
  try {
    ensureDataPath();
    if (!fs.existsSync(DATA_FILE)) return;
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    if (!raw.trim()) return;
    const parsed = JSON.parse(raw);
    Object.entries(parsed).forEach(([userId, profile]) => {
      profiles.set(userId, {
        ...cloneDefault(),
        ...profile,
        pricePreferences: {
          ...cloneDefault().pricePreferences,
          ...(profile?.pricePreferences || {}),
          seenPrices: Array.isArray(profile?.pricePreferences?.seenPrices)
            ? profile.pricePreferences.seenPrices.slice(-200)
            : [],
        },
        responseBehavior: {
          ...cloneDefault().responseBehavior,
          ...(profile?.responseBehavior || {}),
        },
        transactionPatterns: {
          ...cloneDefault().transactionPatterns,
          ...(profile?.transactionPatterns || {}),
        },
      });
    });
  } catch (error) {
    console.error('Failed to load adaptive profiles:', error);
  }
};

loadProfiles();

const getOrCreate = (userId) => {
  const id = String(userId || 'anonymous');
  if (!profiles.has(id)) {
    profiles.set(id, { ...cloneDefault(), updatedAt: new Date().toISOString() });
  }
  return profiles.get(id);
};

const commitProfile = (userId, nextProfile) => {
  const id = String(userId || 'anonymous');
  const updated = {
    ...nextProfile,
    responseSpeed: deriveResponseSpeed(nextProfile?.responseBehavior?.avgResponseDelaySeconds || 180),
    riskSensitivity: deriveRiskSensitivity(nextProfile),
    updatedAt: new Date().toISOString(),
  };
  profiles.set(id, updated);
  schedulePersist();
  return updated;
};

const movingAverage = (currentAvg, currentSamples, nextValue) => {
  const base = Number.isFinite(currentAvg) ? currentAvg : 0;
  const samples = Number.isFinite(currentSamples) ? currentSamples : 0;
  return ((base * samples) + nextValue) / (samples + 1);
};

export const getUserProfile = (userId) => {
  const profile = getOrCreate(userId);
  return profile;
};

export const getUserProfileSnapshot = (userId) => {
  const profile = getOrCreate(userId);
  return {
    ...profile,
    pricePreferences: {
      ...profile.pricePreferences,
      seenPrices: undefined,
    },
  };
};

export const getPersonalizationSummary = (userId) => {
  const profile = getOrCreate(userId);
  const topCategories = Object.entries(profile.categoryAffinity || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([category]) => category);

  return {
    userId: String(userId || 'anonymous'),
    topCategories,
    pricePreferences: {
      minSeen: profile.pricePreferences.minSeen,
      maxSeen: profile.pricePreferences.maxSeen,
      medianSeen: profile.pricePreferences.medianSeen,
      preferredRange: profile.pricePreferences.preferredRange,
      budgetBand: profile.pricePreferences.budgetBand,
    },
    negotiationStyle: profile.negotiationStyle,
    responseBehavior: profile.responseBehavior,
    responseSpeed: profile.responseSpeed,
    riskSensitivity: profile.riskSensitivity,
    transactionPatterns: profile.transactionPatterns,
    interactionCount: profile.interactionCount,
    updatedAt: profile.updatedAt,
  };
};

export const updateFromListingInteraction = (userId, { listingPrice, category, interactionType = 'view' } = {}) => {
  if (!userId) return getUserProfileSnapshot(userId);
  const prev = getOrCreate(userId);
  const weightMap = { view: 1, favorite: 3, open_chat: 4, offer: 5 };
  const weight = weightMap[interactionType] || 1;
  const price = toNumber(listingPrice);

  const next = {
    ...prev,
    pricePreferences: updatePricePreferences(prev.pricePreferences, [price]),
    categoryAffinity: mergeCategoryAffinity(prev.categoryAffinity, category, weight),
    interactionCount: (prev.interactionCount || 0) + 1,
  };

  next.negotiationStyle = deriveNegotiationStyle(next.avgOfferDeltaPct, next.pricePreferences.budgetBand);
  return commitProfile(userId, next);
};

export const updateFromConversation = (
  userId,
  {
    responseDelaySeconds = 180,
    harshToneCount = 0,
    hesitantToneCount = 0,
    messageRatePerMinute = 0,
    category,
  } = {},
) => {
  if (!userId) return getUserProfileSnapshot(userId);
  const prev = getOrCreate(userId);
  const samples = prev?.responseBehavior?.samples || 0;
  const aggressiveInc = harshToneCount > 0 ? 1 : 0;
  const hesitantInc = hesitantToneCount > 0 ? 1 : 0;
  const nextSamples = samples + 1;

  const nextResponseBehavior = {
    avgResponseDelaySeconds: Number(
      movingAverage(prev.responseBehavior.avgResponseDelaySeconds, samples, responseDelaySeconds).toFixed(1),
    ),
    messageRatePerMinute: Number(
      movingAverage(prev.responseBehavior.messageRatePerMinute, samples, messageRatePerMinute).toFixed(2),
    ),
    aggressiveToneRatio: Number(
      ((prev.responseBehavior.aggressiveToneRatio * samples + aggressiveInc) / nextSamples).toFixed(2),
    ),
    hesitantToneRatio: Number(
      ((prev.responseBehavior.hesitantToneRatio * samples + hesitantInc) / nextSamples).toFixed(2),
    ),
    samples: nextSamples,
  };

  const next = {
    ...prev,
    responseBehavior: nextResponseBehavior,
    categoryAffinity: mergeCategoryAffinity(prev.categoryAffinity, category, 0.5),
    interactionCount: (prev.interactionCount || 0) + 1,
  };

  return commitProfile(userId, next);
};

export const updateFromDeal = (
  userId,
  {
    listingPrice,
    offerAmount,
    category,
    offerStatus = 'pending',
    dealCompleted = false,
  } = {},
) => {
  if (!userId) return getUserProfileSnapshot(userId);
  const prev = getOrCreate(userId);
  const price = toNumber(listingPrice);
  const offer = toNumber(offerAmount);
  const hasOffer = Number.isFinite(offer) && offer > 0;
  const deltaPct = hasOffer && Number.isFinite(price) && price > 0
    ? ((offer - price) / price) * 100
    : prev.avgOfferDeltaPct || 0;

  const patterns = { ...(prev.transactionPatterns || {}) };
  if (hasOffer) patterns.totalOffers = (patterns.totalOffers || 0) + 1;
  if (offerStatus === 'accepted') patterns.acceptedOffers = (patterns.acceptedOffers || 0) + 1;
  if (offerStatus === 'rejected') patterns.rejectedOffers = (patterns.rejectedOffers || 0) + 1;
  if (dealCompleted) patterns.completedDeals = (patterns.completedDeals || 0) + 1;
  patterns.avgDiscountPct = Number(
    movingAverage(patterns.avgDiscountPct || 0, Math.max((patterns.totalOffers || 1) - 1, 0), deltaPct).toFixed(2),
  );
  patterns.tradedCategories = mergeCategoryAffinity(patterns.tradedCategories, category, dealCompleted ? 1 : 0.25);

  const nextPricePrefs = updatePricePreferences(prev.pricePreferences, [price, offer]);
  const nextStyle = deriveNegotiationStyle(deltaPct, nextPricePrefs.budgetBand);

  const next = {
    ...prev,
    pricePreferences: nextPricePrefs,
    categoryAffinity: mergeCategoryAffinity(prev.categoryAffinity, category, 2),
    negotiationStyle: nextStyle,
    avgOfferDeltaPct: Number(deltaPct.toFixed(2)),
    transactionPatterns: patterns,
    interactionCount: (prev.interactionCount || 0) + 1,
  };

  return commitProfile(userId, next);
};

export const recordTransactionPattern = (userId, transaction = {}) => {
  if (!userId) return getUserProfileSnapshot(userId);
  const prev = getOrCreate(userId);
  const status = String(transaction?.status || '').toLowerCase();
  const category = transaction?.category;
  const price = toNumber(transaction?.price);
  const suspicious = Boolean(transaction?.suspicious);

  const patterns = { ...(prev.transactionPatterns || {}) };
  if (status === 'completed') patterns.completedDeals = (patterns.completedDeals || 0) + 1;
  if (status === 'accepted') patterns.acceptedOffers = (patterns.acceptedOffers || 0) + 1;
  if (status === 'rejected') patterns.rejectedOffers = (patterns.rejectedOffers || 0) + 1;
  if (suspicious) patterns.suspiciousInteractions = (patterns.suspiciousInteractions || 0) + 1;
  patterns.tradedCategories = mergeCategoryAffinity(patterns.tradedCategories, category, 1);

  const next = {
    ...prev,
    pricePreferences: updatePricePreferences(prev.pricePreferences, [price]),
    transactionPatterns: patterns,
    interactionCount: (prev.interactionCount || 0) + 1,
  };

  return commitProfile(userId, next);
};

const scoreListingForProfile = (profile, listing) => {
  const category = listing?.category;
  const categoryWeight = Number(profile?.categoryAffinity?.[category] || 0);
  const maxAffinity = Math.max(...Object.values(profile?.categoryAffinity || { _: 1 }));
  const categoryScore = maxAffinity > 0 ? categoryWeight / maxAffinity : 0;

  const listingPrice = toNumber(listing?.price);
  const preferredMin = profile?.pricePreferences?.preferredRange?.min;
  const preferredMax = profile?.pricePreferences?.preferredRange?.max;

  let priceFit = 0.45;
  if (Number.isFinite(listingPrice) && Number.isFinite(preferredMin) && Number.isFinite(preferredMax)) {
    if (listingPrice >= preferredMin && listingPrice <= preferredMax) {
      priceFit = 1;
    } else {
      const distance = Math.min(
        Math.abs(listingPrice - preferredMin),
        Math.abs(listingPrice - preferredMax),
      );
      const band = Math.max(3000, Math.abs(preferredMax - preferredMin));
      priceFit = clamp(1 - (distance / band), 0, 1);
    }
  }

  let styleAdjustment = 0;
  if (profile?.negotiationStyle === 'aggressive' && Number.isFinite(listingPrice)) {
    styleAdjustment = listingPrice <= (profile?.pricePreferences?.medianSeen || listingPrice) ? 0.14 : -0.06;
  }
  if (profile?.negotiationStyle === 'premium' && Number.isFinite(listingPrice)) {
    styleAdjustment = listingPrice >= (profile?.pricePreferences?.medianSeen || listingPrice) ? 0.12 : -0.04;
  }

  const score = (categoryScore * 0.5) + (priceFit * 0.4) + styleAdjustment;
  return Number(score.toFixed(4));
};

export const rankListingsForUser = (userId, listings = []) => {
  if (!Array.isArray(listings) || listings.length === 0) return [];
  const profile = getOrCreate(userId);

  return [...listings]
    .map((listing) => ({
      ...listing,
      personalizationScore: scoreListingForProfile(profile, listing),
    }))
    .sort((a, b) => b.personalizationScore - a.personalizationScore);
};

