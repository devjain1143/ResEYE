import { Router } from 'express';
import { getSearchHistory, getAiHistoryByFilter } from '../../core/query.js';

const router = Router();

router.get('/history', async (req, res, next) => {
  try {
    const { range = 'all', userId, page = 1, pageSize = 30 } = req.query;
    const result = await getSearchHistory({
      range,
      userId,
      page: parseInt(page, 10) || 1,
      pageSize: parseInt(pageSize, 10) || 30
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.get('/ai-history', async (req, res, next) => {
  try {
    const { range = 'all', userId, rating, page = 1, pageSize = 30 } = req.query;
    const result = await getAiHistoryByFilter({
      range,
      userId,
      rating,
      page: parseInt(page, 10) || 1,
      pageSize: parseInt(pageSize, 10) || 30
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
