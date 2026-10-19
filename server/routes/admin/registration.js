import { Router } from 'express';
import multer from 'multer';
import { getRegistrationMetadata, reloadRegistrationData } from '../../core/registration.js';
import { audit } from '../../services/auditService.js';

const router = Router();
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
      if (!req.file.originalname.match(/\.xlsx$/i)) {
        return res.status(400).json({ success: false, message: 'Only .xlsx files are supported.' });
      }
      result = reloadRegistrationData(req.file.buffer);
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
