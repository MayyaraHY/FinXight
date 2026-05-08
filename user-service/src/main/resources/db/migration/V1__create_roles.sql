CREATE TABLE roles (
    id          INTEGER     PRIMARY KEY,
    name        VARCHAR(50) NOT NULL UNIQUE,
    description VARCHAR(255)
);

INSERT INTO roles (id, name, description) VALUES
    (1, 'ADMIN',      'Full administrative access'),
    (2, 'ACCOUNTANT', 'Accounting access'),
    (3, 'VIEWER',     'Read-only access');
