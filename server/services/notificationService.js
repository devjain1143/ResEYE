import { getDb } from '../core/db.js';

export const notificationService = {
  async getForUser(webUserId) {
    const db = getDb();
    const res = await db.query(
      `SELECT id, kind, body, created_at, read_at
       FROM notifications
       WHERE web_user_id = $1
       ORDER BY read_at IS NULL DESC, id DESC
       LIMIT 50`,
      [webUserId]
    );
    return res.rows;
  },

  async markAsRead(id, webUserId) {
    const db = getDb();
    const res = await db.query(
      `UPDATE notifications
       SET read_at = NOW()
       WHERE id = $1 AND web_user_id = $2
       RETURNING *`,
      [id, webUserId]
    );
    return res.rows[0] || null;
  },

  async createWarning(webUserId, message, createdBy = null) {
    const db = getDb();
    const res = await db.query(
      `INSERT INTO notifications (web_user_id, kind, body, created_by)
       VALUES ($1, 'WARNING', $2, $3)
       RETURNING *`,
      [webUserId, message, createdBy]
    );
    return res.rows[0];
  },

  async createInfo(webUserId, message, createdBy = null) {
    const db = getDb();
    const res = await db.query(
      `INSERT INTO notifications (web_user_id, kind, body, created_by)
       VALUES ($1, 'INFO', $2, $3)
       RETURNING *`,
      [webUserId, message, createdBy]
    );
    return res.rows[0];
  }
};
