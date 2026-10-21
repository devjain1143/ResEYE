import dotenv from 'dotenv';
dotenv.config({ override: true });

import { getDb } from '../server/core/db.js';
import { encryptField, decryptField } from '../server/crypto/index.js';

const BATCH_SIZE = 500;
const isDryRun = process.argv.includes('--dry-run');
const shouldNullPlaintext = process.argv.includes('--null-plaintext');

async function backfillTable(db, { table, pk, textCols, purpose }) {
  console.log(`[Backfill] Inspecting ${table}...`);
  let totalProcessed = 0;
  let totalVerified = 0;
  let totalErrors = 0;

  for (const col of textCols) {
    const encCol = `${col}_enc`;
    let hasMore = true;

    while (hasMore) {
      // Find rows with plaintext but missing ciphertext
      const selectSql = `
        SELECT ${pk}, ${col}
        FROM ${table}
        WHERE ${col} IS NOT NULL AND (${encCol} IS NULL OR ${encCol} NOT LIKE 'v1.%')
        LIMIT ${BATCH_SIZE}
      `;
      const res = await db.query(selectSql);
      if (res.rows.length === 0) {
        hasMore = false;
        break;
      }

      const ids = [];
      const encs = [];

      for (const row of res.rows) {
        const id = row[pk];
        const val = row[col];
        if (!val) continue;

        const valStr = typeof val === 'object' ? JSON.stringify(val) : String(val);
        const binding = { table, column: col, rowId: id };

        try {
          const enc = encryptField(valStr, binding, purpose);

          // Verify roundtrip before persisting
          const roundtrip = decryptField(enc, binding, purpose, typeof val === 'object');
          const matches = typeof val === 'object'
            ? JSON.stringify(roundtrip) === valStr
            : String(roundtrip) === valStr;

          if (!matches) {
            throw new Error(`Roundtrip mismatch for ${table}.${col} id=${id}`);
          }
          totalVerified++;
          ids.push(id);
          encs.push(enc);
          totalProcessed++;
        } catch (err) {
          totalErrors++;
          console.error(`[Backfill ERROR] Table ${table} id=${id}:`, err.message);
        }
      }

      if (!isDryRun && ids.length > 0) {
        if (shouldNullPlaintext) {
          await db.query(
            `UPDATE ${table} AS t
             SET ${encCol} = u.enc, ${col} = NULL
             FROM (SELECT unnest($1::text[]) as id, unnest($2::text[]) as enc) AS u
             WHERE t.${pk}::text = u.id::text`,
            [ids.map(String), encs]
          );
        } else {
          await db.query(
            `UPDATE ${table} AS t
             SET ${encCol} = u.enc
             FROM (SELECT unnest($1::text[]) as id, unnest($2::text[]) as enc) AS u
             WHERE t.${pk}::text = u.id::text`,
            [ids.map(String), encs]
          );
        }
      }

      if (isDryRun) {
        hasMore = false;
      }
    }
  }

  console.log(`[Backfill] Completed ${table}: ${totalProcessed} rows encrypted, ${totalVerified} verified, ${totalErrors} errors. (Dry run: ${isDryRun})`);
}

async function run() {
  console.log(`======================================================`);
  console.log(`>>> RESEYE AT-REST FIELD ENCRYPTION BACKFILL <<<`);
  console.log(`Mode: ${isDryRun ? 'DRY-RUN (no database writes)' : 'LIVE EXECUTION'}`);
  console.log(`Null plaintext after encryption: ${shouldNullPlaintext}`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log(`======================================================`);

  const db = getDb();

  await backfillTable(db, {
    table: 'search_history',
    pk: 'id',
    textCols: ['student_name'],
    purpose: 'history'
  });

  await backfillTable(db, {
    table: 'ai_query_history',
    pk: 'id',
    textCols: ['query_text'],
    purpose: 'history'
  });

  await backfillTable(db, {
    table: 'feedback_corrections',
    pk: 'id',
    textCols: ['query_text', 'wrong_output', 'correct_output'],
    purpose: 'history'
  });

  await backfillTable(db, {
    table: 'special_scholars',
    pk: 'scholar_no',
    textCols: ['note'],
    purpose: 'alerts'
  });

  await backfillTable(db, {
    table: 'security_alerts',
    pk: 'id',
    textCols: ['details'],
    purpose: 'alerts'
  });

  await backfillTable(db, {
    table: 'notifications',
    pk: 'id',
    textCols: ['body'],
    purpose: 'notifications'
  });

  await backfillTable(db, {
    table: 'admin_audit_log',
    pk: 'id',
    textCols: ['meta'],
    purpose: 'audit'
  });

  console.log('\n[Backfill] Finished all tables successfully.');
  process.exit(0);
}

run().catch(err => {
  console.error('[Backfill Fatal Failure]:', err);
  process.exit(1);
});
