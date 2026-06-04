-- Reconcile the users table with the User entity.
--
-- The entity was refactored from a single `full_name` column to
-- `first_name` / `last_name` plus profile fields (phone, address, position,
-- picture_url), but no migration was written for it. On a fresh database the
-- V2 schema is missing these columns and Hibernate's `ddl-auto=validate`
-- fails at startup ("missing column [address] in table [users]").
--
-- Idempotent (IF [NOT] EXISTS) so it is safe to apply to existing databases
-- where these columns were previously added outside Flyway.

ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name  VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name   VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone       VARCHAR(30);
ALTER TABLE users ADD COLUMN IF NOT EXISTS address     TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS position    VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS picture_url VARCHAR(500);

-- Backfill first_name (NOT NULL in the entity) for any existing rows that
-- only had the old full_name, then enforce the constraint.
UPDATE users SET first_name = full_name
    WHERE first_name IS NULL AND full_name IS NOT NULL;
UPDATE users SET first_name = 'Unknown'
    WHERE first_name IS NULL;
ALTER TABLE users ALTER COLUMN first_name SET NOT NULL;

-- full_name is no longer mapped by the entity (it is computed from
-- first_name/last_name). Its NOT NULL constraint would break inserts, so
-- drop the column entirely.
ALTER TABLE users DROP COLUMN IF EXISTS full_name;
