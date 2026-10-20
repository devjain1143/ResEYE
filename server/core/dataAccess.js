import { getDb } from './db.js';
import * as query from './query.js';

export function isScholarNumber(input) {
  if (!input) return false;
  return /^[0-9]{2}/.test(input.trim());
}

export function buildBatchFilter(filterInput) {
  if (!filterInput) {
    return { conditionSql: '1=1', params: [] };
  }

  if (typeof filterInput === 'object') {
    const { degree, specialization, scholar_no_prefix, batch } = filterInput;
    const conditions = [];
    const params = [];

    if (degree) {
      params.push(degree);
      conditions.push(`degree ILIKE $${params.length}`);
    }
    if (specialization) {
      params.push(specialization);
      conditions.push(`specialization ILIKE $${params.length}`);
    }
    if (scholar_no_prefix) {
      params.push(`${scholar_no_prefix.toUpperCase()}%`);
      conditions.push(`scholar_no LIKE $${params.length}`);
    }

    if (conditions.length > 0) {
      return {
        conditionSql: conditions.join(' AND '),
        params
      };
    }

    if (batch && typeof batch === 'string') {
      return buildBatchFilter(batch);
    }

    return { conditionSql: '1=1', params: [] };
  }

  if (typeof filterInput !== 'string') {
    return { conditionSql: '1=1', params: [] };
  }

  const raw = filterInput.trim();
  if (/^\d{2}[A-Z]\d{0,3}$/i.test(raw)) {
    return {
      conditionSql: 'scholar_no LIKE $1',
      params: [`${raw.toUpperCase()}%`]
    };
  }

  let text = raw.toLowerCase();
  text = text.replace(/\b(batch\s+of|class\s+of|batch|students\s+in\s+the|students\s+in|students|the|of)\b/g, ' ').trim();

  let degreeLike = null;
  let degreeCode = null;
  let courseDuration = 4;

  if (/\bm\s*\.?\s*tech\b/i.test(text)) {
    degreeLike = '%M Tech%';
    degreeCode = 'P';
    courseDuration = 2;
    text = text.replace(/\bm\s*\.?\s*tech\b/gi, ' ').trim();
  } else if (/\bmca\b/i.test(text)) {
    degreeLike = '%MCA%';
    degreeCode = 'P';
    courseDuration = 3;
    text = text.replace(/\bmca\b/gi, ' ').trim();
  } else if (/\bb\s*\.?\s*tech\b/i.test(text)) {
    degreeLike = '%B Tech%';
    degreeCode = 'U';
    courseDuration = 4;
    text = text.replace(/\bb\s*\.?\s*tech\b/gi, ' ').trim();
  } else if (/\bph\s*\.?\s*d\b/i.test(text)) {
    degreeLike = '%Ph. D.%';
    degreeCode = 'D';
    courseDuration = 5;
    text = text.replace(/\bph\s*\.?\s*d\b/gi, ' ').trim();
  } else {
    degreeCode = 'U';
    courseDuration = 4;
  }

  const currentYear = new Date().getFullYear();
  let admissionYear = null;

  const yearMatch = text.match(/\b(1st|2nd|3rd|4th|5th|first|second|third|fourth|final)\s+year\b/i);
  if (yearMatch) {
    const word = yearMatch[1].toLowerCase();
    let yearNum = 1;
    if (word === '2nd' || word === 'second') yearNum = 2;
    else if (word === '3rd' || word === 'third') yearNum = 3;
    else if (word === '4th' || word === 'fourth' || word === 'final') yearNum = courseDuration;
    else if (word === '5th') yearNum = 5;

    admissionYear = currentYear - yearNum + 1;
    text = text.replace(yearMatch[0], ' ').trim();
  }

  let scholarPrefix = null;
  const numMatch = text.match(/\b(20\d{2}|\d{2})\b/);
  if (numMatch) {
    let year = parseInt(numMatch[1], 10);
    if (year >= 2000) {
      if (year >= 2020) year = year - courseDuration;
      else year = year % 100;
    }
    const yyStr = String(year).padStart(2, '0');
    scholarPrefix = `${yyStr}${degreeCode || 'U'}`;
    text = text.replace(numMatch[0], ' ').trim();
  } else if (admissionYear) {
    const yyStr = String(admissionYear % 100).padStart(2, '0');
    scholarPrefix = `${yyStr}${degreeCode || 'U'}`;
  }

  let specLike = null;
  const cleanTokens = text.replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean);
  const specMap = [
    { keys: ['cseds', 'ds', 'datascience'], like: '%Data Science%' },
    { keys: ['cseai', 'ai', 'artificialintelligence'], like: '%Artificial Intelligence%' },
    { keys: ['csecps', 'cps', 'cyberphysical', 'cyberphysicalsystem'], like: '%Cyber Physical System%' },
    { keys: ['csecyber', 'cyber', 'cybersecurity'], like: '%Cyber Security%' },
    { keys: ['csecs', 'cse', 'cs', 'computerscience'], like: '%Computer Science & Engineering%' },
    { keys: ['ece', 'electronics', 'electronicscommunication'], like: '%Electronics & Communication Engineering%' },
    { keys: ['it', 'informationtechnology'], like: '%Information Technology%' },
    { keys: ['mnc', 'mac', 'mathematicsandcomputing', 'mathematicscomputing'], like: '%Mathematics and Computing%' },
    { keys: ['pnc', 'pce', 'physicsandcomputationalengineering', 'physicscomputational'], like: '%Physics and Computational Engineering%' },
    { keys: ['mca', 'masterofcomputerapplication'], like: '%Master of Computer Application%' }
  ];

  for (const token of cleanTokens) {
    for (const item of specMap) {
      if (item.keys.includes(token)) {
        specLike = item.like;
        break;
      }
    }
    if (specLike) break;
  }

  const conditions = [];
  const params = [];

  if (scholarPrefix) {
    params.push(`${scholarPrefix}%`);
    conditions.push(`scholar_no LIKE $${params.length}`);
  }
  if (degreeLike) {
    params.push(degreeLike);
    conditions.push(`degree ILIKE $${params.length}`);
  }
  if (specLike) {
    params.push(specLike);
    conditions.push(`specialization ILIKE $${params.length}`);
  }

  if (conditions.length === 0) {
    return { conditionSql: '1=1', params: [] };
  }

  return {
    conditionSql: conditions.join(' AND '),
    params
  };
}

