import dotenv from 'dotenv';
dotenv.config({ override: true });

import fs from 'fs';
import path from 'path';
import { getDb } from '../server/core/db.js';
import { getEncryptionMode } from '../server/crypto/index.js';

async function checkTable(db, table, col, encCol) {
  // Check unencrypted / unpopulated ciphertext rows where plaintext exists
  const unencryptedRes = await db.query(`
    SELECT COUNT(*) as count
    FROM ${table}
    WHERE ${col} IS NOT NULL AND ${col}::text != '' AND (${encCol} IS NULL OR ${encCol} NOT LIKE 'v1.%')
  `);
  const unencryptedCount = parseInt(unencryptedRes.rows[0]?.count || '0', 10);

  // Check plaintext presence
  const plaintextRes = await db.query(`
    SELECT COUNT(*) as count
    FROM ${table}
    WHERE ${col} IS NOT NULL AND ${col}::text != '' AND ${col}::text NOT LIKE 'v1.%'
  `);
  const plaintextCount = parseInt(plaintextRes.rows[0]?.count || '0', 10);

  return { unencryptedCount, plaintextCount };
}

async function run() {
  console.log(`======================================================`);
  console.log(`>>> RESEYE AT-REST ZERO-PLAINTEXT AUDIT VERIFIER <<<`);
  console.log(`Current FIELD_ENCRYPTION Mode: ${getEncryptionMode()}`);
  console.log(`======================================================\n`);

  const db = getDb();
  let failures = 0;

  const targets = [
    { table: 'search_history', col: 'student_name', encCol: 'student_name_enc' },
    { table: 'ai_query_history', col: 'query_text', encCol: 'query_text_enc' },
    { table: 'feedback_corrections', col: 'query_text', encCol: 'query_text_enc' },
    { table: 'feedback_corrections', col: 'wrong_output', encCol: 'wrong_output_enc' },
    { table: 'feedback_corrections', col: 'correct_output', encCol: 'correct_output_enc' },
    { table: 'special_scholars', col: 'note', encCol: 'note_enc' },
    { table: 'security_alerts', col: 'details', encCol: 'details_enc' },
    { table: 'notifications', col: 'body', encCol: 'body_enc' },
    { table: 'admin_audit_log', col: 'meta', encCol: 'meta_enc' }
  ];

  for (const t of targets) {
    const { unencryptedCount, plaintextCount } = await checkTable(db, t.table, t.col, t.encCol);

    if (unencryptedCount > 0) {
      console.log(`[FAIL] ${t.table}.${t.encCol}: Found ${unencryptedCount} rows missing valid v1.* ciphertext envelopes.`);
      failures++;
    } else {
      console.log(`[PASS] ${t.table}.${t.encCol}: 100% of rows have valid v1.* encrypted envelopes.`);
    }

    if (getEncryptionMode() === 'on' && plaintextCount > 0) {
      console.log(`[WARN] ${t.table}.${t.col}: ${plaintextCount} plaintext values remaining while FIELD_ENCRYPTION=on.`);
    }
  }

  // Verify registration data file at rest
  console.log('\n--- Auditing Registration Storage at Rest ---');
  const encFilePath = path.resolve('./data/registration_data.xlsx.enc');
  const plainFilePath = path.resolve('./data/registration_data.xlsx');

  if (fs.existsSync(plainFilePath)) {
    console.log(`[FAIL] Plaintext file detected at rest: ${plainFilePath}`);
    failures++;
  } else {
    console.log(`[PASS] Zero plaintext registration files on disk.`);
  }

  if (fs.existsSync(encFilePath)) {
    const head = fs.readFileSync(encFilePath, { encoding: 'utf8', flag: 'r' }).slice(0, 10);
    if (head.startsWith('v1.')) {
      console.log(`[PASS] Registration file at rest is protected with AES-256-GCM envelope (${head}...).`);
    } else {
      console.log(`[FAIL] Registration file at rest does not start with valid v1.* envelope.`);
      failures++;
    }
  } else {
    console.log(`[WARN] Encrypted registration file not found at ${encFilePath}`);
  }

  console.log('\n======================================================');
  if (failures === 0) {
    console.log('>>> VERIFICATION PASSED: All protected columns and files are encrypted at rest. <<<');
  } else {
    console.log(`>>> VERIFICATION FAILED: ${failures} residual plaintext issues detected. <<<`);
  }
  console.log('======================================================');

  process.exit(failures === 0 ? 0 : 1);
}

run().catch(err => {
  console.error('[Verification Fatal]:', err);
  process.exit(1);
});
