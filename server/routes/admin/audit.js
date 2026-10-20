import { Router } from 'express';
import { getAuditLogs } from '../../services/auditService.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/requireRole.js';
import { originCheck } from '../../middleware/originCheck.js';

const router = Router();

router.use(originCheck);
router.use(authenticate);
router.use(requireRole('ADMIN'));

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
