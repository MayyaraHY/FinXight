-- Adds the `is_first_login` flag used to drive the post-login onboarding flow.
--
-- New users start with is_first_login = true and are routed through the
-- onboarding wizard (create their first company). The flag is flipped to
-- false once onboarding completes (PATCH /users/me/complete-onboarding).
--
-- The column default is `true` so freshly registered users onboard, but any
-- rows that already exist have been using the system before onboarding
-- existed — they must NOT be re-onboarded, so we backfill them to false.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_first_login BOOLEAN NOT NULL DEFAULT true;

-- Existing accounts predate onboarding; treat them as already onboarded.
UPDATE users SET is_first_login = false;
