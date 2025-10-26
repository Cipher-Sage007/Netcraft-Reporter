-- Add unique constraint to prevent duplicate URLs
-- Run this in your Supabase SQL Editor

-- First, remove any existing duplicate URLs (keeping the one with UUID if available)
DELETE FROM netcraft_submissions a
USING netcraft_submissions b
WHERE a.id < b.id
  AND a.url = b.url;

-- Now add the unique constraint
ALTER TABLE netcraft_submissions
ADD CONSTRAINT netcraft_submissions_url_unique UNIQUE (url);

-- Create an index for better performance (if not already created)
CREATE INDEX IF NOT EXISTS idx_netcraft_url ON netcraft_submissions(url);

-- Verify the constraint was added
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'netcraft_submissions'
  AND constraint_type = 'UNIQUE';
