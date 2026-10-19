import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireHuman } from '../middleware/humanSession.js';
import { apiLimiter } from '../middleware/rateLimits.js';
import { originCheck } from '../middleware/originCheck.js';
import { run } from '../nlq/index.js';
import { getRemainingDailyQueries } from '../nlq/rateLimiter.js';
import { settingsService } from '../services/settingsService.js';

const router = Router();

router.use(originCheck);
router.use(authenticate);

router.get('/quota', async (req, res, next) => {
  try {
    const limit = await settingsService.get('ai_daily_limit', 10);
    const remaining = await getRemainingDailyQueries(req.user);
    res.json({
      success: true,
      data: {
        limit: req.user.role === 'ADMIN' ? 999 : limit,
        remaining,
        usedToday: req.user.role === 'ADMIN' ? 0 : Math.max(0, limit - remaining)
      }
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', apiLimiter, requireHuman, async (req, res, next) => {
  try {
    const { query } = req.body || {};
    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({ success: false, message: 'Query cannot be empty.' });
    }

    if (query.length > 1000) {
      return res.status(400).json({ success: false, message: 'Query exceeds maximum length of 1000 characters.' });
    }

    const result = await run({ query: query.trim(), user: req.user });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
