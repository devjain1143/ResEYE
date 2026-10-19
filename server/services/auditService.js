import { getDb } from '../core/db.js';

export async function audit(req, action, target = null, meta = {}) {
  const db = getDb();
  const adminId = req.user?.id || 'system';
  const ip = req.ip || req.headers['x-forwarded-for'] || null;

  try {
    await db.query(
      `INSERT INTO admin_audit_log (admin_id, action, target, meta, ip)
       VALUES ($1, $2, $3, $4, $5)`,
      [adminId, action, target ? String(target) : null, JSON.stringify(meta), ip]
    );
  } catch (err) {
    console.error('[Audit] Failed to log admin action:', err.message);
  }
}

export async function getAuditLogs({ page = 1, pageSize = 30 } = {}) {
  const db = getDb();
  const countRes = await db.query('SELECT COUNT(*) as count FROM admin_audit_log');
  const total = parseInt(countRes.rows[0]?.count || '0', 10);

  const offset = (page - 1) * pageSize;
  const res = await db.query(
    `SELECT id, admin_id, action, target, meta, ip,
            TO_CHAR(created_at + interval '5 hours 30 minutes', 'YYYY-MM-DD HH12:MI:SS AM') as created_at
     FROM admin_audit_log
     ORDER BY id DESC
     LIMIT $1 OFFSET $2`,
    [pageSize, offset]
  );

  return { results: res.rows, total };
}
