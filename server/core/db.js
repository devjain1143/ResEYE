import pg from 'pg';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config({ override: true });

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let pool = null;

export function getDb() {
  if (!pool) {
    const connectionString = process.env.RESBOT_DATABASE_URL || process.env.DATABASE_URL;
    pool = new Pool({
      connectionString,
      ssl: connectionString && connectionString.includes('sslmode=disable') ? false : {
        rejectUnauthorized: false
      }
    });
  }
  return pool;
}

export async function initSchema() {
  const db = getDb();

  // Create core tables
  await db.query(`
    CREATE TABLE IF NOT EXISTS students (
      id                SERIAL PRIMARY KEY,
      degree            TEXT,
      specialization    TEXT,
      scholar_no        VARCHAR(50) UNIQUE NOT NULL,
      name              TEXT NOT NULL,
      spi_sem_1         REAL,
      spi_sem_2         REAL,
      spi_sem_3         REAL,
      spi_sem_4         REAL,
      spi_sem_5         REAL,
      spi_sem_6         REAL,
      spi_sem_7         REAL,
      spi_sem_8         REAL,
      result_sem_1      TEXT,
      result_sem_2      TEXT,
      result_sem_3      TEXT,
      result_sem_4      TEXT,
      result_sem_5      TEXT,
      result_sem_6      TEXT,
      result_sem_7      TEXT,
      result_sem_8      TEXT,
      cpi_final         REAL
    );

    CREATE INDEX IF NOT EXISTS idx_scholar ON students(scholar_no);
    CREATE INDEX IF NOT EXISTS idx_name    ON students(name);

    CREATE TABLE IF NOT EXISTS search_history (
      id            SERIAL PRIMARY KEY,
      user_id       BIGINT,
      web_user_id   TEXT,
      username      TEXT,
      first_name    TEXT,
      scholar_no    VARCHAR(50) NOT NULL,
      student_name  TEXT NOT NULL,
      timestamp     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE search_history   ADD COLUMN IF NOT EXISTS web_user_id TEXT;
    ALTER TABLE search_history   ALTER COLUMN user_id DROP NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_history_user ON search_history(user_id);
    CREATE INDEX IF NOT EXISTS idx_search_history_web_user ON search_history(web_user_id);

    CREATE TABLE IF NOT EXISTS whitelist (
      user_id       BIGINT PRIMARY KEY,
      added_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS special_scholars (
      scholar_no            VARCHAR(50) PRIMARY KEY,
      added_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      added_by_web_user_id  TEXT,
      note                  TEXT
    );

    ALTER TABLE special_scholars ADD COLUMN IF NOT EXISTS added_by_web_user_id TEXT;
    ALTER TABLE special_scholars ADD COLUMN IF NOT EXISTS note TEXT;

    CREATE TABLE IF NOT EXISTS student_registrations (
      id              SERIAL PRIMARY KEY,
      scholar_no      VARCHAR(50) NOT NULL,
      semester        TEXT,
      course          TEXT,
      candidate_name  TEXT,
      father_name     TEXT,
      category        TEXT,
      email           TEXT,
      contact_no      TEXT,
      present_address TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_reg_scholar ON student_registrations(scholar_no);

    CREATE TABLE IF NOT EXISTS ai_query_history (
      id                SERIAL PRIMARY KEY,
      user_id           BIGINT,
      web_user_id       TEXT,
      username          TEXT,
      first_name        TEXT,
      query_text        TEXT NOT NULL,
      intent            TEXT,
      batch             TEXT,
      semester          INTEGER,
      is_answered       BOOLEAN NOT NULL,
      rejection_reason  TEXT,
      is_cache_hit      BOOLEAN DEFAULT FALSE,
      rating            VARCHAR(10) DEFAULT NULL,
      timestamp         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE ai_query_history ADD COLUMN IF NOT EXISTS web_user_id TEXT;
    ALTER TABLE ai_query_history ALTER COLUMN user_id DROP NOT NULL;
    ALTER TABLE ai_query_history ADD COLUMN IF NOT EXISTS rating VARCHAR(10) DEFAULT NULL;

    CREATE INDEX IF NOT EXISTS idx_ai_history_user ON ai_query_history(user_id);
    CREATE INDEX IF NOT EXISTS idx_ai_history_web_user ON ai_query_history(web_user_id);
    CREATE INDEX IF NOT EXISTS idx_ai_history_time ON ai_query_history(timestamp);

    CREATE TABLE IF NOT EXISTS provider_usage (
      id SERIAL PRIMARY KEY,
      provider_name TEXT NOT NULL,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_provider_usage_time ON provider_usage(timestamp);

    CREATE TABLE IF NOT EXISTS user_ai_usage (
      id SERIAL PRIMARY KEY,
      user_id BIGINT,
      web_user_id TEXT,
      is_aggregate BOOLEAN DEFAULT FALSE,
      batch TEXT,
      semester INTEGER,
      is_cache_hit BOOLEAN DEFAULT FALSE,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE user_ai_usage ADD COLUMN IF NOT EXISTS web_user_id TEXT;
    ALTER TABLE user_ai_usage ALTER COLUMN user_id DROP NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_user_ai_usage_time ON user_ai_usage(timestamp);
    CREATE INDEX IF NOT EXISTS idx_user_ai_usage_user ON user_ai_usage(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_ai_usage_web_user ON user_ai_usage(web_user_id);

    CREATE TABLE IF NOT EXISTS user_favorites (
      id              SERIAL PRIMARY KEY,
      web_user_id     TEXT NOT NULL,
      scholar_no      VARCHAR(50) NOT NULL,
      created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(web_user_id, scholar_no)
    );
    CREATE INDEX IF NOT EXISTS idx_user_fav_user ON user_favorites(web_user_id);
    CREATE INDEX IF NOT EXISTS idx_user_fav_scholar ON user_favorites(scholar_no);
  `);

  // Run web schema extension migration
  const migrationPath = path.resolve(__dirname, '../../migrations/001_web_schema.sql');
  if (fs.existsSync(migrationPath)) {
    const migrationSql = fs.readFileSync(migrationPath, 'utf-8');
    await db.query(migrationSql).catch(err => {
      console.warn('[DB] Web schema migration notice:', err.message);
    });
  }

  // Run encryption schema migration (002_encryption.sql)
  const encryptionMigrationPath = path.resolve(__dirname, '../../migrations/002_encryption.sql');
  if (fs.existsSync(encryptionMigrationPath)) {
    const encSql = fs.readFileSync(encryptionMigrationPath, 'utf-8');
    await db.query(encSql).catch(err => {
      console.warn('[DB] Encryption schema migration notice:', err.message);
    });
  }

  // Vector extension setup if available
  try {
    await db.query('CREATE EXTENSION IF NOT EXISTS vector');
    await db.query(`
      CREATE TABLE IF NOT EXISTS feedback_corrections (
        id              SERIAL PRIMARY KEY,
        web_user_id     TEXT,
        query_text      TEXT NOT NULL,
        wrong_output    TEXT,
        correct_output  TEXT NOT NULL,
        embedding       vector(768),
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_feedback_corrections_time ON feedback_corrections(created_at);
      CREATE INDEX IF NOT EXISTS idx_feedback_corrections_embedding ON feedback_corrections USING hnsw (embedding vector_cosine_ops);
    `);
  } catch (err) {
    console.warn('[DB] pgvector setup notice:', err.message);
    await db.query(`
      CREATE TABLE IF NOT EXISTS feedback_corrections (
        id              SERIAL PRIMARY KEY,
        web_user_id     TEXT,
        query_text      TEXT NOT NULL,
        wrong_output    TEXT,
        correct_output  TEXT NOT NULL,
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_feedback_corrections_time ON feedback_corrections(created_at);
    `).catch(() => {});
  }
}
