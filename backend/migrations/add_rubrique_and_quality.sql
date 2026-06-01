-- ============================================================
-- Migration: Rubrique persistence + data-quality fields
-- Run once manually in psql / pgAdmin.
-- Safe to re-run (all statements use IF NOT EXISTS or
-- idempotent ALTER … IF NOT EXISTS).
-- ============================================================

-- 1. accounts table — persist the source-file Rubrique per account
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS source_rubrique VARCHAR(255);

-- 2. uploads table — flag whether the source file had a Rubrique column
--    (reconciliation only meaningful when this is TRUE)
ALTER TABLE uploads
  ADD COLUMN IF NOT EXISTS has_rubrique_column BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================================
-- Verify
-- ============================================================
SELECT column_name, data_type, is_nullable
FROM   information_schema.columns
WHERE  table_name IN ('accounts','uploads')
  AND  column_name IN ('source_rubrique','has_rubrique_column')
ORDER  BY table_name, column_name;
