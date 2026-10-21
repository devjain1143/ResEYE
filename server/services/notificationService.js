import { getDb } from '../core/db.js';
import { encryptField, decryptField, getEncryptionMode } from '../crypto/index.js';

export const notificationService = {
  async getForUser(webUserId) {
    const db = getDb();
    const res = await db.query(
      `SELECT id, kind, body, body_enc, created_at, read_at
       FROM notifications
       WHERE web_user_id = $1
       ORDER BY read_at IS NULL DESC, id DESC
       LIMIT 50`,
      [webUserId]
    );

    return res.rows.map(row => {
      let body = row.body;
      if (row.body_enc) {
        try {
          body = decryptField(row.body_enc, { table: 'notifications', column: 'body', rowId: row.id || 0 }, 'notifications');
        } catch {
          body = row.body;
        }
      }
      const cleanRow = { ...row, body };
      delete cleanRow.body_enc;
      return cleanRow;
    });
  },

  async markAsRead(id, webUserId) {
    const db = getDb();
    const res = await db.query(
      `UPDATE notifications
       SET read_at = NOW()
       WHERE id = $1 AND web_user_id = $2
       RETURNING id, kind, body, body_enc, created_at, read_at`,
      [id, webUserId]
    );
    const row = res.rows[0];
    if (!row) return null;

    let body = row.body;
    if (row.body_enc) {
      try {
        body = decryptField(row.body_enc, { table: 'notifications', column: 'body', rowId: row.id || 0 }, 'notifications');
      } catch {
        body = row.body;
      }
    }
    const cleanRow = { ...row, body };
    delete cleanRow.body_enc;
    return cleanRow;
  },

  async createWarning(webUserId, message, createdBy = null) {
    const db = getDb();
    const mode = getEncryptionMode();
    const bodyEnc = encryptField(message, { table: 'notifications', column: 'body', rowId: 0 }, 'notifications');
    const bodyPlain = mode === 'on' ? 'SURVEILLANCE NOTICE' : message;

    const res = await db.query(
      `INSERT INTO notifications (web_user_id, kind, body, body_enc, created_by)
       VALUES ($1, 'WARNING', $2, $3, $4)
       RETURNING id, kind, body, body_enc, created_at, read_at`,
      [webUserId, bodyPlain, bodyEnc, createdBy]
    );
    const row = res.rows[0];
    const cleanRow = { ...row, body: message };
    delete cleanRow.body_enc;
    return cleanRow;
  },

  async createInfo(webUserId, message, createdBy = null) {
    const db = getDb();
    const mode = getEncryptionMode();
    const bodyEnc = encryptField(message, { table: 'notifications', column: 'body', rowId: 0 }, 'notifications');
    const bodyPlain = mode === 'on' ? 'SURVEILLANCE INFO' : message;

    const res = await db.query(
      `INSERT INTO notifications (web_user_id, kind, body, body_enc, created_by)
       VALUES ($1, 'INFO', $2, $3, $4)
       RETURNING id, kind, body, body_enc, created_at, read_at`,
      [webUserId, bodyPlain, bodyEnc, createdBy]
    );
    const row = res.rows[0];
    const cleanRow = { ...row, body: message };
    delete cleanRow.body_enc;
    return cleanRow;
  }
};
