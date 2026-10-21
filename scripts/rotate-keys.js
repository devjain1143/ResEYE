import dotenv from 'dotenv';
dotenv.config({ override: true });

import { getDb } from '../server/core/db.js';
import {
  encryptField,
  decryptField,
  getCurrentKid,
  setCurrentKid,
  getKnownKids
} from '../server/crypto/index.js';

const BATCH_SIZE = 500;
const targetKid = process.argv[2] || process.env.DATA_TARGET_KID || 'v2';

async function rotateTable(db, { table, pk, textCols, purpose }) {
  console.log(`[Key Rotation] Rotating ${table} to key [${targetKid}]...`);
  let totalReencrypted = 0;

  for (const col of textCols) {
    const encCol = `${col}_enc`;
    let hasMore = true;

    while (hasMore) {
      // Find rows encrypted under an older kid
      const selectSql = `
        SELECT ${pk}, ${encCol}
        FROM ${table}
        WHERE ${encCol} IS NOT NULL
          AND ${encCol} LIKE 'v1.%'
          AND ${encCol} NOT LIKE 'v1.' || $1 || '.%'
        LIMIT ${BATCH_SIZE}
      `;
      const res = await db.query(selectSql, [targetKid]);
      if (res.rows.length === 0) {
        hasMore = false;
        break;
      }

      for (const row of res.rows) {
        const id = row[pk];
        const oldEnvelope = row[encCol];
        const binding = { table, column: col, rowId: id };

        try {
          // Decrypt with whichever kid is recorded in oldEnvelope
          const plaintext = decryptField(oldEnvelope, binding, purpose);

          // Re-encrypt under targetKid
          setCurrentKid(targetKid);
          const newEnvelope = encryptField(plaintext, binding, purpose);

          await db.query(
            `UPDATE ${table} SET ${encCol} = $1 WHERE ${pk}::text = $2::text`,
            [newEnvelope, String(id)]
          );
          totalReencrypted++;
        } catch (err) {
          console.error(`[Key Rotation ERROR] ${table}.${col} id=${id}:`, err.message);
        }
      }
    }
  }

  console.log(`[Key Rotation] Completed ${table}: ${totalReencrypted} records re-encrypted to [${targetKid}].`);
}

async function run() {
  console.log(`======================================================`);
  console.log(`>>> RESEYE CRYPTOGRAPHIC KEY ROTATION UTILITY <<<`);
  console.log(`Target Key ID: ${targetKid}`);
  console.log(`Known Key IDs: ${getKnownKids().join(', ')}`);
  console.log(`======================================================`);

  if (!getKnownKids().includes(targetKid)) {
    console.error(`FATAL: Target key ID [${targetKid}] is not registered in the key store.`);
    console.error(`Ensure DATA_KEK_${targetKid.toUpperCase()} is set in environment or secrets manager.`);
    process.exit(1);
  }

  const db = getDb();

  await rotateTable(db, {
    table: 'search_history',
    pk: 'id',
    textCols: ['student_name'],
    purpose: 'history'
  });

  await rotateTable(db, {
    table: 'ai_query_history',
    pk: 'id',
    textCols: ['query_text'],
    purpose: 'history'
  });

  await rotateTable(db, {
    table: 'feedback_corrections',
    pk: 'id',
    textCols: ['query_text', 'wrong_output', 'correct_output'],
    purpose: 'history'
  });

  await rotateTable(db, {
    table: 'special_scholars',
    pk: 'scholar_no',
    textCols: ['note'],
    purpose: 'alerts'
  });

  await rotateTable(db, {
    table: 'security_alerts',
    pk: 'id',
    textCols: ['details'],
    purpose: 'alerts'
  });

  await rotateTable(db, {
    table: 'notifications',
    pk: 'id',
    textCols: ['body'],
    purpose: 'notifications'
  });

  await rotateTable(db, {
    table: 'admin_audit_log',
    pk: 'id',
    textCols: ['meta'],
    purpose: 'audit'
  });

  console.log(`\n[Key Rotation] All tables successfully transitioned to [${targetKid}].`);
  process.exit(0);
}

run().catch(err => {
  console.error('[Key Rotation Fatal]:', err);
  process.exit(1);
});
