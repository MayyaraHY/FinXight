-- Runs once, on first initialization of the postgres data volume.
-- Creates the two databases the stack needs (one shared postgres server
-- keeps the footprint light vs. running two postgres containers).
--
-- The default database is named after POSTGRES_USER (postgres); we add
-- the application databases here.
CREATE DATABASE financial_db;
CREATE DATABASE userservice;
