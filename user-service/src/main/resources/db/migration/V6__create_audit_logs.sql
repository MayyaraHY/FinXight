-- audit_logs is partitioned by month on created_at.
-- Partition key must be part of the primary key, so PK = (id, created_at).
CREATE TABLE audit_logs (
    id         BIGSERIAL,
    user_id    UUID                 REFERENCES users(id) ON DELETE SET NULL,
    event_type VARCHAR(40)  NOT NULL,
    ip_address INET,
    user_agent VARCHAR(512),
    details    JSONB,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    PRIMARY KEY (id, created_at),
    CONSTRAINT chk_audit_event_type CHECK (event_type IN (
        'REGISTER', 'LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT',
        'TOKEN_REFRESHED', 'TOKEN_REUSE_DETECTED',
        'PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET',
        'EMAIL_VERIFIED', 'ACCOUNT_LOCKED',
        'ROLE_GRANTED', 'ROLE_REVOKED', 'ACCOUNT_DEACTIVATED'
    ))
) PARTITION BY RANGE (created_at);

-- Default partition catches rows outside any explicit range so inserts never fail.
-- Operations should periodically move data out of this partition into proper monthly ones.
CREATE TABLE audit_logs_default PARTITION OF audit_logs DEFAULT;

-- Initial monthly partitions. A scheduled job (or operator) creates future months
-- ahead of time, e.g. once per month: CREATE TABLE audit_logs_YYYY_MM PARTITION OF audit_logs FOR VALUES FROM (...) TO (...).
CREATE TABLE audit_logs_2026_05 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE audit_logs_2026_06 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE audit_logs_2026_07 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

CREATE INDEX idx_audit_logs_user_time   ON audit_logs (user_id, created_at DESC);
CREATE INDEX idx_audit_logs_event_time  ON audit_logs (event_type, created_at DESC);
