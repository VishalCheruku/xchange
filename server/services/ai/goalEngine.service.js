const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const toRatio = (value, fallback = 0) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  if (numeric > 1) return clamp(numeric / 100, 0, 1);
  return clamp(numeric, 0, 1);
};

const toPercent = (ratio) => Math.round(clamp(ratio, 0, 1) * 100);

const readList = (value) => (Array.isArray(value) ? value : []);

const trustRiskScore = (trust = {}) => {
  const trustScore = toRatio(trust?.trustScore, 0.5);
  const truthConfidence = toRatio(trust?.truthConfidence ?? trust?.truthConfidenceScore, 0.5);
  const warnings = readList(trust?.warnings).length;
  const redFlags = readList(trust?.redFlags).length;
  const riskAlert = String(trust?.riskAlert || '').toLowerCase();

  let risk = (1 - trustScore) * 0.45 + (1 - truthConfidence) * 0.35;
  risk += Math.min(0.2, warnings * 0.06 + redFlags * 0.04);

  if (riskAlert.includes('mismatch')) risk += 0.2;
  if (riskAlert.includes('caution')) risk += 0.12;

  return clamp(risk, 0, 1);
};

const wastedTimeRiskScore = (conversation = {}, deal = {}) => {
  const intent = String(conversation?.intent || '').toLowerCase();
  const commitment = toRatio(conversation?.commitmentScore, 0.5);
  const momentum = String(deal?.dealMomentum || '').toLowerCase();
  const closeProbability = toRatio(deal?.dealSuccess?.closeProbability, 0.5);

  let risk = 0;
  if (intent === 'time-wasting') risk += 0.4;
  if (intent === 'casual') risk += 0.15;
  if (commitment < 0.4) risk += 0.25;
  if (momentum === 'declining') risk += 0.2;
  if (closeProbability < 0.35) risk += 0.15;

  return clamp(risk, 0, 1);
};

const failedDealRiskScore = (deal = {}, conversation = {}) => {
  const closeProbability = toRatio(deal?.dealSuccess?.closeProbability, 0.5);
  const momentum = String(deal?.dealMomentum || '').toLowerCase();
  const quality = toRatio(deal?.offerQuality?.score, 0.5);
  const commitment = toRatio(conversation?.commitmentScore, 0.5);

  let risk = (1 - closeProbability) * 0.5 + (1 - quality) * 0.25 + (1 - commitment) * 0.15;
  if (momentum === 'declining') risk += 0.2;
  if (momentum === 'stagnant') risk += 0.08;

  return clamp(risk, 0, 1);
};

const buildPriorityActions = ({
  scams,
  wastedTime,
  failedDeals,
  deal = {},
  trust = {},
  conversation = {},
}) => {
  const actions = [];

  if (scams >= 0.45) {
    actions.push({
      target: 'reduce_risk',
      reason: 'Elevated trust risk',
      action: 'Verify item details in-person and avoid any advance payment.',
    });
  } else {
    actions.push({
      target: 'increase_trust',
      reason: 'Trust can be reinforced',
      action: 'Confirm meetup location and payment method in one message.',
    });
  }

  if (failedDeals >= 0.45) {
    const balancePrice = deal?.multiScenarioPricing?.balanced;
    const priceHint = Number.isFinite(Number(balancePrice))
      ? ` Counter near Rs ${Math.round(Number(balancePrice))} and request a decision today.`
      : ' Counter with one clear number and request a decision today.';
    actions.push({
      target: 'improve_deal',
      reason: 'Deal closure risk is high',
      action: `Use offer -> counter -> close flow.${priceHint}`,
    });
  } else {
    actions.push({
      target: 'improve_deal',
      reason: 'Deal momentum can be accelerated',
      action: 'Trade a small concession for faster closure and fixed pickup time.',
    });
  }

  if (wastedTime >= 0.4) {
    actions.push({
      target: 'save_time',
      reason: 'Conversation may stall',
      action: 'Ask two concrete questions: final price and exact pickup window.',
    });
  } else {
    const intent = String(conversation?.intent || '').toLowerCase();
    actions.push({
      target: 'save_time',
      reason: 'Efficiency optimization',
      action: intent === 'buying'
        ? 'Confirm condition, payment mode, and pickup in the next message.'
        : 'Set a clear next step with a time-bound confirmation.',
    });
  }

  return actions.slice(0, 3);
};

export const buildSystemGoal = ({ payload = {}, conversation = {}, deal = {}, trust = {} }) => {
  const closeProbability = toRatio(deal?.dealSuccess?.closeProbability, 0.5);
  const commitment = toRatio(conversation?.commitmentScore, 0.5);
  const trustStrength = toRatio(trust?.trustScore, 0.5);
  const etaHours = Number(deal?.dealSuccess?.timeToCloseHours ?? deal?.dealSuccess?.etaHours);
  const etaPenalty = Number.isFinite(etaHours) ? clamp(etaHours / 120, 0, 1) : 0.35;

  const successfulTransactions = clamp(closeProbability * 0.55 + commitment * 0.2 + trustStrength * 0.25, 0, 1);
  const userTrust = clamp(trustStrength * 0.7 + toRatio(trust?.truthConfidence ?? trust?.truthConfidenceScore, 0.5) * 0.3, 0, 1);
  const efficiency = clamp((1 - etaPenalty) * 0.6 + commitment * 0.25 + closeProbability * 0.15, 0, 1);

  const scams = trustRiskScore(trust);
  const wastedTime = wastedTimeRiskScore(conversation, deal);
  const failedDeals = failedDealRiskScore(deal, conversation);

  const priorityActions = buildPriorityActions({
    scams,
    wastedTime,
    failedDeals,
    deal,
    trust,
    conversation,
  });

  const maximizeAverage = (successfulTransactions + userTrust + efficiency) / 3;
  const minimizeAverage = (scams + wastedTime + failedDeals) / 3;
  const goalHealth = clamp(maximizeAverage * 0.65 + (1 - minimizeAverage) * 0.35, 0, 1);

  const userId = String(payload?.userId || 'anonymous');
  const conversationId = String(payload?.conversationId || 'global');

  return {
    mode: 'ai-first-core-layer',
    embedded: true,
    scope: {
      userId,
      conversationId,
      listingId: payload?.listing?.id || null,
    },
    maximize: {
      successfulTransactions: toPercent(successfulTransactions),
      userTrust: toPercent(userTrust),
      efficiency: toPercent(efficiency),
    },
    minimize: {
      scams: toPercent(scams),
      wastedTime: toPercent(wastedTime),
      failedDeals: toPercent(failedDeals),
    },
    goalHealth: toPercent(goalHealth),
    priorityActions,
    updatedAt: new Date().toISOString(),
  };
};
