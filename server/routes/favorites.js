import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { originCheck } from '../middleware/originCheck.js';
import { getDb } from '../core/db.js';
import { getByScholarNo, isSpecialScholar } from '../core/query.js';
import { getRegistrationByScholarNo } from '../core/registration.js';
import { alertService } from '../services/alertService.js';
import { audit } from '../services/auditService.js';

const router = Router();

router.use(originCheck);
router.use(authenticate);

// Helper to structure a student row into student card format
function formatStudentPayload(student, userRole) {
  const semesters = [];
  for (let i = 1; i <= 8; i++) {
    const spi = student[`spi_sem_${i}`];
    const result = student[`result_sem_${i}`];
    if (spi !== null && spi !== undefined || result) {
      semesters.push({
        sem: i,
        spi: spi !== null && spi !== undefined ? parseFloat(spi) : null,
        result: result || 'N/A'
      });
    }
  }

  let registrationData = null;
  if (userRole === 'ADMIN') {
    const reg = getRegistrationByScholarNo(student.scholar_no);
    if (reg) {
      registrationData = {
        guardian: reg.guardian || reg.fatherName || null,
        category: reg.category || null,
        phones: reg.phones || [],
        emails: reg.emails || [],
        addresses: reg.addresses || []
      };
    }
  }

  return {
    scholarNo: student.scholar_no,
    name: student.name,
    degree: student.degree || 'B.Tech',
    branch: student.specialization || 'N/A',
    semesters,
    cpi: student.cpi_final !== null && student.cpi_final !== undefined ? parseFloat(student.cpi_final) : null,
    registration: registrationData,
    isPinned: true
  };
}

// GET /api/favorites - List all pinned tapes for authenticated user
router.get('/', async (req, res, next) => {
  try {
    const db = getDb();
    const query = `
      SELECT 
        f.id as favorite_id,
        f.created_at as pinned_at,
        s.*
      FROM user_favorites f
      JOIN students s ON UPPER(f.scholar_no) = UPPER(s.scholar_no)
      WHERE f.web_user_id = $1
      ORDER BY f.created_at DESC
    `;
    const result = await db.query(query, [req.user.id]);

    const formatted = result.rows.map(row => ({
      ...formatStudentPayload(row, req.user.role),
      pinnedAt: row.pinned_at
    }));

    res.json({
      success: true,
      data: formatted,
      count: formatted.length
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/favorites/ids - List just scholar numbers pinned by user
router.get('/ids', async (req, res, next) => {
  try {
    const db = getDb();
    const result = await db.query(
      'SELECT UPPER(scholar_no) as scholar_no FROM user_favorites WHERE web_user_id = $1',
      [req.user.id]
    );
    res.json({
      success: true,
      data: result.rows.map(r => r.scholar_no)
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/favorites - Pin a dossier to account
router.post('/', async (req, res, next) => {
  try {
    const { scholarNo } = req.body;
    if (!scholarNo || typeof scholarNo !== 'string') {
      return res.status(400).json({ success: false, message: 'Valid scholar number required.' });
    }

    const cleanNo = scholarNo.trim().toUpperCase();
    const student = await getByScholarNo(cleanNo);
    if (!student) {
      return res.status(404).json({ success: false, message: `Dossier for ${cleanNo} not found in archive.` });
    }

    const db = getDb();
    await db.query(
      `INSERT INTO user_favorites (web_user_id, scholar_no, created_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (web_user_id, scholar_no) DO NOTHING`,
      [req.user.id, cleanNo]
    );

    await audit(req, 'PIN_TAPE', cleanNo, { scholarNo: cleanNo, studentName: student.name });

    // Surveillance hook: Alert if target is under special surveillance
    const isSpecial = await isSpecialScholar(cleanNo);
    if (isSpecial && req.user.role !== 'ADMIN') {
      alertService.create('SPECIAL_PIN', req.user.id, {
        operator: {
          id: req.user.id,
          username: req.user.username,
          email: req.user.email
        },
        targetScholar: {
          scholarNo: cleanNo,
          name: student.name
        },
        pinnedAt: new Date().toISOString()
      }).catch(() => {});
    }

    res.status(201).json({
      success: true,
      message: `DOSSIER ${cleanNo} PINNED TO OPERATOR VAULT.`
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/favorites/:scholarNo - Unpin a dossier
router.delete('/:scholarNo', async (req, res, next) => {
  try {
    const cleanNo = (req.params.scholarNo || '').trim().toUpperCase();
    const db = getDb();
    await db.query(
      'DELETE FROM user_favorites WHERE web_user_id = $1 AND UPPER(scholar_no) = $2',
      [req.user.id, cleanNo]
    );

    await audit(req, 'UNPIN_TAPE', cleanNo, { scholarNo: cleanNo });

    res.json({
      success: true,
      message: `DOSSIER ${cleanNo} EJECTED FROM VAULT.`
    });
  } catch (err) {
    next(err);
  }
});

export default router;
