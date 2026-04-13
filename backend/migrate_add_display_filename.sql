-- SQL Migration: Add display_filename column to uploads table
-- Run this file directly in PostgreSQL if the Python migration script doesn't work
-- Command: psql -U username -d database_name -f migrate_add_display_filename.sql

-- Add display_filename column to uploads table (if it doesn't already exist)
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS display_filename VARCHAR NULL;

-- Verify the migration
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'uploads' 
ORDER BY ordinal_position;
