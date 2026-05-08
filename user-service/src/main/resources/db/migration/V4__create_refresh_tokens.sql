CREATE TABLE refresh_tokens (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family_id       UUID        NOT NULL,
    token_hash      VARCHAR(64) NOT NULL UNIQUE,
    issued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL,
    absolute_expiry TIMESTAMPTZ NOT NULL,
    revoked_at      TIMESTAMPTZ,
    replaced_by_id  UUID                 REFERENCES refresh_tokens(id) ON DELETE SET NULL,
    user_agent      VARCHAR(512),
    ip_address      INET
);

CREATE INDEX idx_refresh_tokens_user    ON refresh_tokens (user_id);
CREATE INDEX idx_refresh_tokens_family  ON refresh_tokens (family_id);
CREATE INDEX idx_refresh_tokens_active  ON refresh_tokens (expires_at) WHERE revoked_at IS NULL;
