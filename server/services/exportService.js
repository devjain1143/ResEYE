import crypto from 'crypto';
import { getDb } from '../core/db.js';
import prisma from '../kit/lib/prisma.js';
import { csvCell } from '../utils/csv.js';

function toCsv(rows) {
  if (!rows || rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const headerRow = headers.map(csvCell).join(',');
  const dataRows = rows.map(row => headers.map(h => csvCell(row[h])).join(','));
  return [headerRow, ...dataRows].join('\r\n');
}

export const exportService = {
  async exportData(what, format = 'json', passphrase = null) {
    const db = getDb();
    let rows = [];

    switch (what) {
      case 'users': {
        const users = await prisma.user.findMany({
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
            status: true,
            blockedReason: true,
            lastLoginAt: true,
            createdAt: true
          },
          orderBy: { createdAt: 'desc' }
        });
        rows = users.map(u => ({
          ...u,
          lastLoginAt: u.lastLoginAt?.toISOString() || null,
          createdAt: u.createdAt.toISOString()
        }));
        break;
      }

      case 'search-history': {
        const res = await db.query(
          `SELECT id, web_user_id, username, first_name, scholar_no, student_name,
                  TO_CHAR(timestamp + interval '5 hours 30 minutes', 'YYYY-MM-DD HH12:MI:SS AM') as timestamp
           FROM search_history ORDER BY id DESC LIMIT 5000`
        );
        rows = res.rows;
        break;
      }

      case 'ai-history': {
        const res = await db.query(
          `SELECT id, web_user_id, username, first_name, query_text, intent, batch, semester,
                  is_answered, rejection_reason, is_cache_hit, rating,
                  TO_CHAR(timestamp + interval '5 hours 30 minutes', 'YYYY-MM-DD HH12:MI:SS AM') as timestamp
           FROM ai_query_history ORDER BY id DESC LIMIT 5000`
        );
        rows = res.rows;
        break;
      }

      case 'special': {
        const res = await db.query(
          `SELECT scholar_no, note, added_by_web_user_id,
                  TO_CHAR(added_at + interval '5 hours 30 minutes', 'YYYY-MM-DD HH12:MI:SS AM') as added_at
           FROM special_scholars ORDER BY added_at DESC`
        );
        rows = res.rows;
        break;
      }

      case 'feedback': {
        const res = await db.query(
          `SELECT id, web_user_id, query_text, wrong_output, correct_output,
                  TO_CHAR(created_at + interval '5 hours 30 minutes', 'YYYY-MM-DD HH12:MI:SS AM') as created_at
           FROM feedback_corrections ORDER BY id DESC`
        );
        rows = res.rows;
        break;
      }

      default: {
        const err = new Error(`Unknown export target: ${what}`);
        err.status = 400;
        throw err;
      }
    }

    const rawOutput = format === 'csv' ? toCsv(rows) : JSON.stringify(rows, null, 2);
    const contentType = format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8';
    const filename = `${what}-${Date.now()}.${format}`;

    if (passphrase && typeof passphrase === 'string' && passphrase.trim().length > 0) {
      const salt = crypto.randomBytes(16);
      const iv = crypto.randomBytes(12);
      const derivedKey = crypto.scryptSync(passphrase.trim(), salt, 32);
      const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);
      const ciphertext = Buffer.concat([cipher.update(rawOutput, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();

      const magic = Buffer.from('RESEYE_EXPORT_V1', 'utf8');
      const encryptedPayload = Buffer.concat([magic, salt, iv, tag, ciphertext]);

      return {
        contentType: 'application/octet-stream',
        filename: `${what}-${Date.now()}.enc`,
        data: encryptedPayload,
        rowCount: rows.length,
        encrypted: true
      };
    }

    return {
      contentType,
      filename,
      data: rawOutput,
      rowCount: rows.length,
      encrypted: false
    };
  }
};
