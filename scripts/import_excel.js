import * as XLSXModule from 'xlsx';
const XLSX = XLSXModule.default || XLSXModule;
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { getDb } from '../server/core/db.js';
import { seedHistory } from './seed_history.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let EXCEL_PATH = path.resolve(process.env.EXCEL_FILE_PATH || './data/processed_output.xlsx');
if (!fs.existsSync(EXCEL_PATH)) {
  const alt = path.resolve('./processed_output.xlsx');
  if (fs.existsSync(alt)) EXCEL_PATH = alt;
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
const COL = {
  degree:        ['degree', 'programme', 'program'],
  specialization:['specialization', 'branch', 'spec'],
  scholar_no:    ['scholar no', 'scholar_no', 'scholar number', 'enrollment no', 'roll no', 'scholar no.'],
  name:          ['name', 'student name', 'name of candidate'],
  spi:           (n) => [`spi sem ${n}`, `spi_sem_${n}`, `sem${n} spi`, `semester ${n} spi`, `spi_sem_${ROMAN[n]}`],
  result:        (n) => [`result sem ${n}`, `result_sem_${n}`, `sem${n} result`, `semester ${n} result`, `result_sem_${ROMAN[n]}`],
  cpi_final:     ['cpi final', 'cpi_final', 'final cpi', 'cgpa'],
};

function findCol(headers, candidates) {
  const lower = headers.map(h => h.toLowerCase().trim());
  for (const c of candidates) {
    const idx = lower.indexOf(c.toLowerCase());
    if (idx !== -1) return headers[idx];
  }
  return null;
}

function safeNum(val) {
  if (val === null || val === undefined || val === '' || isNaN(val)) return null;
  return parseFloat(val);
}

function safeStr(val) {
  if (val === null || val === undefined) return null;
  return String(val).trim();
}

async function run() {
  console.log(`[Import] Reading Excel file: ${EXCEL_PATH}`);

  let workbook;
  try {
    workbook = XLSX.readFile(EXCEL_PATH);
  } catch (err) {
    console.error(`[Import] Failed to read Excel file: ${err.message}`);
    process.exit(1);
  }

  const sheetName = workbook.SheetNames[0];
  console.log(`[Import] Using sheet: "${sheetName}"`);

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });

  if (rows.length === 0) {
    console.error('[Import] No rows found in the Excel sheet.');
    process.exit(1);
  }

  const headers = Object.keys(rows[0]);
  console.log(`[Import] Detected headers: ${headers.join(', ')}`);

  const degreeCol        = findCol(headers, COL.degree);
  const specCol          = findCol(headers, COL.specialization);
  const scholarCol       = findCol(headers, COL.scholar_no);
  const nameCol          = findCol(headers, COL.name);
  const cpiCol           = findCol(headers, COL.cpi_final);

  if (!scholarCol || !nameCol) {
    console.error('[Import] Could not detect required columns (Scholar No, Name). Check your Excel headers.');
    process.exit(1);
  }

  const spiCols    = Array.from({ length: 8 }, (_, i) => findCol(headers, COL.spi(i + 1)));
  const resultCols = Array.from({ length: 8 }, (_, i) => findCol(headers, COL.result(i + 1)));

  const pool = getDb();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    console.log('[Import] Inserting/updating student academic records...');

    let inserted = 0;
    let skipped = 0;

    const queryText = `
      INSERT INTO students (
        degree, specialization, scholar_no, name,
        spi_sem_1, spi_sem_2, spi_sem_3, spi_sem_4,
        spi_sem_5, spi_sem_6, spi_sem_7, spi_sem_8,
        result_sem_1, result_sem_2, result_sem_3, result_sem_4,
        result_sem_5, result_sem_6, result_sem_7, result_sem_8,
        cpi_final
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8,
        $9, $10, $11, $12,
        $13, $14, $15, $16,
        $17, $18, $19, $20,
        $21
      ) ON CONFLICT (scholar_no) DO UPDATE SET
        degree = EXCLUDED.degree,
        specialization = EXCLUDED.specialization,
        name = EXCLUDED.name,
        spi_sem_1 = EXCLUDED.spi_sem_1,
        spi_sem_2 = EXCLUDED.spi_sem_2,
        spi_sem_3 = EXCLUDED.spi_sem_3,
        spi_sem_4 = EXCLUDED.spi_sem_4,
        spi_sem_5 = EXCLUDED.spi_sem_5,
        spi_sem_6 = EXCLUDED.spi_sem_6,
        spi_sem_7 = EXCLUDED.spi_sem_7,
        spi_sem_8 = EXCLUDED.spi_sem_8,
        result_sem_1 = EXCLUDED.result_sem_1,
        result_sem_2 = EXCLUDED.result_sem_2,
        result_sem_3 = EXCLUDED.result_sem_3,
        result_sem_4 = EXCLUDED.result_sem_4,
        result_sem_5 = EXCLUDED.result_sem_5,
        result_sem_6 = EXCLUDED.result_sem_6,
        result_sem_7 = EXCLUDED.result_sem_7,
        result_sem_8 = EXCLUDED.result_sem_8,
        cpi_final = EXCLUDED.cpi_final
    `;

    for (const row of rows) {
      const scholar_no = safeStr(row[scholarCol]);
      const name = safeStr(row[nameCol]);

      if (!scholar_no || !name) {
        skipped++;
        continue;
      }

      const values = [
        safeStr(degreeCol ? row[degreeCol] : null),
        safeStr(specCol   ? row[specCol]   : null),
        scholar_no,
        name.toUpperCase(),
        safeNum(spiCols[0] ? row[spiCols[0]] : null),
        safeNum(spiCols[1] ? row[spiCols[1]] : null),
        safeNum(spiCols[2] ? row[spiCols[2]] : null),
        safeNum(spiCols[3] ? row[spiCols[3]] : null),
        safeNum(spiCols[4] ? row[spiCols[4]] : null),
        safeNum(spiCols[5] ? row[spiCols[5]] : null),
        safeNum(spiCols[6] ? row[spiCols[6]] : null),
        safeNum(spiCols[7] ? row[spiCols[7]] : null),
        safeStr(resultCols[0] ? row[resultCols[0]] : null),
        safeStr(resultCols[1] ? row[resultCols[1]] : null),
        safeStr(resultCols[2] ? row[resultCols[2]] : null),
        safeStr(resultCols[3] ? row[resultCols[3]] : null),
        safeStr(resultCols[4] ? row[resultCols[4]] : null),
        safeStr(resultCols[5] ? row[resultCols[5]] : null),
        safeStr(resultCols[6] ? row[resultCols[6]] : null),
        safeStr(resultCols[7] ? row[resultCols[7]] : null),
        safeNum(cpiCol ? row[cpiCol] : null)
      ];

      await client.query(queryText, values);
      inserted++;
    }

    await client.query('COMMIT');
    console.log(`\n[Import] Processed: ${rows.length}, Inserted/Updated: ${inserted}, Skipped: ${skipped}`);

    await importRegistration(client);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`[Import] Transaction failed: ${err.message}`);
  } finally {
    client.release();
  }

  try {
    await seedHistory();
  } catch (err) {
    console.error(`[Seed] Seed notice: ${err.message}`);
  }

  await pool.end();
}

