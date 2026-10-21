import { getDb } from '../core/db.js';
import { encryptField, decryptField, getEncryptionMode } from '../crypto/index.js';

export async function audit(req, action, target = null, meta = {}) {
  const db = getDb();
  const adminId = req.user?.id || 'system';
  const ip = req.ip || req.headers['x-forwarded-for'] || null;

  try {
    const metaStr = JSON.stringify(meta);
    const metaEnc = encryptField(metaStr, { table: 'admin_audit_log', column: 'meta', rowId: 0 }, 'audit');
    const mode = getEncryptionMode();
    const metaPlain = mode === 'on' ? '{}' : metaStr;

    await db.query(
      `INSERT INTO admin_audit_log (admin_id, action, target, meta, meta_enc, ip)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [adminId, action, target ? String(target) : null, metaPlain, metaEnc, ip]
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
    `SELECT id, admin_id, action, target, meta, meta_enc, ip,
            TO_CHAR(created_at + interval '5 hours 30 minutes', 'YYYY-MM-DD HH12:MI:SS AM') as created_at
     FROM admin_audit_log
     ORDER BY id DESC
     LIMIT $1 OFFSET $2`,
    [pageSize, offset]
  );

  const results = res.rows.map(row => {
    let meta = row.meta;
    if (row.meta_enc) {
      try {
        meta = decryptField(row.meta_enc, { table: 'admin_audit_log', column: 'meta', rowId: row.id || 0 }, 'audit', true);
      } catch {
        meta = row.meta;
      }
    }
    const cleanRow = { ...row, meta };
    delete cleanRow.meta_enc;
    return cleanRow;
  });

  return { results, total };
}
