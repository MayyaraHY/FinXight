CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    email               VARCHAR(255) NOT NULL,
    hashed_password     VARCHAR(255),
    full_name           VARCHAR(255) NOT NULL,
    is_active           BOOLEAN      NOT NULL DEFAULT TRUE,
    is_verified         BOOLEAN      NOT NULL DEFAULT FALSE,
    auth_provider       VARCHAR(20)  NOT NULL DEFAULT 'LOCAL',
    failed_login_count  INTEGER      NOT NULL DEFAULT 0,
    locked_until        TIMESTAMPTZ,
    last_login_at       TIMESTAMPTZ,
    last_login_ip       INET,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_users_auth_provider CHECK (auth_provider IN ('LOCAL', 'SAGE_X3', 'SAML'))
);

CREATE UNIQUE INDEX idx_users_email_lower ON users (lower(email));
CREATE INDEX        idx_users_active      ON users (is_active) WHERE is_active = TRUE;
