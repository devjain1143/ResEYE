import { getDb } from '../core/db.js';

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
    const res = await db.query(
      `INSERT INTO security_alerts (kind, web_user_id, details, status)
       VALUES ($1, $2, $3, 'OPEN')
       RETURNING id, kind, web_user_id, details, status, created_at`,
      [kind, webUserId, JSON.stringify(details)]
    );

    const alert = res.rows[0];

    // Push optional alert notification to Telegram
    const notice = `ALERT: ${kind} detected for user ${webUserId || 'unknown'}. Review security monitor.`;
    pushAdminTelegram(notice).catch(() => {});

    return alert;
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
      `SELECT id, kind, web_user_id, details, status, created_at, resolved_by, resolved_at
       FROM security_alerts
       ${where}
       ORDER BY created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    return { results: res.rows, total };
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
       RETURNING *`,
      [status, adminId, id]
    );
    return res.rows[0] || null;
  }
};
