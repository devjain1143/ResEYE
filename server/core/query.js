import { getDb } from './db.js';
import { getEmbedding } from './embeddings.js';
import { searchRegistrationByName, getRegistrationByScholarNo } from './registration.js';
import { getRegistrationDetails } from '../services/identityService.js';
import { encryptField, decryptField, getEncryptionMode } from '../crypto/index.js';

function extractScholarNo(identifier) {
  if (!identifier || typeof identifier !== 'string') return null;
  const str = identifier.trim().toLowerCase();
  const emailMatch = str.match(/^([a-z0-9._-]+)@(?:[a-z0-9.-]+\.)?iiitbhopal\.ac\.in$/);
  if (emailMatch) {
    const local = emailMatch[1].split('+')[0];
    const match = local.match(/^(\d{2}[a-z0-9]+)$/i);
    return match ? match[1].toUpperCase() : local.toUpperCase();
  }
  const directMatch = str.match(/^(\d{2}[a-z0-9]{5,8})$/i);
  return directMatch ? directMatch[1].toUpperCase() : null;
}

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

  const conditions = ["(UPPER(name) LIKE '%' || $1 || '%' OR UPPER(scholar_no) LIKE '%' || $1 || '%')"];
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
    const foundByScholar = getRegistrationByScholarNo(cleanedName);
    if (foundByScholar && !regMatches.some(r => r.scholarNo === foundByScholar.scholarNo)) {
      regMatches.push(foundByScholar);
    }

    // Query Neon DB student_registrations table for additional matches
    try {
      const dbRegRes = await db.query(
        "SELECT scholar_no, candidate_name, course, father_name, category, contact_no, email, present_address " +
        "FROM student_registrations " +
        "WHERE UPPER(candidate_name) LIKE '%' || $1 || '%' OR UPPER(scholar_no) = $1 " +
        "LIMIT 50",
        [cleanedName]
      );
      for (const dr of dbRegRes.rows) {
        if (!regMatches.some(r => r.scholarNo.toUpperCase() === dr.scholar_no.toUpperCase())) {
          regMatches.push({
            scholarNo: dr.scholar_no.toUpperCase(),
            name: dr.candidate_name,
            guardian: dr.father_name,
            fatherName: dr.father_name,
            category: dr.category,
            course: dr.course,
            phones: dr.contact_no ? [dr.contact_no] : [],
            emails: dr.email ? [dr.email] : [],
            addresses: dr.present_address ? [{ text: dr.present_address, semesters: [] }] : []
          });
        }
      }
    } catch (e) {
      console.warn('[Query] Error querying DB student_registrations:', e.message);
    }

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
          specialization: r.course || 'N/A',
          backlogs: [],
          hasBacklog: false,
          isRegistrationOnly: true,
          registration: {
            name: r.name,
            fatherName: r.fatherName || r.guardian || null,
            guardian: r.guardian || r.fatherName || null,
            category: r.category || null,
            phones: r.phones || [],
            emails: r.emails || [],
            addresses: r.addresses || []
          }
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
  const mode = getEncryptionMode();

  try {
    const studentNameEnc = encryptField(student.name, { table: 'search_history', column: 'student_name', rowId: 0 }, 'history');
    const studentNamePlain = mode === 'on' ? 'STUDENT' : student.name;

    await db.query(
      `INSERT INTO search_history (web_user_id, username, first_name, scholar_no, student_name, student_name_enc)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [uid, username, firstName, student.scholar_no, studentNamePlain, studentNameEnc]
    );
  } catch (err) {
    console.error('[Query] Failed to log search:', err.message);
  }
}

export async function getSearchHistory({ range = 'all', userId = null, webUserId = null, page = 1, pageSize = 30, isAdmin = false } = {}) {
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
    SELECT id, user_id, web_user_id, username, first_name, scholar_no, student_name, student_name_enc,
           TO_CHAR(timestamp + interval '5 hours 30 minutes', 'YYYY-MM-DD HH12:MI:SS AM') as timestamp
    FROM search_history
    ${whereClause}
    ORDER BY id DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `, params);

  const userMap = new Map();
  if (isAdmin) {
    const distinctWebUserIds = [...new Set(dataRes.rows.map(r => r.web_user_id).filter(Boolean))];
    if (distinctWebUserIds.length > 0) {
      try {
        const uRes = await db.query(
          'SELECT id, username, email FROM auth."User" WHERE id = ANY($1)',
          [distinctWebUserIds]
        );
        for (const u of uRes.rows) {
          userMap.set(u.id, u);
        }
      } catch (e) {
        console.warn('[Query] Error fetching userMap for history:', e.message);
      }
    }
  }

  const results = await Promise.all(dataRes.rows.map(async (row) => {
    let student_name = row.student_name;
    if (row.student_name_enc) {
      try {
        student_name = decryptField(row.student_name_enc, { table: 'search_history', column: 'student_name', rowId: row.id || 0 }, 'history');
      } catch {
        student_name = row.student_name;
      }
    }
    const clean = { ...row, student_name };
    delete clean.student_name_enc;

    if (isAdmin) {
      const authUser = row.web_user_id ? userMap.get(row.web_user_id) : null;
      const searcherEmail = authUser?.email || (row.username?.includes('@') ? row.username : null);
      const searcherScholarNo = extractScholarNo(searcherEmail) || extractScholarNo(row.username);
      let reg = null;
      if (searcherScholarNo) {
        reg = await getRegistrationDetails(searcherScholarNo);
      }
      clean.searcher_scholar_no = searcherScholarNo || null;
      clean.searcher_name = reg?.name || authUser?.username || row.first_name || row.username || 'User';
      clean.searcher_email = searcherEmail || null;
    } else {
      delete clean.searcher_scholar_no;
      delete clean.searcher_name;
      delete clean.searcher_email;
    }
    return clean;
  }));

  return { results, total };
}

