import { Router } from 'express';
import { exportService } from '../../services/exportService.js';
import { audit } from '../../services/auditService.js';

const router = Router();

router.get('/:what', async (req, res, next) => {
  try {
    const { what } = req.params;
    const format = req.query.format === 'csv' ? 'csv' : 'json';

    const result = await exportService.exportData(what, format);
    await audit(req, 'DATA_EXPORT', what, { format, rowCount: result.rowCount });

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.data);
  } catch (err) {
    next(err);
  }
});

export default router;
