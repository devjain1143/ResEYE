import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { announcementService } from '../services/announcementService.js';

const router = Router();

router.get('/active', authenticate, async (req, res, next) => {
  try {
    const list = await announcementService.getActive();
    res.json({ success: true, data: list });
  } catch (err) {
    next(err);
  }
});

export default router;