export async function getStudentByIdentifier(identifier) {
  if (!identifier) return null;
  const db = getDb();
  const clean = String(identifier).trim();

  if (isScholarNumber(clean)) {
    const student = await query.getByScholarNo(clean);
    if (student) return student;
  }

  const searchRes = await query.searchByName(clean, 1, 1);
  if (searchRes.results.length > 0) {
    return await query.getByScholarNo(searchRes.results[0].scholar_no);
  }

  return null;
}

export async function getStudentsByBatch(filterInput) {
  const db = getDb();
  const filter = buildBatchFilter(filterInput);

  const countRes = await db.query(
    `SELECT COUNT(*) as total FROM students WHERE ${filter.conditionSql}`,
    filter.params
  );
  const total = parseInt(countRes.rows[0]?.total || '0', 10);

  const res = await db.query(
    `SELECT id, scholar_no, name, degree, specialization, cpi_final 
     FROM students 
     WHERE ${filter.conditionSql} 
     ORDER BY scholar_no ASC 
     LIMIT 5`,
    filter.params
  );

  return { students: res.rows, total };
}

export async function getTopScorer(filterInput, semester = null, metric = 'cpi', position = 'highest', limit = 1) {
  const db = getDb();
  const filter = buildBatchFilter(filterInput);

  let targetCol = 'cpi_final';
  if (metric.toLowerCase() === 'spi') {
    const sem = parseInt(semester, 10);
    if (isNaN(sem) || sem < 1 || sem > 8) {
      throw new Error(`Invalid semester ${semester}`);
    }
    targetCol = `spi_sem_${sem}`;
  }

  const orderDir = position.toLowerCase() === 'lowest' ? 'ASC' : 'DESC';
  const fetchLimit = Math.max(1, Math.min(5, parseInt(limit, 10) || 1));

  const sql = `
    SELECT id, scholar_no, name, degree, specialization, cpi_final, ${targetCol} as score
    FROM students 
    WHERE ${filter.conditionSql} AND ${targetCol} IS NOT NULL 
    ORDER BY ${targetCol} ${orderDir} 
    LIMIT $${filter.params.length + 1}
  `;

  const res = await db.query(sql, [...filter.params, fetchLimit]);
  if (!res.rows || res.rows.length === 0) return fetchLimit > 1 ? [] : null;
  return fetchLimit > 1 ? res.rows : res.rows[0];
}

