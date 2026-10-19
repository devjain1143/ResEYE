import { Router } from 'express';
import { getSpecialScholars, addSpecialScholar, removeSpecialScholar } from '../../core/query.js';
import { audit } from '../../services/auditService.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const list = await getSpecialScholars();
    res.json({ success: true, data: list });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { scholarNo, note } = req.body;
    if (!scholarNo || typeof scholarNo !== 'string') {
      return res.status(400).json({ success: false, message: 'Valid scholar number is required.' });
    }

    const cleanNo = scholarNo.trim().toUpperCase();
    await addSpecialScholar(cleanNo, req.user.id, note || null);
    await audit(req, 'SPECIAL_ADD', cleanNo, { note });

    res.json({ success: true, message: `Scholar ${cleanNo} placed under tracking surveillance.` });
  } catch (err) {
    next(err);
  }
});

router.delete('/:scholarNo', async (req, res, next) => {
  try {
    const cleanNo = req.params.scholarNo.trim().toUpperCase();
    await removeSpecialScholar(cleanNo);
    await audit(req, 'SPECIAL_REMOVE', cleanNo);

    res.json({ success: true, message: `Scholar ${cleanNo} removed from tracking.` });
  } catch (err) {
    next(err);
  }
});

export default router;
