import { Router } from 'express';
import { getAuditLogs } from '../../services/auditService.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 30;
    const result = await getAuditLogs({ page, pageSize });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
