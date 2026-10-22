import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { originCheck } from '../middleware/originCheck.js';
import { getSearchHistory, getAiHistoryByFilter } from '../core/query.js';
import { notificationService } from '../services/notificationService.js';

const router = Router();

router.use(authenticate);

router.get('/history', async (req, res, next) => {
  try {
    const type = req.query.type || 'search';
    const page = parseInt(req.query.page, 10) || 1;

    if (type === 'ai') {
      const history = await getAiHistoryByFilter({
        webUserId: req.user.id,
        page,
        pageSize: 20
      });
      return res.json({ success: true, data: history });
    }

    const history = await getSearchHistory({
      webUserId: req.user.id,
      page,
      pageSize: 20,
      isAdmin: req.user.role === 'ADMIN'
    });
    res.json({ success: true, data: history });
  } catch (err) {
    next(err);
  }
});

router.get('/notifications', async (req, res, next) => {
  try {
    const notifications = await notificationService.getForUser(req.user.id);
    res.json({ success: true, data: notifications });
  } catch (err) {
    next(err);
  }
});

router.post('/notifications/:id/read', originCheck, async (req, res, next) => {
  try {
    const id = req.params.id;
    const updated = await notificationService.markAsRead(id, req.user.id);
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

export default router;
