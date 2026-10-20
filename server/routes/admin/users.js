import { Router } from 'express';
import prisma from '../../kit/lib/prisma.js';
import { audit } from '../../services/auditService.js';
import { notificationService } from '../../services/notificationService.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/requireRole.js';
import { originCheck } from '../../middleware/originCheck.js';

const router = Router();

router.use(originCheck);
router.use(authenticate);
router.use(requireRole('ADMIN'));

router.get('/', async (req, res, next) => {
  try {
    const { status, q, page = 1, pageSize = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limit = Math.max(1, parseInt(pageSize, 10) || 20);
    const skip = (pageNum - 1) * limit;

    const where = {};
    if (status) {
      where.status = status;
    }
    if (q) {
      where.OR = [
        { username: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } }
      ];
    }

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: {
          id: true,
          username: true,
          email: true,
          avatar: true,
          role: true,
          status: true,
          blockedReason: true,
          blockedAt: true,
          lastLoginAt: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      })
    ]);

    res.json({
      success: true,
      data: {
        total,
        page: pageNum,
        pageSize: limit,
        users
      }
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, role, blockedReason } = req.body;

    if (status !== undefined && !['ACTIVE', 'PENDING', 'BLOCKED'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid user status. Allowed: ACTIVE, PENDING, BLOCKED.' });
    }

    if (role !== undefined && !['USER', 'ADMIN'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid user role. Allowed: USER, ADMIN.' });
    }

    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Guardrail: Cannot demote or block self
    if (targetUser.id === req.user.id) {
      if (status === 'BLOCKED' || (role && role !== 'ADMIN')) {
        return res.status(400).json({ success: false, message: 'Cannot block or demote your own account.' });
      }
    }

    // Guardrail: Last ADMIN check
    if (targetUser.role === 'ADMIN' && (role === 'USER' || status === 'BLOCKED')) {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN', status: 'ACTIVE' } });
      if (adminCount <= 1) {
        return res.status(400).json({ success: false, message: 'Cannot demote or block the sole active administrator.' });
      }
    }

    const dataToUpdate = {};
    let auditAction = 'USER_UPDATE';

    if (status) {
      dataToUpdate.status = status;
      if (status === 'BLOCKED') {
        dataToUpdate.blockedReason = blockedReason || 'Administrative revocation';
        dataToUpdate.blockedAt = new Date();
        // Immediately invalidate all active sessions
        await prisma.session.deleteMany({ where: { userId: id } });
        auditAction = 'USER_BLOCK';
      } else if (status === 'ACTIVE') {
        dataToUpdate.blockedReason = null;
        dataToUpdate.blockedAt = null;
        auditAction = targetUser.status === 'PENDING' ? 'USER_APPROVE' : 'USER_UNBLOCK';
      }
    }

    if (role) {
      dataToUpdate.role = role;
      auditAction = 'USER_ROLE_CHANGE';
    }

    const updated = await prisma.user.update({
      where: { id },
      data: dataToUpdate,
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        status: true,
        blockedReason: true
      }
    });

    await audit(req, auditAction, id, {
      previous: { role: targetUser.role, status: targetUser.status },
      updated: { role: updated.role, status: updated.status }
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (targetUser.id === req.user.id) {
      return res.status(400).json({ success: false, message: 'Cannot delete your own account.' });
    }

    if (targetUser.role === 'ADMIN') {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
      if (adminCount <= 1) {
        return res.status(400).json({ success: false, message: 'Cannot delete the sole administrator.' });
      }
    }

    await prisma.session.deleteMany({ where: { userId: id } });
    await prisma.token.deleteMany({ where: { userId: id } });
    await prisma.user.delete({ where: { id } });

    await audit(req, 'USER_DELETE', id, { username: targetUser.username, email: targetUser.email });

    res.json({ success: true, message: 'User account purged.' });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/warn', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ success: false, message: 'Warning message is required.' });
    }

    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const notification = await notificationService.createWarning(id, message, req.user.id);
    await audit(req, 'USER_WARN', id, { message });

    res.json({ success: true, data: notification });
  } catch (err) {
    next(err);
  }
});

export default router;
