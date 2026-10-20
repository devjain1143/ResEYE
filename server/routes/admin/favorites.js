import { Router } from 'express';
import { getDb } from '../../core/db.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/requireRole.js';
import { originCheck } from '../../middleware/originCheck.js';

const router = Router();

router.use(originCheck);
router.use(authenticate);
router.use(requireRole('ADMIN'));

// GET /api/admin/favorites - Full facility pin surveillance & intercept records
router.get('/', async (req, res, next) => {
  try {
    const { specialOnly, q, page = 1, pageSize = 25 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limit = Math.max(1, parseInt(pageSize, 10) || 25);
    const offset = (pageNum - 1) * limit;

    const db = getDb();

    // Summary telemetry
    const summaryRes = await db.query(`
      SELECT 
        COUNT(*) as total_pins,
        COUNT(DISTINCT f.web_user_id) as unique_users,
        COUNT(DISTINCT f.scholar_no) as unique_scholars,
        COUNT(CASE WHEN sp.scholar_no IS NOT NULL THEN 1 END) as special_pins
      FROM user_favorites f
      LEFT JOIN special_scholars sp ON UPPER(sp.scholar_no) = UPPER(f.scholar_no)
    `);

    const summary = {
      totalPins: parseInt(summaryRes.rows[0]?.total_pins || '0', 10),
      uniqueUsers: parseInt(summaryRes.rows[0]?.unique_users || '0', 10),
      uniqueScholars: parseInt(summaryRes.rows[0]?.unique_scholars || '0', 10),
      specialPins: parseInt(summaryRes.rows[0]?.special_pins || '0', 10)
    };

    // Filter conditions
    const conditions = [];
    const params = [];

    if (specialOnly === 'true') {
      conditions.push('sp.scholar_no IS NOT NULL');
    }

    if (q) {
      params.push(`%${q.trim().toUpperCase()}%`);
      const idx = params.length;
      conditions.push(`(
        UPPER(f.scholar_no) LIKE $${idx} OR 
        UPPER(s.name) LIKE $${idx} OR 
        UPPER(u.username) LIKE $${idx} OR 
        UPPER(u.email) LIKE $${idx}
      )`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await db.query(`
      SELECT COUNT(*) as count
      FROM user_favorites f
      LEFT JOIN auth."User" u ON u.id = f.web_user_id
      LEFT JOIN students s ON UPPER(s.scholar_no) = UPPER(f.scholar_no)
      LEFT JOIN special_scholars sp ON UPPER(sp.scholar_no) = UPPER(f.scholar_no)
      ${whereClause}
    `, params);

    const total = parseInt(countRes.rows[0]?.count || '0', 10);

    params.push(limit);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const listRes = await db.query(`
      SELECT 
        f.id,
        f.web_user_id,
        f.scholar_no,
        f.created_at,
        u.username,
        u.email,
        u.role as user_role,
        u.status as user_status,
        s.name as student_name,
        s.degree,
        s.specialization,
        s.cpi_final,
        CASE WHEN sp.scholar_no IS NOT NULL THEN true ELSE false END as is_special,
        sp.note as special_note
      FROM user_favorites f
      LEFT JOIN auth."User" u ON u.id = f.web_user_id
      LEFT JOIN students s ON UPPER(s.scholar_no) = UPPER(f.scholar_no)
      LEFT JOIN special_scholars sp ON UPPER(sp.scholar_no) = UPPER(f.scholar_no)
      ${whereClause}
      ORDER BY f.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `, params);

    res.json({
      success: true,
      data: {
        results: listRes.rows,
        total,
        page: pageNum,
        pageSize: limit,
        totalPages: Math.ceil(total / limit) || 1,
        summary
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/favorites/special-monitors - Special scholars with user harvesters
router.get('/special-monitors', async (req, res, next) => {
  try {
    const db = getDb();
    const query = `
      SELECT 
        sp.scholar_no,
        sp.note,
        sp.added_at as marked_at,
        s.name as student_name,
        s.degree,
        s.specialization,
        s.cpi_final,
        COALESCE(
          json_agg(
            json_build_object(
              'userId', u.id,
              'username', u.username,
              'email', u.email,
              'status', u.status,
              'pinnedAt', f.created_at
            ) ORDER BY f.created_at DESC
          ) FILTER (WHERE u.id IS NOT NULL),
          '[]'
        ) as harvesters,
        COUNT(f.id) as pin_count
      FROM special_scholars sp
      LEFT JOIN students s ON UPPER(s.scholar_no) = UPPER(sp.scholar_no)
      LEFT JOIN user_favorites f ON UPPER(f.scholar_no) = UPPER(sp.scholar_no)
      LEFT JOIN auth."User" u ON u.id = f.web_user_id
      GROUP BY sp.scholar_no, sp.note, sp.added_at, s.name, s.degree, s.specialization, s.cpi_final
      ORDER BY pin_count DESC, sp.added_at DESC
    `;

    const result = await db.query(query);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (err) {
    next(err);
  }
});

export default router;
