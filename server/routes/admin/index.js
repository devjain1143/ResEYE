import { Router } from 'express';
import { originCheck } from '../../middleware/originCheck.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/requireRole.js';

import statsRoutes from './stats.js';
import usersRoutes from './users.js';
import specialRoutes from './special.js';
import favoritesRoutes from './favorites.js';
import alertsRoutes from './alerts.js';
import historyRoutes from './history.js';
import feedbackRoutes from './feedback.js';
import announcementsRoutes from './announcements.js';
import registrationRoutes from './registration.js';
import exportRoutes from './export.js';
import nlqDebugRoutes from './nlqDebug.js';
import settingsRoutes from './settings.js';
import auditRoutes from './audit.js';

const router = Router();

// Secure all admin subroutes
router.use(originCheck);
router.use(authenticate);
router.use(requireRole('ADMIN'));

router.use('/stats', statsRoutes);
router.use('/users', usersRoutes);
router.use('/special', specialRoutes);
router.use('/favorites', favoritesRoutes);
router.use('/alerts', alertsRoutes);
router.use('/', historyRoutes); // mounts /history and /ai-history
router.use('/feedback', feedbackRoutes);
router.use('/announcements', announcementsRoutes);
router.use('/registration', registrationRoutes);
router.use('/export', exportRoutes);
router.use('/nlq-debug', nlqDebugRoutes);
router.use('/settings', settingsRoutes);
router.use('/audit', auditRoutes);

export default router;
