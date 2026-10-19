import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireHuman } from '../middleware/humanSession.js';
import { apiLimiter } from '../middleware/rateLimits.js';
import { originCheck } from '../middleware/originCheck.js';
import { studentService } from '../services/studentService.js';

const router = Router();

router.use(originCheck);
router.use(authenticate);
router.use(apiLimiter);
router.use(requireHuman);

router.get('/search', async (req, res, next) => {
  try {
    const q = req.query.q;
    const page = req.query.page || 1;
    const { degree, branch, batch, minCpi, status } = req.query;
    const result = await studentService.search(q, page, req.user, { degree, branch, batch, minCpi, status });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.get('/:scholarNo', async (req, res, next) => {
  try {
    const scholarNo = req.params.scholarNo;
    const studentCard = await studentService.getByScholar(scholarNo, req.user);
    res.json({ success: true, data: studentCard });
  } catch (err) {
    next(err);
  }
});

export default router;
