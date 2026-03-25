import { Router } from 'express';
import { checkRequestRate } from '../middleware/rateLimit.js';
import {
  runAllLayers,
  runConversationLayer,
  runDealLayer,
  runTrustLayer,
} from '../services/ai/aiOrchestrator.service.js';
import {
  getPersonalizationSummary,
  rankListingsForUser,
  recordTransactionPattern,
  updateFromListingInteraction,
} from '../store/adaptiveProfile.store.js';

const router = Router();

router.use(checkRequestRate);

router.post('/conversation', async (req, res, next) => {
  try {
    const result = await runConversationLayer(req.body || {});
    res.json({ ok: true, layer: 'conversation', result });
  } catch (error) {
    next(error);
  }
});

router.post('/deal', async (req, res, next) => {
  try {
    const result = await runDealLayer(req.body || {});
    res.json({ ok: true, layer: 'deal', result });
  } catch (error) {
    next(error);
  }
});

router.post('/trust', async (req, res, next) => {
  try {
    const result = await runTrustLayer(req.body || {});
    res.json({ ok: true, layer: 'trust', result });
  } catch (error) {
    next(error);
  }
});

router.post('/full', async (req, res, next) => {
  try {
    const result = await runAllLayers(req.body || {});
    res.json({ ok: true, layer: 'full', result });
  } catch (error) {
    next(error);
  }
});

router.get('/profile', async (req, res, next) => {
  try {
    const userId = String(req.query?.userId || req.headers['x-user-id'] || 'anonymous');
    const profile = getPersonalizationSummary(userId);
    res.json({ ok: true, profile });
  } catch (error) {
    next(error);
  }
});

router.post('/profile/interactions', async (req, res, next) => {
  try {
    const body = req.body || {};
    const userId = body?.userId || req.headers['x-user-id'] || 'anonymous';
    const interactionType = body?.interactionType || 'view';
    const listing = body?.listing || {};
    const transaction = body?.transaction || null;

    let profile = updateFromListingInteraction(userId, {
      listingPrice: listing?.price,
      category: listing?.category,
      interactionType,
    });

    if (transaction) {
      profile = recordTransactionPattern(userId, transaction);
    }

    res.json({
      ok: true,
      profile: getPersonalizationSummary(userId),
      rawProfile: profile,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/rank-listings', async (req, res, next) => {
  try {
    const body = req.body || {};
    const userId = body?.userId || req.headers['x-user-id'] || 'anonymous';
    const listings = Array.isArray(body?.listings) ? body.listings : [];
    const ranked = rankListingsForUser(userId, listings);
    res.json({
      ok: true,
      rankedListings: ranked,
      profile: getPersonalizationSummary(userId),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
