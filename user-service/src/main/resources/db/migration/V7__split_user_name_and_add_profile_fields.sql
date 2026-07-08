-- Evolve `users` to match the User entity, which replaced the single
-- `full_name` column with `first_name` + `last_name` and added profile
-- fields (phone, address, position, picture_url).
--
-- The V1–V6 baseline still creates `full_name NOT NULL`; without this
-- migration a fresh database fails Hibernate schema validation
-- ("missing column [address] in table [users]") and, even past that,
-- inserts would violate full_name NOT NULL since the entity no longer
-- maps it. This migration is written to be safe whether or not rows exist.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS first_name  VARCHAR(100),
    ADD COLUMN IF NOT EXISTS last_name   VARCHAR(100),
    ADD COLUMN IF NOT EXISTS phone       VARCHAR(30),
    ADD COLUMN IF NOT EXISTS address     TEXT,
    ADD COLUMN IF NOT EXISTS position    VARCHAR(100),
    ADD COLUMN IF NOT EXISTS picture_url VARCHAR(500);

-- Backfill first/last name from any existing full_name values.
UPDATE users
   SET first_name = COALESCE(NULLIF(split_part(full_name, ' ', 1), ''), full_name),
       last_name  = NULLIF(trim(substr(full_name, length(split_part(full_name, ' ', 1)) + 1)), '')
 WHERE full_name IS NOT NULL
   AND first_name IS NULL;

-- Entity maps first_name as NOT NULL.
ALTER TABLE users ALTER COLUMN first_name SET NOT NULL;

-- full_name is no longer mapped by the entity; drop it so inserts don't
-- trip its NOT NULL constraint.
ALTER TABLE users DROP COLUMN IF EXISTS full_name;
