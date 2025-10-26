-- Cleanup Script for Test Data
-- Run this in Supabase SQL Editor to remove incomplete/test submissions

-- Option 1: Delete ALL submissions (fresh start)
-- CAUTION: This deletes everything!
-- Uncomment the line below to use:
-- DELETE FROM netcraft_submissions;

-- Option 2: Delete only submissions without UUID (failed submissions)
-- DELETE FROM netcraft_submissions WHERE uuid IS NULL;

-- Option 3: Delete submissions from specific batch UUID
-- First, find the batch UUID from incomplete upload:
SELECT uuid, COUNT(*) as url_count, MIN(reported_at) as first_report, MAX(reported_at) as last_report
FROM netcraft_submissions
WHERE uuid IS NOT NULL
GROUP BY uuid
ORDER BY first_report DESC
LIMIT 10;

-- Then delete that specific batch (replace 'YOUR_UUID_HERE' with actual UUID):
-- DELETE FROM netcraft_submissions WHERE uuid = 'YOUR_UUID_HERE';

-- Option 4: Delete recent test submissions (last 1 hour)
-- Uncomment to use:
-- DELETE FROM netcraft_submissions
-- WHERE reported_at > NOW() - INTERVAL '1 hour';

-- Option 5: Keep only URLs with specific states
-- Delete all pending/failed, keep only completed ones:
-- DELETE FROM netcraft_submissions
-- WHERE state IN ('pending', 'failed', 'processing');

-- After cleanup, verify what's left:
SELECT
  state,
  COUNT(*) as count
FROM netcraft_submissions
GROUP BY state
ORDER BY count DESC;

-- Total count:
SELECT COUNT(*) as total_submissions FROM netcraft_submissions;
