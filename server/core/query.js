import { getDb } from './db.js';
import { getEmbedding } from './embeddings.js';
import { searchRegistrationByName } from './registration.js';

export async function getByScholarNo(scholarNo) {
  if (!scholarNo) return null;
  const db = getDb();
  const res = await db.query('SELECT * FROM students WHERE UPPER(scholar_no) = UPPER($1)', [scholarNo.trim()]);
  return res.rows[0] || null;
}

export async function searchByName(name, page = 1, limit = 10) {
  const db = getDb();
  const offset = (page - 1) * limit;
  const cleanedName = (name || '').trim().toUpperCase();

  const countRes = await db.query(
    "SELECT COUNT(*) as count FROM students WHERE UPPER(name) LIKE '%' || $1 || '%'",
    [cleanedName]
  );
  const total = parseInt(countRes.rows[0].count, 10);

  const res = await db.query(
    "SELECT id, scholar_no, name, degree, specialization, cpi_final " +
    "FROM students " +
    "WHERE UPPER(name) LIKE '%' || $1 || '%' " +
    "ORDER BY id " +
    "LIMIT $2 OFFSET $3",
    [cleanedName, limit, offset]
  );

  return { results: res.rows, total };
}

export function extractFailedSubjects(resultStr) {
  if (!resultStr || typeof resultStr !== 'string') return [];
  const clean = resultStr.replace(/\r?\n|\r/g, ' ').replace(/\s+/g, ' ').trim();
  const match = clean.match(/Fail\s+in\s*\((.*?)\)/i);
  if (match && match[1]) {
    return match[1].split(',').map(s => s.trim()).filter(Boolean);
  }
  if (clean.toUpperCase().includes('FAIL')) {
    return [clean];
  }
  return [];
}

