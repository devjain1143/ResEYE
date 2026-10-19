import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb } from '../server/core/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HIS_TXT_PATH = path.resolve(__dirname, '../data/his.txt');

function parseHisTxt() {
  let targetPath = HIS_TXT_PATH;
  if (!fs.existsSync(targetPath)) {
    targetPath = path.resolve(__dirname, '../../resbot/his.txt');
    if (!fs.existsSync(targetPath)) return [];
  }

  const text = fs.readFileSync(targetPath, 'utf-8');
  const records = [];

  const regex = /• (?:([^(]+?)\s*(?:\(@?([^\s)]+)\)|\(ID:\s*(\d+)\))?)\s*searched for\s*(.+?)\s*\((.+?)\)\s+at\s+(.+?)$/gm;

  let match;
  while ((match = regex.exec(text)) !== null) {
    const rawName = (match[1] || '').trim();
    const usernameOrId = (match[2] || '').trim();
    const rawId = (match[3] || '').trim();
    const studentName = (match[4] || '').trim();
    const scholarNo = (match[5] || '').trim();
    const timeStr = (match[6] || '').trim();

    let userId = 0;
    let username = null;

    if (rawId && !isNaN(parseInt(rawId, 10))) {
      userId = parseInt(rawId, 10);
    } else if (usernameOrId && !isNaN(parseInt(usernameOrId, 10))) {
      userId = parseInt(usernameOrId, 10);
    } else if (usernameOrId) {
      username = usernameOrId;
    }

    records.push({
      first_name: rawName || 'User',
      username: username,
      user_id: userId,
      scholar_no: scholarNo,
      student_name: studentName,
      timestamp: timeStr
    });
  }

  return records;
}

function convertToUtc(timeStr) {
  try {
    const d = new Date(timeStr);
    if (!isNaN(d.getTime())) {
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
    }
  } catch {}
  return timeStr;
}

export async function seedHistory() {
  const pool = getDb();
  const records = parseHisTxt();

  if (records.length === 0) {
    console.log('[Seed] No history records found in his.txt.');
    return;
  }

  const client = await pool.connect();
  let seeded = 0;

  try {
    await client.query('BEGIN');
    const queryText = `
      INSERT INTO search_history (user_id, username, first_name, scholar_no, student_name, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (user_id, scholar_no, timestamp) DO NOTHING
    `;

    for (const item of records) {
      const utcTime = convertToUtc(item.timestamp);
      const res = await client.query(queryText, [
        item.user_id || 0,
        item.username || null,
        item.first_name || null,
        item.scholar_no,
        item.student_name,
        utcTime
      ]);
      if (res.rowCount > 0) {
        seeded++;
      }
    }
    await client.query('COMMIT');
    console.log(`[Seed] Seeded ${seeded} new historical search records into database.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`[Seed] Seed history failed: ${err.message}`);
  } finally {
    client.release();
  }
}
