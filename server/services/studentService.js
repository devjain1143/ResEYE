import { getByScholarNo, searchUnifiedStudents, logSearch, isSpecialScholar, getHistoryByScholarNo, extractFailedSubjects } from '../core/query.js';
import { getDb } from '../core/db.js';
import { getRegistrationByScholarNo } from '../core/registration.js';
import { settingsService } from './settingsService.js';
import { alertService } from './alertService.js';

// In-memory sliding tracker for enumeration detection
// userId -> Array<{ scholarNo: string, timestamp: number, found: boolean }>
const enumerationTracker = new Map();

function trackLookup(userId, scholarNo, found) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000; // 10 minutes

  if (!enumerationTracker.has(userId)) {
    enumerationTracker.set(userId, []);
  }

  const entries = enumerationTracker.get(userId).filter(e => now - e.timestamp < windowMs);
  entries.push({ scholarNo: scholarNo.toUpperCase(), timestamp: now, found });
  enumerationTracker.set(userId, entries);

  // Check enumeration rules
  if (entries.length >= 10) {
    // 1. High not-found ratio (>50% over >= 10 lookups)
    const notFoundCount = entries.filter(e => !e.found).length;
    if (notFoundCount / entries.length > 0.5) {
      alertService.create('ENUMERATION', userId, {
        reason: `High failure ratio: ${notFoundCount}/${entries.length} lookups not found in 10 minutes`,
        recentQueries: entries.map(e => e.scholarNo)
      }).catch(() => {});
      return;
    }
  }

  if (entries.length >= 15) {
    // 2. Sequential / near-sequential numbers
    const numericParts = entries
      .map(e => {
        const match = e.scholarNo.match(/\d+$/);
        return match ? parseInt(match[0], 10) : null;
      })
      .filter(n => n !== null);

    let nearSequentialCount = 0;
    for (let i = 1; i < numericParts.length; i++) {
      if (Math.abs(numericParts[i] - numericParts[i - 1]) <= 20) {
        nearSequentialCount++;
      }
    }

    if (nearSequentialCount >= 8) {
      alertService.create('ENUMERATION', userId, {
        reason: `Sequential scanning detected: ${nearSequentialCount} near-sequential lookups in 10 minutes`,
        recentQueries: entries.map(e => e.scholarNo)
      }).catch(() => {});
    }
  }
}

// Cleanup tracker every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [userId, list] of enumerationTracker.entries()) {
    const fresh = list.filter(e => now - e.timestamp < 10 * 60 * 1000);
    if (fresh.length === 0) enumerationTracker.delete(userId);
    else enumerationTracker.set(userId, fresh);
  }
}, 5 * 60 * 1000).unref();

export const studentService = {
  async getDailyLookupCount(userId) {
    const db = getDb();
    const res = await db.query(
      `SELECT COUNT(*) as count FROM search_history
       WHERE web_user_id = $1 AND timestamp >= NOW() - INTERVAL '24 hours'`,
      [userId]
    );
    return parseInt(res.rows[0]?.count || '0', 10);
  },

  async getByScholar(scholarNo, user) {
    const cleanNo = (scholarNo || '').trim().toUpperCase();

    // 1. Check daily lookup quota for non-admins
    if (user.role !== 'ADMIN') {
      const dailyLimit = await settingsService.get('lookup_daily_limit', 60);
      const usedToday = await this.getDailyLookupCount(user.id);
      if (usedToday >= dailyLimit) {
        const error = new Error('Daily student lookup quota exceeded.');
        error.status = 429;
        error.code = 'LOOKUP_QUOTA';
        error.retryAfterSeconds = 3600;
        throw error;
      }
    }

    // 2. Fetch student record
    const student = await getByScholarNo(cleanNo);

    if (!student) {
      trackLookup(user.id, cleanNo, false);

      // Fallback: Check registration data for ADMIN
      if (user.role === 'ADMIN') {
        const reg = getRegistrationByScholarNo(cleanNo);
        if (reg) {
          return {
            scholarNo: cleanNo,
            name: reg.name || 'REGISTERED STUDENT',
            degree: 'N/A',
            branch: 'N/A',
            semesters: [],
            cpi: null,
            registration: {
              guardian: reg.guardian || reg.fatherName || null,
              category: reg.category || null,
              phones: reg.phones || [],
              emails: reg.emails || [],
              addresses: reg.addresses || []
            }
          };
        }
      }

      const notFoundErr = new Error(`Student with scholar number ${cleanNo} not found.`);
      notFoundErr.status = 404;
      throw notFoundErr;
    }

    trackLookup(user.id, cleanNo, true);

    // 3. Special scholar surveillance check
    const isSpecial = await isSpecialScholar(cleanNo);
    if (isSpecial && user.role !== 'ADMIN') {
      const pastSearches = await getHistoryByScholarNo(cleanNo);
      alertService.create('SPECIAL_HIT', user.id, {
        searcher: {
          id: user.id,
          username: user.username,
          email: user.email
        },
        student: {
          scholarNo: cleanNo,
          name: student.name
        },
        at: new Date().toISOString(),
        timelineOfPastSearches: pastSearches
      }).catch(() => {});
    }

    // 4. Log search history
    await logSearch({ user, webUserId: user.id, student });

    // 5. Structure student scorecard
    const semesters = [];
    for (let i = 1; i <= 8; i++) {
      const spi = student[`spi_sem_${i}`];
      const rawResult = student[`result_sem_${i}`];
      if (spi !== null && spi !== undefined || rawResult) {
        const cleanResult = (rawResult || '').replace(/\r?\n|\r/g, ' ').replace(/\s+/g, ' ').trim();
        const failedSubjects = extractFailedSubjects(cleanResult);
        semesters.push({
          sem: i,
          spi: spi !== null && spi !== undefined ? parseFloat(spi) : null,
          result: cleanResult || 'N/A',
          failedSubjects,
          isFail: cleanResult.toUpperCase().includes('FAIL'),
          isPass: cleanResult.toUpperCase().includes('PASS'),
          isWithheld: cleanResult.toUpperCase().includes('WH') || cleanResult.toUpperCase().includes('WITHHELD')
        });
      }
    }

    let registrationData = null;
    if (user.role === 'ADMIN') {
      const reg = getRegistrationByScholarNo(cleanNo);
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
      registration: registrationData
    };
  },

  async search(queryText, page = 1, user, filters = {}) {
    const q = (queryText || '').trim();
    if (q.length < 2) {
      const err = new Error('Search query must be at least 2 characters.');
      err.status = 400;
      throw err;
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    if (pageNum > 5 && user.role !== 'ADMIN') {
      const err = new Error('Search results are capped at 5 pages (50 records).');
      err.status = 400;
      throw err;
    }

    const limit = 10;
    const isUserAdmin = user.role === 'ADMIN';
    const result = await searchUnifiedStudents(q, pageNum, limit, isUserAdmin, filters);

    let studentCard = null;
    if (result.total === 1 && result.results.length === 1 && !result.results[0].isRegistrationOnly) {
      try {
        studentCard = await this.getByScholar(result.results[0].scholar_no, user);
      } catch {}
    }

    return {
      page: pageNum,
      pageSize: limit,
      total: result.total,
      results: result.results,
      studentCard
    };
  }
};