async function importRegistration(client) {
  let regPath = path.resolve(process.env.REGISTRATION_FILE_PATH || './data/registration_data.xlsx');
  if (!fs.existsSync(regPath)) {
    const alt = path.resolve('./registration_data.xlsx');
    if (fs.existsSync(alt)) regPath = alt;
    else {
      console.log(`[Import] No registration file found at ${regPath}, skipping.`);
      return;
    }
  }

  console.log(`[Import] Reading Registration Excel file: ${regPath}`);
  let workbook;
  try {
    workbook = XLSX.readFile(regPath);
  } catch (err) {
    console.error(`[Import] Failed to read registration file: ${err.message}`);
    return;
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  console.log(`[Import] Registration rows found: ${rows.length}`);

  try {
    await client.query('DELETE FROM student_registrations');

    const insertQuery = `
      INSERT INTO student_registrations (
        scholar_no, semester, course, candidate_name,
        father_name, category, email, contact_no, present_address
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `;

    for (const r of rows) {
      const scholar = safeStr(r['Scholar No'] || r['Scholar No.'] || r['scholar_no']);
      if (!scholar) continue;

      const sem = safeStr(r['Semester'] || r['semester']);
      const course = safeStr(r['Course'] || r['course']);
      const name = safeStr(r['Candidate Name'] || r['Name'] || r['name']);
      const father = safeStr(r['Father/Guardian Name'] || r['Father Name'] || r['father_name']);
      const cat = safeStr(r['Category'] || r['category']);
      const email = safeStr(r['Email'] || r['email']);
      const phone = safeStr(r['Contact No'] || r['Phone'] || r['phone']);
      const addr = safeStr(r['Present Address'] || r['Address'] || r['address']);

      await client.query(insertQuery, [
        scholar.toUpperCase(), sem, course, name,
        father, cat, email, phone, addr
      ]);
    }

    console.log(`[Import] Registration intelligence ingested into PostgreSQL.`);
  } catch (err) {
    console.error(`[Import] Registration import failed: ${err.message}`);
  }
}

run();