export async function searchUnifiedStudents(name, page = 1, limit = 10, isUserAdmin = false, filters = {}) {
  const db = getDb();
  const cleanedName = (name || '').trim().toUpperCase();
  if (!cleanedName) return { results: [], total: 0 };

  const conditions = ["UPPER(name) LIKE '%' || $1 || '%'"];
  const params = [cleanedName];

  if (filters.degree && filters.degree.trim()) {
    params.push(filters.degree.trim());
    conditions.push(`degree = $${params.length}`);
  }

  if (filters.branch && filters.branch.trim()) {
    params.push(`%${filters.branch.trim().toUpperCase()}%`);
    conditions.push(`UPPER(specialization) LIKE $${params.length}`);
  }

  if (filters.batch && filters.batch.trim()) {
    const b = filters.batch.trim().replace(/^20/, '');
    params.push(`${b}%`);
    conditions.push(`scholar_no LIKE $${params.length}`);
  }

  if (filters.minCpi && !isNaN(parseFloat(filters.minCpi))) {
    params.push(parseFloat(filters.minCpi));
    conditions.push(`cpi_final >= $${params.length}`);
  }

  if (filters.status) {
    const s = filters.status.toUpperCase();
    if (s === 'PASS' || s === 'CLEAR') {
      conditions.push(`(
        (result_sem_1 IS NULL OR result_sem_1 NOT ILIKE '%FAIL%') AND
        (result_sem_2 IS NULL OR result_sem_2 NOT ILIKE '%FAIL%') AND
        (result_sem_3 IS NULL OR result_sem_3 NOT ILIKE '%FAIL%') AND
        (result_sem_4 IS NULL OR result_sem_4 NOT ILIKE '%FAIL%') AND
        (result_sem_5 IS NULL OR result_sem_5 NOT ILIKE '%FAIL%') AND
        (result_sem_6 IS NULL OR result_sem_6 NOT ILIKE '%FAIL%') AND
        (result_sem_7 IS NULL OR result_sem_7 NOT ILIKE '%FAIL%') AND
        (result_sem_8 IS NULL OR result_sem_8 NOT ILIKE '%FAIL%')
      )`);
    } else if (s === 'FAIL' || s === 'BACKLOG') {
      conditions.push(`(
        result_sem_1 ILIKE '%FAIL%' OR
        result_sem_2 ILIKE '%FAIL%' OR
        result_sem_3 ILIKE '%FAIL%' OR
        result_sem_4 ILIKE '%FAIL%' OR
        result_sem_5 ILIKE '%FAIL%' OR
        result_sem_6 ILIKE '%FAIL%' OR
        result_sem_7 ILIKE '%FAIL%' OR
        result_sem_8 ILIKE '%FAIL%'
      )`);
    } else if (s === 'WH' || s === 'WITHHELD') {
      conditions.push(`(
        result_sem_1 ILIKE '%WH%' OR
        result_sem_2 ILIKE '%WH%' OR
        result_sem_3 ILIKE '%WH%' OR
        result_sem_4 ILIKE '%WH%' OR
        result_sem_5 ILIKE '%WH%' OR
        result_sem_6 ILIKE '%WH%' OR
        result_sem_7 ILIKE '%WH%' OR
        result_sem_8 ILIKE '%WH%'
      )`);
    }
  }

  const whereClause = conditions.join(' AND ');

  const countRes = await db.query(
    `SELECT COUNT(*) as count FROM students WHERE ${whereClause}`,
    params
  );
  const dbTotal = parseInt(countRes.rows[0].count, 10);

  let extraRegs = [];
  if (isUserAdmin && (!filters.status && !filters.minCpi && !filters.degree && !filters.branch && !filters.batch)) {
    const regMatches = searchRegistrationByName(name, null);
    if (regMatches.length > 0) {
      const scholarList = regMatches.map(r => r.scholarNo.toUpperCase());
      const dbExistingRes = await db.query(
        "SELECT scholar_no FROM students WHERE UPPER(scholar_no) = ANY($1::text[])",
        [scholarList]
      );
      const existingSet = new Set(dbExistingRes.rows.map(r => r.scholar_no.toUpperCase()));
      extraRegs = regMatches
        .filter(r => !existingSet.has(r.scholarNo.toUpperCase()))
        .map(r => ({
          scholar_no: r.scholarNo,
          name: r.name,
          degree: 'N/A',
          specialization: 'N/A',
          backlogs: [],
          hasBacklog: false,
          isRegistrationOnly: true,
          regData: r
        }));
    }
  }

  const total = dbTotal + extraRegs.length;
  if (total === 0) {
    return { results: [], total: 0 };
  }

  const start = (page - 1) * limit;
  const end = page * limit;
  let pageResults = [];

  if (start < dbTotal) {
    const dbLimit = Math.min(limit, dbTotal - start);
    const dbOffset = start;
    const queryParams = [...params, dbLimit, dbOffset];
    const dbRes = await db.query(
      `SELECT id, scholar_no, name, degree, specialization, cpi_final, ` +
      `result_sem_1, result_sem_2, result_sem_3, result_sem_4, ` +
      `result_sem_5, result_sem_6, result_sem_7, result_sem_8 ` +
      `FROM students WHERE ${whereClause} ` +
      `ORDER BY id LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`,
      queryParams
    );
    pageResults = dbRes.rows.map(r => {
      const backlogs = [];
      for (let s = 1; s <= 8; s++) {
        const resCol = r[`result_sem_${s}`];
        if (resCol && resCol.toUpperCase().includes('FAIL')) {
          const subs = extractFailedSubjects(resCol);
          backlogs.push(...subs);
        }
      }
      return {
        scholar_no: r.scholar_no,
        name: r.name,
        degree: r.degree,
        specialization: r.specialization,
        cpi: r.cpi_final,
        backlogs,
        hasBacklog: backlogs.length > 0,
        isRegistrationOnly: false
      };
    });

    if (end > dbTotal && extraRegs.length > 0) {
      const regNeeded = end - dbTotal;
      const regSlice = extraRegs.slice(0, regNeeded);
      pageResults.push(...regSlice);
    }
  } else {
    const regStart = start - dbTotal;
    const regEnd = end - dbTotal;
    pageResults = extraRegs.slice(regStart, regEnd);
  }

  return { results: pageResults, total };
}

