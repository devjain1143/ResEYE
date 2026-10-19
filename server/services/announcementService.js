import { getDb } from '../core/db.js';

export const announcementService = {
  async getActive() {
    const db = getDb();
    const res = await db.query(
      `SELECT id, title, body, level, created_at, expires_at
       FROM announcements
       WHERE active = true AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY id DESC`
    );
    return res.rows;
  },

  async listAll() {
    const db = getDb();
    const res = await db.query(
      `SELECT id, title, body, level, created_by, active, expires_at,
              TO_CHAR(created_at + interval '5 hours 30 minutes', 'YYYY-MM-DD HH12:MI:SS AM') as created_at
       FROM announcements
       ORDER BY id DESC`
    );
    return res.rows;
  },

  async create({ title, body, level = 'info', createdBy, expiresAt = null }) {
    const db = getDb();
    const res = await db.query(
      `INSERT INTO announcements (title, body, level, created_by, expires_at, active)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING *`,
      [title, body, level, createdBy, expiresAt]
    );
    return res.rows[0];
  },

  async update(id, { title, body, level, active, expiresAt }) {
    const db = getDb();
    const fields = [];
    const params = [id];

    if (title !== undefined) {
      params.push(title);
      fields.push(`title = $${params.length}`);
    }
    if (body !== undefined) {
      params.push(body);
      fields.push(`body = $${params.length}`);
    }
    if (level !== undefined) {
      params.push(level);
      fields.push(`level = $${params.length}`);
    }
    if (active !== undefined) {
      params.push(active);
      fields.push(`active = $${params.length}`);
    }
    if (expiresAt !== undefined) {
      params.push(expiresAt);
      fields.push(`expires_at = $${params.length}`);
    }

    if (fields.length === 0) return null;

    const res = await db.query(
      `UPDATE announcements SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );
    return res.rows[0] || null;
  }
};
