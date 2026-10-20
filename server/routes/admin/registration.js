import { Router } from 'express';
import multer from 'multer';
import { getRegistrationMetadata, reloadRegistrationData } from '../../core/registration.js';
import { audit } from '../../services/auditService.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/requireRole.js';
import { originCheck } from '../../middleware/originCheck.js';

const router = Router();

router.use(originCheck);
router.use(authenticate);
router.use(requireRole('ADMIN'));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

router.get('/status', (req, res) => {
  const metadata = getRegistrationMetadata();
  res.json({ success: true, data: metadata });
});

router.post('/reload', upload.single('file'), async (req, res, next) => {
  try {
    let result;
    if (req.file) {
      if (!req.file.originalname || !req.file.originalname.match(/\.xlsx$/i)) {
        return res.status(400).json({ success: false, message: 'Only .xlsx files are supported.' });
      }

      const allowedMimes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/octet-stream'
      ];
      if (req.file.mimetype && !allowedMimes.includes(req.file.mimetype)) {
        return res.status(400).json({ success: false, message: 'Invalid file MIME type.' });
      }

      const buf = req.file.buffer;
      if (!buf || buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b || buf[2] !== 0x03 || buf[3] !== 0x04) {
        return res.status(400).json({ success: false, message: 'File is not a valid Excel/OOXML workbook archive.' });
      }

      result = reloadRegistrationData(buf);
    } else {
      result = reloadRegistrationData(null);
    }

    await audit(req, 'REGISTRATION_RELOAD', null, {
      rowCount: result.rowCount,
      uploadedFile: req.file ? req.file.originalname : null
    });

    res.json({
      success: true,
      message: `Registration data successfully reloaded. ${result.rowCount} records loaded.`,
      data: result
    });
  } catch (err) {
    next(err);
  }
});

export default router;
