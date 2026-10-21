import { getDb } from '../core/db.js';
import { encryptField, decryptField, getEncryptionMode } from '../crypto/index.js';

export async function pushAdminTelegram(text) {
  if (!process.env.TELEGRAM_ALERT_BOT_TOKEN || !process.env.TELEGRAM_ALERT_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_ALERT_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: process.env.TELEGRAM_ALERT_CHAT_ID, text }),
    });
  } catch (err) {
    console.error('[AlertService] Failed to push Telegram message:', err.message);
  }
}

export const alertService = {
  async create(kind, webUserId, details = {}) {
    const db = getDb();
    const detailsStr = typeof details === 'string' ? details : JSON.stringify(details);
    const detailsEnc = encryptField(detailsStr, { table: 'security_alerts', column: 'details', rowId: 0 }, 'alerts');
    const mode = getEncryptionMode();
    const detailsPlain = mode === 'on' ? '{}' : detailsStr;

    const res = await db.query(
      `INSERT INTO security_alerts (kind, web_user_id, details, details_enc, status)
       VALUES ($1, $2, $3, $4, 'OPEN')
       RETURNING id, kind, web_user_id, details, details_enc, status, created_at`,
      [kind, webUserId, detailsPlain, detailsEnc]
    );

    const alert = res.rows[0];
    const alertOut = { ...alert, details };
    delete alertOut.details_enc;

    // Push optional alert notification to Telegram (redacted, no raw PII)
    const notice = `ALERT: ${kind} detected for subject ${webUserId ? 'user_' + webUserId.slice(0, 6) : 'unauthenticated'}. Review surveillance tape.`;
    pushAdminTelegram(notice).catch(() => {});

    return alertOut;
  },

  async list({ status = null, kind = null, page = 1, pageSize = 20 } = {}) {
    const db = getDb();
    const conditions = [];
    const params = [];

    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }
    if (kind) {
      params.push(kind);
      conditions.push(`kind = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countRes = await db.query(`SELECT COUNT(*) as count FROM security_alerts ${where}`, params);
    const total = parseInt(countRes.rows[0]?.count || '0', 10);

    const offset = (page - 1) * pageSize;
    params.push(pageSize);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const res = await db.query(
      `SELECT id, kind, web_user_id, details, details_enc, status, created_at, resolved_by, resolved_at
       FROM security_alerts
       ${where}
       ORDER BY created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    const results = res.rows.map(row => {
      let details = row.details;
      if (row.details_enc) {
        try {
          details = decryptField(row.details_enc, { table: 'security_alerts', column: 'details', rowId: row.id || 0 }, 'alerts', true);
        } catch {
          details = row.details;
        }
      }
      const cleanRow = { ...row, details };
      delete cleanRow.details_enc;
      return cleanRow;
    });

    return { results, total };
  },

  async getUnreadCount() {
    const db = getDb();
    const res = await db.query("SELECT COUNT(*) as count FROM security_alerts WHERE status = 'OPEN'");
    return parseInt(res.rows[0]?.count || '0', 10);
  },

  async resolve(id, status, adminId) {
    const db = getDb();
    const res = await db.query(
      `UPDATE security_alerts
       SET status = $1, resolved_by = $2, resolved_at = NOW()
       WHERE id = $3
       RETURNING id, kind, web_user_id, details, details_enc, status, created_at, resolved_by, resolved_at`,
      [status, adminId, id]
    );
    const row = res.rows[0];
    if (!row) return null;
    let details = row.details;
    if (row.details_enc) {
      try {
        details = decryptField(row.details_enc, { table: 'security_alerts', column: 'details', rowId: row.id || 0 }, 'alerts', true);
      } catch {
        details = row.details;
      }
    }
    const cleanRow = { ...row, details };
    delete cleanRow.details_enc;
    return cleanRow;
  }
};