export async function getHistoryByScholarNo(scholarNo) {
  const db = getDb();
  const res = await db.query(
    `SELECT id, user_id, web_user_id, username, first_name, scholar_no, student_name, student_name_enc,
            TO_CHAR(timestamp + interval '5 hours 30 minutes', 'YYYY-MM-DD HH12:MI:SS AM') as timestamp
     FROM search_history
     WHERE UPPER(scholar_no) = UPPER($1)
     ORDER BY id DESC`,
    [scholarNo.trim()]
  );

  const distinctWebUserIds = [...new Set(res.rows.map(r => r.web_user_id).filter(Boolean))];
  const userMap = new Map();
  if (distinctWebUserIds.length > 0) {
    try {
      const uRes = await db.query(
        'SELECT id, username, email FROM auth."User" WHERE id = ANY($1)',
        [distinctWebUserIds]
      );
      for (const u of uRes.rows) {
        userMap.set(u.id, u);
      }
    } catch (e) {
      console.warn('[Query] Error fetching userMap for historyByScholar:', e.message);
    }
  }

  const results = await Promise.all(res.rows.map(async (row) => {
    let student_name = row.student_name;
    if (row.student_name_enc) {
      try {
        student_name = decryptField(row.student_name_enc, { table: 'search_history', column: 'student_name', rowId: row.id || 0 }, 'history');
      } catch {
        student_name = row.student_name;
      }
    }
    const clean = { ...row, student_name };
    delete clean.student_name_enc;

    const authUser = row.web_user_id ? userMap.get(row.web_user_id) : null;
    const searcherEmail = authUser?.email || (row.username?.includes('@') ? row.username : null);
    const searcherScholarNo = extractScholarNo(searcherEmail) || extractScholarNo(row.username);
    let reg = null;
    if (searcherScholarNo) {
      reg = await getRegistrationDetails(searcherScholarNo);
    }
    clean.searcher_scholar_no = searcherScholarNo || null;
    clean.searcher_name = reg?.name || authUser?.username || row.first_name || row.username || 'User';
    clean.searcher_email = searcherEmail || null;
    return clean;
  }));

  return results;
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
  const mode = getEncryptionMode();
  const queryTextEnc = encryptField(queryText, { table: 'ai_query_history', column: 'query_text', rowId: 0 }, 'history');
  const queryTextPlain = mode === 'on' ? 'AI_QUERY' : queryText;

  const sql = `
    INSERT INTO ai_query_history (
      user_id, web_user_id, username, first_name, query_text, query_text_enc, intent, batch, semester,
      is_answered, rejection_reason, is_cache_hit
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING id
  `;
  const res = await db.query(sql, [
    typeof userId === 'number' ? userId : null,
    webUserId || (typeof userId === 'string' ? userId : null),
    username,
    firstName,
    queryTextPlain,
    queryTextEnc,
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
    SELECT id, user_id, web_user_id, username, first_name, query_text, query_text_enc, intent, batch, semester,
           is_answered, rejection_reason, is_cache_hit, rating,
           TO_CHAR(timestamp + interval '5 hours 30 minutes', 'YYYY-MM-DD HH12:MI:SS AM') as timestamp
    FROM ai_query_history
    ${whereClause}
    ORDER BY id DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `, params);

  const results = dataRes.rows.map(row => {
    let query_text = row.query_text;
    if (row.query_text_enc) {
      try {
        query_text = decryptField(row.query_text_enc, { table: 'ai_query_history', column: 'query_text', rowId: row.id || 0 }, 'history');
      } catch {
        query_text = row.query_text;
      }
    }
    const clean = { ...row, query_text };
    delete clean.query_text_enc;
    return clean;
  });

  return { results, total };
}

export async function getUnratedAiQueries(page = 1, pageSize = 1) {
  const db = getDb();
  const countRes = await db.query('SELECT COUNT(*) as count FROM ai_query_history WHERE rating IS NULL');
  const total = parseInt(countRes.rows[0]?.count || '0', 10);

  const offset = (page - 1) * pageSize;
  const res = await db.query(
    `SELECT id, user_id, web_user_id, username, first_name, query_text, query_text_enc, intent, batch, semester,
            is_answered, rejection_reason, is_cache_hit,
            TO_CHAR(timestamp + interval '5 hours 30 minutes', 'YYYY-MM-DD HH12:MI:SS AM') as timestamp
     FROM ai_query_history
     WHERE rating IS NULL
     ORDER BY id ASC
     LIMIT $1 OFFSET $2`,
    [pageSize, offset]
  );

  const results = res.rows.map(row => {
    let query_text = row.query_text;
    if (row.query_text_enc) {
      try {
        query_text = decryptField(row.query_text_enc, { table: 'ai_query_history', column: 'query_text', rowId: row.id || 0 }, 'history');
      } catch {
        query_text = row.query_text;
      }
    }
    const clean = { ...row, query_text };
    delete clean.query_text_enc;
    return clean;
  });

  return { results, total };
}

export async function getAiQueryById(id) {
  const db = getDb();
  const res = await db.query(
    `SELECT id, user_id, web_user_id, username, first_name, query_text, query_text_enc, intent, batch, semester,
            is_answered, rejection_reason, is_cache_hit, rating,
            TO_CHAR(timestamp + interval '5 hours 30 minutes', 'YYYY-MM-DD HH12:MI:SS AM') as timestamp
     FROM ai_query_history
     WHERE id = $1`,
    [id]
  );
  const row = res.rows[0];
  if (!row) return null;

  let query_text = row.query_text;
  if (row.query_text_enc) {
    try {
      query_text = decryptField(row.query_text_enc, { table: 'ai_query_history', column: 'query_text', rowId: row.id || 0 }, 'history');
    } catch {
      query_text = row.query_text;
    }
  }
  const clean = { ...row, query_text };
  delete clean.query_text_enc;
  return clean;
}

export async function rateAiQuery(id, rating) {
  const db = getDb();
  const res = await db.query('UPDATE ai_query_history SET rating = $2 WHERE id = $1', [id, rating]);
  return res.rowCount > 0;
}

export async function addFeedbackCorrection(queryText, wrongOutput, correctOutput, webUserId = null) {
  const db = getDb();
  const mode = getEncryptionMode();

  const queryTextEnc = encryptField(queryText, { table: 'feedback_corrections', column: 'query_text', rowId: 0 }, 'history');
  const wrongOutputEnc = encryptField(wrongOutput, { table: 'feedback_corrections', column: 'wrong_output', rowId: 0 }, 'history');
  const correctOutputEnc = encryptField(correctOutput, { table: 'feedback_corrections', column: 'correct_output', rowId: 0 }, 'history');

  const queryTextPlain = mode === 'on' ? 'FEEDBACK_QUERY' : queryText;
  const wrongOutputPlain = mode === 'on' ? 'FEEDBACK_WRONG' : wrongOutput;
  const correctOutputPlain = mode === 'on' ? 'FEEDBACK_CORRECT' : correctOutput;

  let embedding = null;
  try {
    embedding = await getEmbedding(queryText);
  } catch (err) {
    console.warn('[Feedback] Failed to generate embedding for correction:', err.message);
  }

  if (embedding) {
    const vecStr = `[${embedding.join(',')}]`;
    const res = await db.query(
      `INSERT INTO feedback_corrections (
        query_text, query_text_enc, wrong_output, wrong_output_enc, correct_output, correct_output_enc, embedding, web_user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::vector, $8) RETURNING id`,
      [queryTextPlain, queryTextEnc, wrongOutputPlain, wrongOutputEnc, correctOutputPlain, correctOutputEnc, vecStr, webUserId]
    );
    return res.rows[0];
  }

  const res = await db.query(
    `INSERT INTO feedback_corrections (
      query_text, query_text_enc, wrong_output, wrong_output_enc, correct_output, correct_output_enc, web_user_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [queryTextPlain, queryTextEnc, wrongOutputPlain, wrongOutputEnc, correctOutputPlain, correctOutputEnc, webUserId]
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
        `SELECT id, query_text, query_text_enc, wrong_output, wrong_output_enc, correct_output, correct_output_enc,
                1 - (embedding <=> $1::vector) as similarity
         FROM feedback_corrections
         WHERE embedding IS NOT NULL
         ORDER BY embedding <=> $1::vector
         LIMIT $2`,
        [vecStr, maxResults]
      );

      const relevant = (res.rows || []).filter(r => r.similarity >= 0.5);
      if (relevant.length > 0) {
        return relevant.map(r => {
          let qt = r.query_text;
          let wo = r.wrong_output;
          let co = r.correct_output;
          if (r.query_text_enc) {
            try { qt = decryptField(r.query_text_enc, { table: 'feedback_corrections', column: 'query_text', rowId: r.id || 0 }, 'history'); } catch {}
          }
          if (r.wrong_output_enc) {
            try { wo = decryptField(r.wrong_output_enc, { table: 'feedback_corrections', column: 'wrong_output', rowId: r.id || 0 }, 'history'); } catch {}
          }
          if (r.correct_output_enc) {
            try { co = decryptField(r.correct_output_enc, { table: 'feedback_corrections', column: 'correct_output', rowId: r.id || 0 }, 'history'); } catch {}
          }
          const clean = { ...r, query_text: qt, wrong_output: wo, correct_output: co };
          delete clean.query_text_enc;
          delete clean.wrong_output_enc;
          delete clean.correct_output_enc;
          return clean;
        });
      }
    }
  } catch (err) {
    console.warn('[Feedback] Vector search fallback to tokens:', err.message);
  }

  try {
    const res = await db.query(
      'SELECT id, query_text, query_text_enc, wrong_output, wrong_output_enc, correct_output, correct_output_enc FROM feedback_corrections ORDER BY id DESC LIMIT 100'
    );
    if (!res.rows || res.rows.length === 0) return [];

    const decryptedRows = res.rows.map(row => {
      let qt = row.query_text;
      let wo = row.wrong_output;
      let co = row.correct_output;
      if (row.query_text_enc) {
        try { qt = decryptField(row.query_text_enc, { table: 'feedback_corrections', column: 'query_text', rowId: row.id || 0 }, 'history'); } catch {}
      }
      if (row.wrong_output_enc) {
        try { wo = decryptField(row.wrong_output_enc, { table: 'feedback_corrections', column: 'wrong_output', rowId: row.id || 0 }, 'history'); } catch {}
      }
      if (row.correct_output_enc) {
        try { co = decryptField(row.correct_output_enc, { table: 'feedback_corrections', column: 'correct_output', rowId: row.id || 0 }, 'history'); } catch {}
      }
      return { id: row.id, query_text: qt, wrong_output: wo, correct_output: co };
    });

    const tokenize = s => new Set(
      s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2)
    );
    const queryTokens = tokenize(queryText);
    if (queryTokens.size === 0) return [];

    const scored = decryptedRows.map(row => {
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
  const cleanNo = scholarNo.trim().toUpperCase();
  const mode = getEncryptionMode();
  const noteEnc = note ? encryptField(note, { table: 'special_scholars', column: 'note', rowId: cleanNo }, 'alerts') : null;
  const notePlain = mode === 'on' ? 'SURVEILLANCE_NOTE' : note;

  try {
    const db = getDb();
    const res = await db.query(
      `INSERT INTO special_scholars (scholar_no, added_by_web_user_id, note, note_enc)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (scholar_no) DO UPDATE SET note = EXCLUDED.note, note_enc = EXCLUDED.note_enc, added_by_web_user_id = EXCLUDED.added_by_web_user_id`,
      [cleanNo, webUserId, notePlain, noteEnc]
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
      `SELECT scholar_no, note, note_enc, added_by_web_user_id,
              TO_CHAR(added_at + interval '5 hours 30 minutes', 'YYYY-MM-DD HH12:MI:SS AM') as added_at
       FROM special_scholars
       ORDER BY added_at DESC`
    );
    return res.rows.map(row => {
      let note = row.note;
      if (row.note_enc) {
        try {
          note = decryptField(row.note_enc, { table: 'special_scholars', column: 'note', rowId: row.scholar_no }, 'alerts');
        } catch {
          note = row.note;
        }
      }
      const clean = { ...row, note };
      delete clean.note_enc;
      return clean;
    });
  } catch (err) {
    console.error('[Special] Query failed:', err.message);
    return [];
  }
}
