import { Router } from 'express';
import { exportService } from '../../services/exportService.js';
import { audit } from '../../services/auditService.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/requireRole.js';
import { originCheck } from '../../middleware/originCheck.js';

const router = Router();

router.use(originCheck);
router.use(authenticate);
router.use(requireRole('ADMIN'));

const ALLOWED_TARGETS = ['users', 'search-history', 'ai-history', 'special', 'feedback'];

router.get('/:what', async (req, res, next) => {
  try {
    const { what } = req.params;
    if (!ALLOWED_TARGETS.includes(what)) {
      return res.status(400).json({
        success: false,
        message: `Invalid export target. Allowed targets: ${ALLOWED_TARGETS.join(', ')}`
      });
    }

    const format = req.query.format === 'csv' ? 'csv' : 'json';

    const result = await exportService.exportData(what, format);
    await audit(req, 'DATA_EXPORT', what, { format, rowCount: result.rowCount });

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(result.data);
  } catch (err) {
    next(err);
  }
});

export default router;