export async function logSearch({ user = null, webUserId = null, student }) {
  if (!student) return;
  const db = getDb();
  const uid = webUserId || user?.id || null;
  const username = user?.username || user?.email || null;
  const firstName = user?.name || user?.username || null;

  try {
    await db.query(
      `INSERT INTO search_history (web_user_id, username, first_name, scholar_no, student_name)
       VALUES ($1, $2, $3, $4, $5)`,
      [uid, username, firstName, student.scholar_no, student.name]
    );
  } catch (err) {
    console.error('[Query] Failed to log search:', err.message);
  }
}

export async function getSearchHistory({ range = 'all', userId = null, webUserId = null, page = 1, pageSize = 30 } = {}) {
  const db = getDb();
  const conditions = [];
  const params = [];

  if (range === 'today') {
    conditions.push("timestamp >= CURRENT_DATE");
  } else if (range === 'yesterday') {
    conditions.push("timestamp >= CURRENT_DATE - INTERVAL '1 day' AND timestamp < CURRENT_DATE");
  } else if (range === '7d') {
    conditions.push("timestamp >= NOW() - INTERVAL '7 days'");
  } else if (range === '30d') {
    conditions.push("timestamp >= NOW() - INTERVAL '30 days'");
  }

  const targetUser = webUserId || userId;
  if (targetUser) {
    params.push(targetUser);
    conditions.push(`(web_user_id = $${params.length} OR CAST(user_id AS TEXT) = $${params.length})`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRes = await db.query(`SELECT COUNT(*) as count FROM search_history ${whereClause}`, params);
  const total = parseInt(countRes.rows[0]?.count || '0', 10);

  const offset = (page - 1) * pageSize;
  params.push(pageSize);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const dataRes = await db.query(`
    SELECT id, user_id, web_user_id, username, first_name, scholar_no, student_name,
           TO_CHAR(timestamp + interval '5 hours 30 minutes', 'YYYY-MM-DD HH12:MI:SS AM') as timestamp
    FROM search_history
    ${whereClause}
    ORDER BY id DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `, params);

  return { results: dataRes.rows, total };
}

export async function getHistoryByScholarNo(scholarNo) {
  const db = getDb();
  const res = await db.query(
    `SELECT id, user_id, web_user_id, username, first_name, scholar_no, student_name,
            TO_CHAR(timestamp + interval '5 hours 30 minutes', 'YYYY-MM-DD HH12:MI:SS AM') as timestamp
     FROM search_history
     WHERE UPPER(scholar_no) = UPPER($1)
     ORDER BY id DESC`,
    [scholarNo.trim()]
  );
  return res.rows;
}

export async function logAiQuery({
  userId = null,
  webUserId = null,
  username = null,
  firstName = null,
  queryText,
  intent = null,
  batch = null,
  semester = null,
  isAnswered = true,
  rejectionReason = null,
  isCacheHit = false
}) {
  const db = getDb();
  const sql = `
    INSERT INTO ai_query_history (
      user_id, web_user_id, username, first_name, query_text, intent, batch, semester,
      is_answered, rejection_reason, is_cache_hit
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING id
  `;
  const res = await db.query(sql, [
    typeof userId === 'number' ? userId : null,
    webUserId || (typeof userId === 'string' ? userId : null),
    username,
    firstName,
    queryText,
    intent,
    batch,
    semester ? parseInt(semester, 10) : null,
    Boolean(isAnswered),
    rejectionReason,
    Boolean(isCacheHit)
  ]).catch(err => {
    console.error('[Query] Failed to log AI query:', err.message);
    return { rows: [] };
  });

  return res.rows[0] || null;
}

export async function getAiHistoryByFilter({ range = 'all', userId = null, webUserId = null, rating = null, page = 1, pageSize = 20 } = {}) {
  const db = getDb();
  const conditions = [];
  const params = [];

  if (range === 'today') {
    conditions.push("timestamp >= CURRENT_DATE");
  } else if (range === 'yesterday') {
    conditions.push("timestamp >= CURRENT_DATE - INTERVAL '1 day' AND timestamp < CURRENT_DATE");
  } else if (range === '7d') {
    conditions.push("timestamp >= NOW() - INTERVAL '7 days'");
  } else if (range === '30d') {
    conditions.push("timestamp >= NOW() - INTERVAL '30 days'");
  }

  const targetUser = webUserId || userId;
  if (targetUser) {
    params.push(targetUser);
    conditions.push(`(web_user_id = $${params.length} OR CAST(user_id AS TEXT) = $${params.length})`);
  }

  if (rating) {
    params.push(rating);
    conditions.push(`rating = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRes = await db.query(`SELECT COUNT(*) as count FROM ai_query_history ${whereClause}`, params);
  const total = parseInt(countRes.rows[0]?.count || '0', 10);

  const offset = (page - 1) * pageSize;
  params.push(pageSize);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const dataRes = await db.query(`
    SELECT id, user_id, web_user_id, username, first_name, query_text, intent, batch, semester,
           is_answered, rejection_reason, is_cache_hit, rating,
           TO_CHAR(timestamp + interval '5 hours 30 minutes', 'YYYY-MM-DD HH12:MI:SS AM') as timestamp
    FROM ai_query_history
    ${whereClause}
    ORDER BY id DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `, params);

  return { results: dataRes.rows, total };
}

export async function getUnratedAiQueries(page = 1, pageSize = 1) {
  const db = getDb();
  const countRes = await db.query('SELECT COUNT(*) as count FROM ai_query_history WHERE rating IS NULL');
  const total = parseInt(countRes.rows[0]?.count || '0', 10);

  const offset = (page - 1) * pageSize;
  const res = await db.query(
    `SELECT id, user_id, web_user_id, username, first_name, query_text, intent, batch, semester,
            is_answered, rejection_reason, is_cache_hit,
            TO_CHAR(timestamp + interval '5 hours 30 minutes', 'YYYY-MM-DD HH12:MI:SS AM') as timestamp
     FROM ai_query_history
     WHERE rating IS NULL
     ORDER BY id ASC
     LIMIT $1 OFFSET $2`,
    [pageSize, offset]
  );
  return { results: res.rows, total };
}

export async function getAiQueryById(id) {
  const db = getDb();
  const res = await db.query(
    `SELECT id, user_id, web_user_id, username, first_name, query_text, intent, batch, semester,
            is_answered, rejection_reason, is_cache_hit, rating,
            TO_CHAR(timestamp + interval '5 hours 30 minutes', 'YYYY-MM-DD HH12:MI:SS AM') as timestamp
     FROM ai_query_history
     WHERE id = $1`,
    [id]
  );
  return res.rows[0] || null;
}

export async function rateAiQuery(id, rating) {
  const db = getDb();
  const res = await db.query('UPDATE ai_query_history SET rating = $2 WHERE id = $1', [id, rating]);
  return res.rowCount > 0;
}

export async function addFeedbackCorrection(queryText, wrongOutput, correctOutput, webUserId = null) {
  const db = getDb();
  let embedding = null;
  try {
    embedding = await getEmbedding(queryText);
  } catch (err) {
    console.warn('[Feedback] Failed to generate embedding for correction:', err.message);
  }

  if (embedding) {
    const vecStr = `[${embedding.join(',')}]`;
    const res = await db.query(
      'INSERT INTO feedback_corrections (query_text, wrong_output, correct_output, embedding, web_user_id) VALUES ($1, $2, $3, $4::vector, $5) RETURNING id',
      [queryText, wrongOutput, correctOutput, vecStr, webUserId]
    );
    return res.rows[0];
  }

  const res = await db.query(
    'INSERT INTO feedback_corrections (query_text, wrong_output, correct_output, web_user_id) VALUES ($1, $2, $3, $4) RETURNING id',
    [queryText, wrongOutput, correctOutput, webUserId]
  );
  return res.rows[0];
}

export async function findSimilarCorrections(queryText, maxResults = 3) {
  if (!queryText || typeof queryText !== 'string') return [];
  const db = getDb();

  try {
    const embedding = await getEmbedding(queryText);
    if (embedding) {
      const vecStr = `[${embedding.join(',')}]`;
      const res = await db.query(
        `SELECT id, query_text, wrong_output, correct_output,
                1 - (embedding <=> $1::vector) as similarity
         FROM feedback_corrections
         WHERE embedding IS NOT NULL
         ORDER BY embedding <=> $1::vector
         LIMIT $2`,
        [vecStr, maxResults]
      );

      const relevant = (res.rows || []).filter(r => r.similarity >= 0.5);
      if (relevant.length > 0) return relevant;
    }
  } catch (err) {
    console.warn('[Feedback] Vector search fallback to tokens:', err.message);
  }

  try {
    const res = await db.query(
      'SELECT id, query_text, wrong_output, correct_output FROM feedback_corrections ORDER BY id DESC LIMIT 100'
    );
    if (!res.rows || res.rows.length === 0) return [];

    const tokenize = s => new Set(
      s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2)
    );
    const queryTokens = tokenize(queryText);
    if (queryTokens.size === 0) return [];

    const scored = res.rows.map(row => {
      const rowTokens = tokenize(row.query_text);
      if (rowTokens.size === 0) return { ...row, score: 0 };
      let overlap = 0;
      for (const t of queryTokens) {
        if (rowTokens.has(t)) overlap++;
      }
      const score = overlap / (queryTokens.size + rowTokens.size - overlap);
      return { ...row, score };
    });

    return scored
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  } catch {
    return [];
  }
}

// Special scholar methods
export async function isSpecialScholar(scholarNo) {
  if (!scholarNo) return false;
  try {
    const db = getDb();
    const res = await db.query(
      'SELECT 1 FROM special_scholars WHERE UPPER(scholar_no) = UPPER($1)',
      [scholarNo.trim()]
    );
    return res.rowCount > 0;
  } catch (err) {
    console.error('[Special] Check failed:', err.message);
    return false;
  }
}

export async function addSpecialScholar(scholarNo, webUserId = null, note = null) {
  if (!scholarNo) return false;
  try {
    const db = getDb();
    const res = await db.query(
      `INSERT INTO special_scholars (scholar_no, added_by_web_user_id, note)
       VALUES (UPPER($1), $2, $3)
       ON CONFLICT (scholar_no) DO UPDATE SET note = EXCLUDED.note, added_by_web_user_id = EXCLUDED.added_by_web_user_id`,
      [scholarNo.trim(), webUserId, note]
    );
    return res.rowCount > 0;
  } catch (err) {
    console.error('[Special] Add failed:', err.message);
    return false;
  }
}

export async function removeSpecialScholar(scholarNo) {
  if (!scholarNo) return false;
  try {
    const db = getDb();
    const res = await db.query(
      'DELETE FROM special_scholars WHERE UPPER(scholar_no) = UPPER($1)',
      [scholarNo.trim()]
    );
    return res.rowCount > 0;
  } catch (err) {
    console.error('[Special] Remove failed:', err.message);
    return false;
  }
}

export async function getSpecialScholars() {
  try {
    const db = getDb();
    const res = await db.query(
      `SELECT scholar_no, note, added_by_web_user_id,
              TO_CHAR(added_at + interval '5 hours 30 minutes', 'YYYY-MM-DD HH12:MI:SS AM') as added_at
       FROM special_scholars
       ORDER BY added_at DESC`
    );
    return res.rows;
  } catch (err) {
    console.error('[Special] Query failed:', err.message);
    return [];
  }
}
