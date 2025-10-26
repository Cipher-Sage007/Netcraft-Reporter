# Test Plan for Netcraft Reporter Issues #2-#5

## Overview
This document outlines the testing procedures for the implemented features addressing GitHub issues #2 through #5.

## Features Implemented

### Issue #5: Maintain State When Tab Switching
**Feature**: Processing state persists across tab navigation
- Global state management implemented
- Processing banner displays current status across all tabs
- Job ID and progress maintained when switching tabs

**Test Cases**:
1. Start URL submission process
2. Switch to "View Submissions" tab
3. Verify processing banner is still visible at top
4. Switch back to "Submit URLs" tab
5. Verify progress bar and status are still showing
6. Wait for completion
7. Verify result appears correctly

### Issue #4: Stopping Orphan Processes
**Feature 1**: Manual stop button
- Stop button appears when processing is active
- Allows user to cancel processing at any time
- Confirms before stopping

**Feature 2**: Auto-stop on refresh
- Jobs continue running server-side even if client disconnects
- Client can reconnect to existing job

**Test Cases**:
1. Start processing with test_urls.txt (100 URLs)
2. Click "Stop" button during processing
3. Confirm the stop dialog
4. Verify processing stops immediately
5. Start new job
6. Refresh browser during processing
7. Verify state is maintained (job continues)

### Issue #2: Optimize Large File Handling
**Features**:
- Batch validation (100 URLs at a time for progress updates)
- Batch duplicate checking (500 URLs per query)
- Batch database inserts (1000 URLs per batch)
- Optimized progress reporting
- Memory-efficient processing

**Test Cases**:
1. Upload test_urls.txt (100 URLs) - should process quickly
2. Monitor progress updates - should show smooth progress
3. Upload inurl.txt (5471 URLs) - full test
4. Monitor memory usage during processing
5. Verify all URLs are processed correctly
6. Check database for all entries

### Issue #3: Pagination in View Submissions
**Features**:
- Configurable items per page (25, 50, 100, 200)
- First/Previous/Next/Last page buttons
- Current page indicator
- Proper selection handling for paginated data
- Filters and search work with pagination

**Test Cases**:
1. Navigate to "View Submissions"
2. Verify default pagination shows (50 items per page)
3. Test "Next" button - verify page 2 loads
4. Test "Previous" button - verify back to page 1
5. Test "Last" button - verify jumps to final page
6. Test "First" button - verify jumps to page 1
7. Change items per page to 25 - verify page reloads
8. Change items per page to 100 - verify page reloads
9. Apply search filter - verify pagination resets to page 1
10. Select items on page 1
11. Navigate to page 2
12. Select items on page 2
13. Verify both selections are maintained
14. Test delete with multi-page selection

## Test Execution Steps

### Prerequisites
1. Ensure Supabase database is configured
2. Ensure Netcraft API credentials are set
3. Have test_urls.txt (100 URLs) available
4. Have inurl.txt (5471 URLs) available

### Execution Order

#### Phase 1: Basic Functionality (test_urls.txt - 100 URLs)
```bash
# Start server
npm start

# Open browser to http://localhost:3000
# Configure email and Supabase in Configuration tab
# Test database connection
```

**Test 1: Small file upload with state management**
1. Go to "Submit URLs" tab
2. Upload test_urls.txt
3. Click "Submit URLs"
4. Observe progress
5. Switch to "View Submissions" tab during processing
6. Verify processing banner shows at top
7. Switch back to "Submit URLs" tab
8. Verify progress still showing
9. Wait for completion
10. Verify success message

**Test 2: Stop functionality**
1. Upload test_urls.txt again
2. Click "Submit URLs"
3. Click "Stop" button during processing
4. Confirm stop
5. Verify processing stops
6. Check "View Submissions" to see partial results

**Test 3: Pagination**
1. Go to "View Submissions" tab
2. Verify pagination controls appear
3. Test all pagination buttons
4. Change items per page
5. Test search with pagination
6. Test filters with pagination
7. Test multi-page selection

#### Phase 2: Large File Test (inurl.txt - 5471 URLs)
**Test 4: Large file optimization**
1. Clear previous submissions (delete all)
2. Upload inurl.txt (5471 URLs)
3. Click "Submit URLs"
4. Monitor progress updates (should be smooth)
5. Switch tabs to verify state management
6. Wait for completion (may take several minutes)
7. Go to "View Submissions"
8. Verify all URLs are present
9. Test pagination with large dataset
10. Filter by state
11. Test search functionality
12. Monitor browser performance (should not freeze)

### Expected Results

**Issue #5 (State Management)**:
✓ Processing state visible across all tabs
✓ Global banner shows current progress
✓ Switching tabs doesn't lose progress info

**Issue #4 (Stop Functionality)**:
✓ Stop button appears during processing
✓ Clicking stop cancels the job
✓ Jobs continue server-side on disconnect
✓ Client can rejoin ongoing jobs

**Issue #2 (Large File Handling)**:
✓ System handles 5471 URLs without breaking
✓ Progress updates are smooth and regular
✓ Memory usage remains reasonable
✓ Database operations are optimized
✓ All URLs are processed correctly

**Issue #3 (Pagination)**:
✓ Pagination controls appear for large datasets
✓ All pagination buttons work correctly
✓ Items per page selector works
✓ Filters reset pagination to page 1
✓ Multi-page selection works correctly
✓ Browser remains responsive with thousands of rows

## Performance Benchmarks

### Small File (100 URLs)
- Validation: < 2 seconds
- Submission: < 5 seconds
- Database insert: < 2 seconds
- Total: < 10 seconds

### Large File (5471 URLs)
- Validation: < 30 seconds
- Duplicate check: < 10 seconds
- Submission: 2-5 minutes (depends on API)
- Database insert: < 10 seconds
- Total: 3-6 minutes

### Browser Performance
- View Submissions with 5000+ records: Should render pagination immediately
- Switching tabs: < 500ms
- Filtering: < 1 second
- Searching: < 500ms

## Known Limitations
1. Rate limits on Netcraft API may cause some submissions to fail
2. Very large batches (>10,000 URLs) may require additional optimization
3. Browser tab state is not persisted on hard refresh (by design for security)

## Cleanup After Testing
1. Delete test submissions from database
2. Remove test files (test_urls.txt)
3. Keep inurl.txt for future testing
