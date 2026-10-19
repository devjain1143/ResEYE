import { Router } from 'express';
import { settingsService } from '../../services/settingsService.js';
import { audit } from '../../services/auditService.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const all = await settingsService.getAll();
    res.json({ success: true, data: all });
  } catch (err) {
    next(err);
  }
});

router.patch('/', async (req, res, next) => {
  try {
    const { signup_mode, ai_daily_limit, ai_burst_per_min, lookup_daily_limit } = req.body;
    const updates = {};

    if (signup_mode !== undefined) {
      if (!['open', 'approval', 'closed'].includes(signup_mode)) {
        return res.status(400).json({ success: false, message: 'Invalid signup mode (open|approval|closed).' });
      }
      updates.signup_mode = signup_mode;
    }

    if (ai_daily_limit !== undefined) {
      const num = parseInt(ai_daily_limit, 10);
      if (isNaN(num) || num < 1) {
        return res.status(400).json({ success: false, message: 'Invalid AI daily limit.' });
      }
      updates.ai_daily_limit = num;
    }

    if (ai_burst_per_min !== undefined) {
      const num = parseInt(ai_burst_per_min, 10);
      if (isNaN(num) || num < 1) {
        return res.status(400).json({ success: false, message: 'Invalid AI burst limit.' });
      }
      updates.ai_burst_per_min = num;
    }

    if (lookup_daily_limit !== undefined) {
      const num = parseInt(lookup_daily_limit, 10);
      if (isNaN(num) || num < 1) {
        return res.status(400).json({ success: false, message: 'Invalid lookup daily limit.' });
      }
      updates.lookup_daily_limit = num;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'No valid setting updates provided.' });
    }

    await settingsService.setMultiple(updates, req.user.id);
    await audit(req, 'SETTINGS_UPDATE', null, updates);

    const all = await settingsService.getAll();
    res.json({ success: true, data: all, message: 'System configuration updated.' });
  } catch (err) {
    next(err);
  }
});

export default router;
