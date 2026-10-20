import { Router } from 'express';
import { announcementService } from '../../services/announcementService.js';
import { audit } from '../../services/auditService.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/requireRole.js';
import { originCheck } from '../../middleware/originCheck.js';

const router = Router();

router.use(originCheck);
router.use(authenticate);
router.use(requireRole('ADMIN'));

router.get('/', async (req, res, next) => {
  try {
    const list = await announcementService.listAll();
    res.json({ success: true, data: list });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { title, body, level = 'info', expiresAt } = req.body;
    if (!title || !body) {
      return res.status(400).json({ success: false, message: 'Title and body are required.' });
    }

    const created = await announcementService.create({
      title,
      body,
      level,
      createdBy: req.user.id,
      expiresAt: expiresAt ? new Date(expiresAt) : null
    });

    await audit(req, 'ANNOUNCEMENT_CREATE', created.id, { title, level });

    res.status(201).json({ success: true, data: created });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, body, level, active, expiresAt } = req.body;

    const updated = await announcementService.update(id, {
      title,
      body,
      level,
      active,
      expiresAt: expiresAt !== undefined ? (expiresAt ? new Date(expiresAt) : null) : undefined
    });

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Announcement not found.' });
    }

    await audit(req, 'ANNOUNCEMENT_UPDATE', id, { active, level });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

export default router;
