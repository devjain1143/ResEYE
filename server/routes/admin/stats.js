import { Router } from 'express';
import prisma from '../../kit/lib/prisma.js';
import { getDb } from '../../core/db.js';
import { alertService } from '../../services/alertService.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const db = getDb();

    // User metrics by status
    const users = await prisma.user.groupBy({
      by: ['status'],
      _count: { id: true }
    });
    const userCounts = { ACTIVE: 0, PENDING: 0, BLOCKED: 0 };
    for (const group of users) {
      userCounts[group.status] = group._count.id;
    }

    // Queries today
    const searchRes = await db.query('SELECT COUNT(*) as count FROM search_history WHERE timestamp >= CURRENT_DATE');
    const aiRes = await db.query('SELECT COUNT(*) as count FROM ai_query_history WHERE timestamp >= CURRENT_DATE');

    // Open alerts
    const openAlerts = await alertService.getUnreadCount();

    res.json({
      success: true,
      data: {
        users: userCounts,
        searchesToday: parseInt(searchRes.rows[0]?.count || '0', 10),
        aiQueriesToday: parseInt(aiRes.rows[0]?.count || '0', 10),
        openAlerts
      }
    });
  } catch (err) {
    next(err);
  }
});

export default router;
