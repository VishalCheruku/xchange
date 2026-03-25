# AI System Architecture

This document defines the production AI architecture for the marketplace AI Mode.

## 1) Service Structure

### Core orchestration
- `server/services/ai/aiOrchestrator.service.js`
  - `runConversationLayer(payload)`
  - `runDealLayer(payload)`
  - `runTrustLayer(payload)`
  - `runAllLayers(payload)` (parallel execution of all 3 layers)
  - request-envelope normalization, bounded payload sizes, cache hit/miss tracking, per-layer audit logging

### Layer services (independent but connected)
- `server/services/ai/conversationAnalyzer.service.js`
  - Intent, tone, commitment score, micro-signals, intent drift, next-reply suggestions, tone correction
- `server/services/ai/dealEngine.service.js`
  - Price evaluation, multi-scenario pricing, close probability + ETA, regret prediction, momentum, offer quality
- `server/services/ai/trustEngine.service.js`
  - Trust score, red flags, truth confidence, risk alert, behavior pattern flags

### Shared infrastructure
- `server/services/ai/aiClient.service.js`
  - LLM adapter with JSON-only contract, timeout, retries, and fallback
- `server/services/ai/outputPolicy.service.js`
  - post-processing policy to enforce concise, actionable, context-aware outputs
  - removes generic/repeated advice and injects high-impact fallback actions when needed
- `server/middleware/rateLimit.js`
  - 10 requests/min per user (HTTP + socket checks)
- `server/store/insightCache.store.js`
  - short-lived insight cache + repeated suggestion suppression
- `server/store/adaptiveProfile.store.js`
  - user-level adaptive profile updates from conversation/deal/listing interactions
  - persistent storage at `server/data/adaptive-profiles.json`
- `server/services/auditLogger.service.js`
  - audit trail for each layer input/output + latency

### API surfaces
- REST: `server/routes/ai.routes.js`
  - `POST /api/ai/conversation`
  - `POST /api/ai/deal`
  - `POST /api/ai/trust`
  - `POST /api/ai/full`
  - `GET /api/ai/profile`
  - `POST /api/ai/profile/interactions`
  - `POST /api/ai/rank-listings`
- WebSocket: `server/sockets/aiSocket.js`
  - client emits: `ai:message`
  - server emits: `ai:insight` or `ai:error`

### Frontend AI Mode integration
- `src/Components/Context/AIMode.jsx`
  - global mode flag, socket lifecycle, request dispatcher
- `src/services/aiApi.js`
  - REST fallback client for full-layer analysis

---

## 2) Data Flow Between Layers

## AI Mode OFF
1. UI behaves as normal marketplace.
2. AI requests are not dispatched.

## AI Mode ON
1. UI emits context payload (`message`, `listing`, `history`, `offers`, `profile`, `behavior`) via socket or REST.
2. Orchestrator receives payload and executes:
   - Conversation layer
   - Deal layer
   - Trust layer
   in parallel using `Promise.all`.
3. Shared stores update:
   - adaptive profile (conversation + deal outcomes)
   - insight cache
   - audit logs
4. Unified response returns to UI:
   - chat assist chips/suggestions
   - deal pricing and negotiation guidance
   - trust/risk indicators
5. UI renders only compact, context-relevant signals (no chatbot stream, no popup spam).

### Layer connectivity model
- **Independent**:
  - each layer can be called directly via its own endpoint.
- **Connected**:
  - all layers consume the same normalized input envelope.
  - orchestrator composes outputs into one `result` object.
  - adaptive profile and cache are shared across layers.

---

## 3) API Contracts

## Common request envelope
```ts
type AIRequest = {
  userId?: string;
  conversationId?: string;
  aiMode?: boolean;
  toneGuardEnabled?: boolean;
  message?: string;
  latestMessage?: string;
  responseDelaySeconds?: number;
  history?: Array<{ senderId?: string; text?: string }>;
  listing?: {
    id?: string;
    title?: string;
    category?: string;
    price?: number | string;
    description?: string;
  };
  comparablePrices?: Array<number | string>;
  offers?: Array<{ amount?: number | string; status?: string }>;
  incomingOffer?: { amount?: number | string };
  profile?: { completeness?: number; profileCompleteness?: number };
  behavior?: { responseConsistency?: number; pastReports?: number };
};
```

## Conversation Intelligence
### Endpoint
- `POST /api/ai/conversation`

### Response contract
```ts
type ConversationResult = {
  intent: 'buying' | 'negotiating' | 'casual' | 'time-wasting';
  tone: 'serious' | 'hesitant' | 'aggressive' | 'passive';
  commitmentScore: number; // 0-100
  microSignals: Array<{ keyword: string; signal: string; strength: number }>;
  intentDrift: { detected: boolean; from: string | null; to: string; confidence: number };
  suggestion: string;
  suggestions: {
    nextReplies: string[];
    clarificationPrompt: string;
    negotiationNudge: string;
  };
  toneCorrection: { applied: boolean; rewrittenMessage: string };
  metadata: { responseDelaySeconds?: number; analyzedAt: string };
  source: 'llm' | 'fallback_no_api_key' | 'fallback_after_error';
  durationMs: number;
  cache: 'hit' | 'miss';
};
```

## Deal Intelligence
### Endpoint
- `POST /api/ai/deal`

