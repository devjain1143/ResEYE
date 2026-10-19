import { Router } from 'express';
import { alertService } from '../../services/alertService.js';
import { audit } from '../../services/auditService.js';
import { notificationService } from '../../services/notificationService.js';
import prisma from '../../kit/lib/prisma.js';
import { getDb } from '../../core/db.js';

const router = Router();

router.get('/unread-count', async (req, res, next) => {
  try {
    const count = await alertService.getUnreadCount();
    res.json({ success: true, count });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const { status, kind, page = 1, pageSize = 20 } = req.query;
    const result = await alertService.list({
      status: status || null,
      kind: kind || null,
      page: parseInt(page, 10) || 1,
      pageSize: parseInt(pageSize, 10) || 20
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/warn', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { message } = req.body;

    const db = getDb();
    const alertRes = await db.query('SELECT * FROM security_alerts WHERE id = $1', [id]);
    const alert = alertRes.rows[0];
    if (!alert) {
      return res.status(404).json({ success: false, message: 'Alert not found.' });
    }

    const warnMsg = message || `Security Notice: Anomalous querying pattern detected on your account (Incident #${id}). Refrain from systematic data extraction.`;

    if (alert.web_user_id) {
      await notificationService.createWarning(alert.web_user_id, warnMsg, req.user.id);
    }

    const updated = await alertService.resolve(id, 'WARNED', req.user.id);
    await audit(req, 'ALERT_WARN', id, { webUserId: alert.web_user_id, message: warnMsg });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/revoke', async (req, res, next) => {
  try {
    const { id } = req.params;
    const db = getDb();
    const alertRes = await db.query('SELECT * FROM security_alerts WHERE id = $1', [id]);
    const alert = alertRes.rows[0];
    if (!alert) {
      return res.status(404).json({ success: false, message: 'Alert not found.' });
    }

    if (alert.web_user_id) {
      const reason = `Access revoked due to security incident #${id} (${alert.kind})`;
      await prisma.user.update({
        where: { id: alert.web_user_id },
        data: {
          status: 'BLOCKED',
          blockedReason: reason,
          blockedAt: new Date()
        }
      }).catch(() => {});

      // Invalidate sessions
      await prisma.session.deleteMany({ where: { userId: alert.web_user_id } }).catch(() => {});
    }

    const updated = await alertService.resolve(id, 'REVOKED', req.user.id);
    await audit(req, 'ALERT_REVOKE', id, { webUserId: alert.web_user_id });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/dismiss', async (req, res, next) => {
  try {
    const { id } = req.params;
    const updated = await alertService.resolve(id, 'DISMISSED', req.user.id);
    await audit(req, 'ALERT_DISMISS', id);
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

export default router;
