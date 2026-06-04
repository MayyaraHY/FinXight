-- ============================================================
-- Migration: validation_reports table (PCGT account validation)
-- Run once manually in psql / pgAdmin.
--
-- New table only — Base.metadata.create_all() also creates it automatically
-- on app startup. This file exists to match the project's migration precedent
-- and to provision databases that are managed out-of-band.
-- Safe to re-run (CREATE TABLE IF NOT EXISTS).
-- ============================================================

CREATE TABLE IF NOT EXISTS validation_reports (
    id          SERIAL PRIMARY KEY,
    upload_id   INTEGER NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
    status      VARCHAR(20) NOT NULL DEFAULT 'pending',
    data        JSON,
    created_at  TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_validation_reports_upload_id
    ON validation_reports (upload_id);

-- ============================================================
-- Verify
-- ============================================================
SELECT column_name, data_type, is_nullable
FROM   information_schema.columns
WHERE  table_name = 'validation_reports'
ORDER  BY ordinal_position;
