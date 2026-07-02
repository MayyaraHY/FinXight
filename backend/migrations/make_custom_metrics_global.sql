-- ============================================================
-- Migration: make custom_metrics a global (user-scoped) library
-- Run once manually in psql / pgAdmin.
--
-- custom_metrics used to be scoped per company (company_id NOT NULL). Metrics
-- are now a global library owned by the user: a NULL company_id means "applies
-- to every company the user owns". This migration:
--   1) drops the NOT NULL constraint on company_id, and
--   2) promotes all existing rows to global (company_id = NULL).
--
-- Base.metadata.create_all() does NOT alter existing columns, so this must be
-- run against already-provisioned databases. Safe to re-run.
-- ============================================================

ALTER TABLE custom_metrics ALTER COLUMN company_id DROP NOT NULL;

UPDATE custom_metrics SET company_id = NULL WHERE company_id IS NOT NULL;

-- ============================================================
-- Verify
-- ============================================================
SELECT column_name, data_type, is_nullable
FROM   information_schema.columns
WHERE  table_name = 'custom_metrics' AND column_name = 'company_id';
