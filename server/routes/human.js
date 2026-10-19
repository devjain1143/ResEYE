import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { humanLimiter } from '../middleware/rateLimits.js';
import { requireTurnstile } from '../middleware/turnstile.js';
import { grantHuman } from '../middleware/humanSession.js';
import { originCheck } from '../middleware/originCheck.js';

const router = Router();

router.post(
  '/verify',
  originCheck,
  authenticate,
  humanLimiter,
  requireTurnstile('search'),
  (req, res) => {
    grantHuman(req.user.id);
    res.json({
      success: true,
      expiresInSeconds: 900,
      queries: 20
    });
  }
);

export default router;
