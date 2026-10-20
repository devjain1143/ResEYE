import { Router } from 'express';
import { handleDebugIntent } from '../../nlq/index.js';
import { audit } from '../../services/auditService.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/requireRole.js';
import { originCheck } from '../../middleware/originCheck.js';

const router = Router();

router.use(originCheck);
router.use(authenticate);
router.use(requireRole('ADMIN'));

router.post('/', async (req, res, next) => {
  try {
    const { json } = req.body;
    if (!json) {
      return res.status(400).json({ success: false, message: 'Intent JSON payload is required.' });
    }

    const result = await handleDebugIntent(json);
    await audit(req, 'NLQ_DEBUG', null, { intent: result.validation?.intent });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