export async function getAverageMetric(filterInput, semester = null, metric = 'cpi') {
  const db = getDb();
  const filter = buildBatchFilter(filterInput);

  let targetCol = 'cpi_final';
  if (metric.toLowerCase() === 'spi') {
    const sem = parseInt(semester, 10);
    if (isNaN(sem) || sem < 1 || sem > 8) {
      throw new Error(`Invalid semester ${semester}`);
    }
    targetCol = `spi_sem_${sem}`;
  }

  const sql = `
    SELECT AVG(${targetCol}) as avg_score, COUNT(*) as count 
    FROM students 
    WHERE ${filter.conditionSql} AND ${targetCol} IS NOT NULL
  `;

  const res = await db.query(sql, filter.params);
  const row = res.rows[0] || {};
  return {
    average: row.avg_score !== null ? parseFloat(row.avg_score) : null,
    count: parseInt(row.count || '0', 10)
  };
}

export async function getResultCounts(filterInput, semester) {
  const db = getDb();
  const filter = buildBatchFilter(filterInput);
  const sem = parseInt(semester, 10);
  if (isNaN(sem) || sem < 1 || sem > 8) {
    throw new Error(`Invalid semester ${semester}`);
  }

  const targetCol = `result_sem_${sem}`;

  const sql = `
    SELECT 
      COUNT(*) FILTER (WHERE UPPER(${targetCol}) LIKE '%PASS%') as pass,
      COUNT(*) FILTER (WHERE UPPER(${targetCol}) LIKE '%FAIL%') as fail,
      COUNT(*) FILTER (WHERE UPPER(${targetCol}) LIKE '%WH%' OR UPPER(${targetCol}) LIKE '%WITHHELD%') as withheld,
      COUNT(*) as total
    FROM students 
    WHERE ${filter.conditionSql} AND ${targetCol} IS NOT NULL
  `;

  const res = await db.query(sql, filter.params);
  const row = res.rows[0] || {};
  return {
    pass: parseInt(row.pass || '0', 10),
    fail: parseInt(row.fail || '0', 10),
    withheld: parseInt(row.withheld || '0', 10),
    total: parseInt(row.total || '0', 10)
  };
}

export async function getRank(scholarNo, filterInput, semester = null, metric = 'cpi') {
  const db = getDb();
  const filter = buildBatchFilter(filterInput);

  let targetCol = 'cpi_final';
  if (metric.toLowerCase() === 'spi') {
    const sem = parseInt(semester, 10);
    if (isNaN(sem) || sem < 1 || sem > 8) {
      throw new Error(`Invalid semester ${semester}`);
    }
    targetCol = `spi_sem_${sem}`;
  }

  const cleanIdent = (scholarNo || '').trim();

  const studentSql = `
    WITH ranked AS (
      SELECT scholar_no, name, degree, specialization, ${targetCol} as score,
             RANK() OVER (ORDER BY ${targetCol} DESC NULLS LAST) as rank,
             COUNT(*) OVER () as total
      FROM students
      WHERE ${filter.conditionSql} AND ${targetCol} IS NOT NULL
    )
    SELECT * FROM ranked 
    WHERE UPPER(scholar_no) = UPPER($${filter.params.length + 1}) 
       OR UPPER(name) LIKE '%' || UPPER($${filter.params.length + 1}) || '%'
    LIMIT 1
  `;

  const res = await db.query(studentSql, [...filter.params, cleanIdent]);
  if (!res.rows || res.rows.length === 0) return null;

  const row = res.rows[0];
  return {
    rank: parseInt(row.rank, 10),
    total: parseInt(row.total, 10),
    score: row.score !== null ? parseFloat(row.score) : null,
    student: {
      scholar_no: row.scholar_no,
      name: row.name,
      degree: row.degree,
      specialization: row.specialization
    }
  };
}

export * from './query.js';