### Response contract
```ts
type DealResult = {
  priceEvaluation: 'underpriced' | 'fair' | 'overpriced';
  marketReference: { median: number | null; lowBand: number | null; highBand: number | null };
  multiScenarioPricing: { fastSale: number | null; balanced: number | null; maxProfit: number | null };
  priceInsights: { evaluation: 'underpriced' | 'fair' | 'overpriced'; strategies: { fastSale: number | null; balanced: number | null; maxProfit: number | null } };
  dealSuccess: { closeProbability: number; timeToCloseHours: number; etaHours: number };
  regretPrediction: { buyerRegretProbability: number; sellerRegretProbability: number };
  dealMomentum: 'rising' | 'stagnant' | 'declining';
  structuredNegotiationGuidance: string[]; // offer -> counter -> adjust -> close
  negotiationSuggestions: { flow: string[]; hint: string };
  offerQuality: {
    score: number;
    fairness: number;
    seriousness: number;
    likelihoodToClose: number;
    label: 'strong' | 'workable' | 'weak' | 'neutral';
  };
  metadata: { analyzedAt: string };
  source: 'llm' | 'fallback_no_api_key' | 'fallback_after_error';
  durationMs: number;
  cache: 'hit' | 'miss';
};
```

## Trust & Risk Intelligence
### Endpoint
- `POST /api/ai/trust`

### Response contract
```ts
type TrustResult = {
  trustScore: number; // 0-100
  trustBadge: 'high' | 'medium' | 'low';
  redFlags: string[];
  truthConfidence: number; // 0-100
  truthConfidenceScore: number; // 0-100
  warnings: Array<'proceed with caution' | 'high trust' | 'mismatch detected'>;
  riskAlert: 'High trust interaction' | 'Possible mismatch' | 'Proceed with caution';
  behaviorPattern: {
    scamLikePatternsDetected: boolean;
    repeatedSuspiciousActivity: boolean;
    indicators: string[];
  };
  metadata: { analyzedAt: string };
  source: 'llm' | 'fallback_no_api_key' | 'fallback_after_error';
  durationMs: number;
  cache: 'hit' | 'miss';
};
```

## Unified all-layer contract
### Endpoint
- `POST /api/ai/full`

### Response contract
```ts
type FullResult = {
  conversation: ConversationResult;
  deal: DealResult;
  trust: TrustResult;
  systemGoal: {
    mode: 'ai-first-core-layer';
    embedded: true;
    scope: { userId: string; conversationId: string; listingId: string | null };
    maximize: {
      successfulTransactions: number;
      userTrust: number;
      efficiency: number;
    };
    minimize: {
      scams: number;
      wastedTime: number;
      failedDeals: number;
    };
    goalHealth: number;
    priorityActions: Array<{ target: string; reason: string; action: string }>;
    updatedAt: string;
  };
  adaptiveProfile: {
    topCategories: string[];
    pricePreferences: {
      minSeen: number | null;
      maxSeen: number | null;
      medianSeen: number | null;
      preferredRange: { min: number | null; max: number | null };
      budgetBand: string;
    };
    negotiationStyle: string;
    responseBehavior: {
      avgResponseDelaySeconds: number;
      messageRatePerMinute: number;
      aggressiveToneRatio: number;
      hesitantToneRatio: number;
      samples: number;
    };
    responseSpeed: string;
    riskSensitivity: string;
    transactionPatterns: {
      totalOffers: number;
      acceptedOffers: number;
      rejectedOffers: number;
      completedDeals: number;
      avgDiscountPct: number;
      suspiciousInteractions: number;
      tradedCategories: Record<string, number>;
    };
    interactionCount: number;
    updatedAt: string | null;
  };
  generatedAt: string;
};
```

## WebSocket contract
### Client -> Server
- Event: `ai:message`
- Payload: `AIRequest & { requestId: string; aiMode: boolean }`

### Server -> Client (success)
- Event: `ai:insight`
```ts
{
  ok: true;
  aiMode: boolean;
  requestId: string | null;
  result: FullResult | null;
}
```

### Server -> Client (error)
- Event: `ai:error`
```ts
{
  ok: false;
  requestId?: string | null;
  error: string;
  retryAfterMs?: number;
}
```

---

## Runtime Guarantees
- AI Mode ON => all 3 layers are executed together through `runAllLayers(...)` on each AI dispatch path.
- AI Mode OFF => no AI execution path is triggered.
- Layer failure does not break marketplace core flow due to fallback logic.
- AI output is concise, structured, and non-intrusive for UI consumption.
- Mission alignment: every full AI response includes a `systemGoal` block that optimizes:
  - maximize: successful transactions, user trust, efficiency
  - minimize: scams, wasted time, failed deals
- AI-first embedding: goal-driven priority actions are returned with each interaction (chat/listing context), so intelligence operates as a core layer rather than an optional feature.
- Timeout: `30s` per LLM attempt (`AI_TIMEOUT_MS`, default `30000`).
- Retries: `3` with exponential backoff (`AI_RETRIES`, default `3`).
- Rate limit: `10 requests/min/user` (`AI_RATE_LIMIT_PER_MINUTE`, default `10`) for HTTP and WebSocket.
- Audit logging: layer inputs/outputs are logged for cache hits, cache misses, and fallback/error paths.
- Output policy: every conversation/deal/trust response is normalized to be concise, actionable, and context-aware, with explicit impact nudges (`improve_deal`, `reduce_risk`, `save_time`).
