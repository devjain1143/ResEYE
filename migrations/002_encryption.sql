-- 002_encryption.sql: Add encrypted ciphertext envelope columns for data protection at rest

-- Search history text columns
ALTER TABLE search_history ADD COLUMN IF NOT EXISTS student_name_enc TEXT;

-- AI query history text columns
ALTER TABLE ai_query_history ADD COLUMN IF NOT EXISTS query_text_enc TEXT;

-- Feedback corrections text and intent columns
ALTER TABLE feedback_corrections ADD COLUMN IF NOT EXISTS query_text_enc TEXT;
ALTER TABLE feedback_corrections ADD COLUMN IF NOT EXISTS wrong_output_enc TEXT;
ALTER TABLE feedback_corrections ADD COLUMN IF NOT EXISTS correct_output_enc TEXT;

-- Special scholars notes
ALTER TABLE special_scholars ADD COLUMN IF NOT EXISTS note_enc TEXT;

-- Security alerts incident details
ALTER TABLE security_alerts ADD COLUMN IF NOT EXISTS details_enc TEXT;

-- Notification dispatch messages
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS body_enc TEXT;

-- Admin audit log metadata
ALTER TABLE admin_audit_log ADD COLUMN IF NOT EXISTS meta_enc TEXT;

-- Student registrations table (if present in public schema)
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'student_registrations') THEN
    ALTER TABLE student_registrations ADD COLUMN IF NOT EXISTS candidate_name_enc TEXT;
    ALTER TABLE student_registrations ADD COLUMN IF NOT EXISTS father_name_enc TEXT;
    ALTER TABLE student_registrations ADD COLUMN IF NOT EXISTS category_enc TEXT;
    ALTER TABLE student_registrations ADD COLUMN IF NOT EXISTS email_enc TEXT;
    ALTER TABLE student_registrations ADD COLUMN IF NOT EXISTS contact_no_enc TEXT;
    ALTER TABLE student_registrations ADD COLUMN IF NOT EXISTS present_address_enc TEXT;
  END IF;
END $$;
