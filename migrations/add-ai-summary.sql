-- Add ai_summary column to candidates table if it doesn't exist
-- Run this migration if you have an existing database

-- SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so we need to check first
-- This is a manual migration - run it once

ALTER TABLE candidates ADD COLUMN ai_summary TEXT;
