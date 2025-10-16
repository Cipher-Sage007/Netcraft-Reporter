const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Configuration
const CONFIG = {
  email: 'ciphersage007@gmail.com', // Your reporter email
  apiKey: '', // Optional - Netcraft API key
  apiBaseUrl: 'https://report.netcraft.com/api/v3',
  delayBetweenRequests: 1000, // 1 second delay between batch requests
  waitBeforeUuidFetch: 10000, // 10 seconds wait before fetching individual UUIDs
  uuidFetchRetries: 3, // Number of retries for UUID fetching
  uuidFetchRetryDelay: 5000, // 5 seconds between retries

  // Supabase Configuration
  supabase: {
    url: 'https://hacabwlposxmboxurihb.supabase.co', // Replace with your Supabase URL
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhY2Fid2xwb3N4bWJveHVyaWhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk0NzQ0NTgsImV4cCI6MjA3NTA1MDQ1OH0.DVn8I2tpFsuAMyGg2-1UmRGAAowzPGquyGf2B29JpjI', // Replace with your Supabase anon key
    tableName: 'netcraft_submissions'
  }
};

// Supabase Database Client
class SupabaseDB {
  constructor(config) {
    this.supabase = createClient(config.url, config.key);
    this.tableName = config.tableName;
  }

  async addSubmission(url, uuid, state = 'pending') {
    const submission = {
      url,
      uuid,
      reported_at: new Date().toISOString(),
      state,
      tags: [],
      error: null
    };

    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .insert([submission])
        .select();

      if (error) {
        console.error('Error adding submission:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
          url: url,
          uuid: uuid
        });
        return null;
      }

      if (!data || data.length === 0) {
        console.error('No data returned after insert for URL:', url);
        return null;
      }

      return data[0];
    } catch (err) {
      console.error('Exception in addSubmission:', err);
      return null;
    }
  }

  async addFailedSubmission(url, errorMessage) {
    const submission = {
      url,
      uuid: null,
      reported_at: new Date().toISOString(),
      state: 'failed',
      tags: [],
      error: errorMessage
    };

    const { data, error } = await this.supabase
      .from(this.tableName)
      .insert([submission])
      .select();

    if (error) {
      console.error('Error adding failed submission:', error);
      return null;
    }

    return data[0];
  }

  async findByUrl(url) {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('url', url)
      .limit(1);

    if (error) {
      console.error('Error finding by URL:', error);
      return null;
    }

    return data && data.length > 0 ? data[0] : null;
  }

  async findByUuid(uuid) {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('uuid', uuid)
      .limit(1);

    if (error) {
      console.error('Error finding by UUID:', error);
      return null;
    }

    return data && data.length > 0 ? data[0] : null;
  }

  async updateSubmission(uuid, updates) {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .update(updates)
      .eq('uuid', uuid)
      .select();

    if (error) {
      console.error('Error updating submission:', error);
      return null;
    }

    return data && data.length > 0 ? data[0] : null;
  }

  async updateSubmissionByUrl(url, updates) {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .update(updates)
        .eq('url', url)
        .select();

      if (error) {
        console.error('Error updating submission by URL:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
          url: url,
          updates: updates
        });
        return null;
      }

      if (!data || data.length === 0) {
        console.error('No rows updated for URL:', url, 'Updates:', updates);
        return null;
      }

      return data[0];
    } catch (err) {
      console.error('Exception in updateSubmissionByUrl:', err);
      return null;
    }
  }

  isCompleted(state) {
    // Only these states mean Netcraft has finished analyzing
    const completedStates = ['no threats', 'suspicious', 'malicious'];
    return completedStates.includes(state);
  }

  async getStats() {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*');

    if (error) {
      console.error('Error getting stats:', error);
      return { total: 0, reported: 0, failed: 0, completed: 0, pending: 0, processing: 0 };
    }

    const total = data.length;
    const reported = data.filter(s => s.uuid && s.state !== 'failed').length;
    const failed = data.filter(s => s.state === 'failed').length;
    const completed = data.filter(s => this.isCompleted(s.state)).length;
    const pending = data.filter(s => s.state === 'pending').length;
    const processing = data.filter(s => s.state === 'processing').length;

    return { total, reported, failed, completed, pending, processing };
  }

  async getAllSubmissions(filter = {}) {
    let query = this.supabase.from(this.tableName).select('*');

    if (filter.state) {
      query = query.eq('state', filter.state);
    }

    const { data, error } = await query.order('reported_at', { ascending: false });

    if (error) {
      console.error('Error getting submissions:', error);
      return [];
    }

    return data || [];
  }

  async getPendingSubmissions() {
    // Get all submissions that are not yet completed (pending or processing)
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .not('uuid', 'is', null)
      .neq('state', 'failed')
      .not('state', 'in', '("no threats","suspicious","malicious")');

    if (error) {
      console.error('Error getting pending submissions:', error);
      return [];
    }

    return data || [];
  }

  async getDailyStats(days = 7) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .gte('reported_at', startDate.toISOString());

    if (error) {
      console.error('Error getting daily stats:', error);
      return {};
    }

    const dailyStats = {};

    data.forEach(sub => {
      const date = new Date(sub.reported_at).toLocaleDateString();

      if (!dailyStats[date]) {
        dailyStats[date] = {
          reported: 0,
          completed: 0,
          failed: 0
        };
      }

      if (sub.state === 'failed') {
        dailyStats[date].failed++;
      } else if (sub.uuid) {
        dailyStats[date].reported++;

        if (this.isCompleted(sub.state)) {
          dailyStats[date].completed++;
        }
      }
    });

    return dailyStats;
  }
}

// API Client
class NetcraftAPI {
  constructor(email, apiKey = '') {
    this.email = email;
    this.apiKey = apiKey;
    this.baseUrl = CONFIG.apiBaseUrl;
  }

  async reportUrls(urls) {
    const headers = {
      'Content-Type': 'application/json'
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    try {
      // Batch report up to 1000 URLs at once
      const urlObjects = urls.map(url => ({ url }));

      const response = await fetch(`${this.baseUrl}/report/urls`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          email: this.email,
          urls: urlObjects
        })
      });

      if (response.status === 429) {
        return { success: false, limitReached: true, error: 'Rate limit reached' };
      }

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `HTTP ${response.status}`;
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch (e) {
          if (errorText) errorMessage += `: ${errorText}`;
        }
        return { success: false, error: errorMessage };
      }

      const data = await response.json();
      return { success: true, uuid: data.uuid };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getUrlUuids(submissionUuid, urls) {
    const headers = {
      'Content-Type': 'application/json'
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    try {
      const urlObjects = urls.map(url => ({ url }));

      const response = await fetch(`${this.baseUrl}/submission/${submissionUuid}/url_uuids`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          urls: urlObjects
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `HTTP ${response.status}: ${errorText}` };
      }

      const data = await response.json();
      // Returns { urls: [{ data: { url: "..." }, found: true, uuid: "..." }] }
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getSubmissionStatus(uuid) {
    const headers = {};

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    try {
      const response = await fetch(`${this.baseUrl}/submission/${uuid}`, {
        method: 'GET',
        headers
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `HTTP ${response.status}: ${errorText}` };
      }

      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// Utility Functions
function loadUrlsFromFile(filename) {
  try {
    const content = fs.readFileSync(filename, 'utf8');
    const urls = content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && (line.startsWith('http://') || line.startsWith('https://')));
    return urls;
  } catch (error) {
    console.error(`Error reading file: ${error.message}`);
    return [];
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const prefix = {
    info: '[\x1b[36mINFO\x1b[0m]',
    success: '[\x1b[32mSUCCESS\x1b[0m]',
    error: '[\x1b[31mERROR\x1b[0m]',
    warning: '[\x1b[33mWARNING\x1b[0m]'
  }[type] || '[INFO]';

  console.log(`${prefix} [${timestamp}] ${message}`);
}

// Main Functions
async function reportUrls(filename) {
  log('Starting URL reporting process...', 'info');

  const allUrls = loadUrlsFromFile(filename);
  if (allUrls.length === 0) {
    log('No valid URLs found in the file', 'error');
    return;
  }

  log(`Loaded ${allUrls.length} URLs from ${filename}`, 'success');

  const db = new SupabaseDB(CONFIG.supabase);
  const api = new NetcraftAPI(CONFIG.email, CONFIG.apiKey);

  // Filter out already reported URLs
  const urlsToReport = [];
  let skipped = 0;

  for (const url of allUrls) {
    const existing = await db.findByUrl(url);
    if (existing) {
      log(`Skipped (already reported): ${url}`, 'warning');
      skipped++;
    } else {
      urlsToReport.push(url);
    }
  }

  if (urlsToReport.length === 0) {
    log('No new URLs to report', 'warning');
    log('\n=== Summary ===', 'info');
    log(`Total URLs: ${allUrls.length}`, 'info');
    log(`Skipped: ${skipped}`, 'warning');
    return;
  }

  log(`Reporting ${urlsToReport.length} new URLs in batches...`, 'info');

  let totalReported = 0;
  let totalFailed = 0;
  const BATCH_SIZE = 1000;

  // Process URLs in batches of 1000
  for (let i = 0; i < urlsToReport.length; i += BATCH_SIZE) {
    const batch = urlsToReport.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(urlsToReport.length / BATCH_SIZE);

    log(`\nProcessing batch ${batchNum}/${totalBatches} (${batch.length} URLs)...`, 'info');

    // Submit batch to Netcraft
    const result = await api.reportUrls(batch);

    if (result.limitReached) {
      log('Rate limit reached! Stopping process. Run again later to continue.', 'error');
      break;
    }

    if (!result.success) {
      log(`Failed to report batch: ${result.error}`, 'error');
      // Mark all URLs in batch as failed
      for (const url of batch) {
        await db.addFailedSubmission(url, result.error);
      }
      totalFailed += batch.length;
      continue;
    }

    const submissionUuid = result.uuid;
    log(`Batch submitted successfully (Submission UUID: ${submissionUuid})`, 'success');

    // First, store all URLs with the batch submission UUID as temporary fallback
    log('Storing URLs with batch submission UUID...', 'info');
    let insertedCount = 0;
    for (const url of batch) {
      const inserted = await db.addSubmission(url, submissionUuid);
      if (inserted) {
        insertedCount++;
      } else {
        log(`Failed to insert ${url} into database`, 'error');
      }
    }

    if (insertedCount === batch.length) {
      log(`✓ Successfully stored ${insertedCount}/${batch.length} URLs in database`, 'success');
    } else {
      log(`⚠ Only stored ${insertedCount}/${batch.length} URLs in database`, 'warning');
    }

    totalReported += insertedCount;

    // Wait for Netcraft to process the submission before fetching individual UUIDs
    log(`Waiting ${CONFIG.waitBeforeUuidFetch / 1000} seconds for Netcraft to process submission...`, 'info');
    await sleep(CONFIG.waitBeforeUuidFetch);

    // Try to get individual URL UUIDs with retry logic
    log('Fetching individual URL UUIDs...', 'info');
    let uuidResult = null;
    let retryCount = 0;

    while (retryCount <= CONFIG.uuidFetchRetries) {
      uuidResult = await api.getUrlUuids(submissionUuid, batch);

      if (uuidResult.success) {
        break;
      }

      retryCount++;
      if (retryCount <= CONFIG.uuidFetchRetries) {
        log(`Failed to get UUIDs (attempt ${retryCount}/${CONFIG.uuidFetchRetries}). Retrying in ${CONFIG.uuidFetchRetryDelay / 1000} seconds...`, 'warning');
        await sleep(CONFIG.uuidFetchRetryDelay);
      }
    }

    if (!uuidResult || !uuidResult.success) {
      log(`Failed to get individual URL UUIDs after ${CONFIG.uuidFetchRetries + 1} attempts. URLs stored with batch UUID.`, 'warning');
      continue;
    }

    // Update each URL with its individual UUID
    const urlsData = uuidResult.data.urls || [];
    let updatedCount = 0;
    let notFoundCount = 0;

    for (let idx = 0; idx < urlsData.length; idx++) {
      const urlData = urlsData[idx];

      if (!urlData) {
        log(`  Entry ${idx + 1} → No data returned`, 'warning');
        continue;
      }

      // According to API docs: { data: { url: "..." }, found: true, uuid: "..." }
      const returnedUrl = urlData.data?.url;
      const found = urlData.found;
      const individualUuid = urlData.uuid;

      if (!returnedUrl) {
        log(`  Entry ${idx + 1} → Missing URL in response`, 'warning');
        continue;
      }

      if (found && individualUuid && individualUuid !== submissionUuid) {
        // Update the submission with the individual UUID
        const updated = await db.updateSubmissionByUrl(returnedUrl, { uuid: individualUuid });
        if (updated) {
          log(`  ${returnedUrl} → Updated to ${individualUuid}`, 'success');
          updatedCount++;
        } else {
          log(`  ${returnedUrl} → Failed to update UUID in database`, 'error');
        }
      } else if (!found) {
        log(`  ${returnedUrl} → Not yet processed by Netcraft (keeping batch UUID)`, 'warning');
        notFoundCount++;
      } else if (!individualUuid) {
        log(`  ${returnedUrl} → No individual UUID returned (keeping batch UUID)`, 'warning');
      } else {
        log(`  ${returnedUrl} → Individual UUID same as batch UUID`, 'info');
      }
    }

    if (updatedCount > 0) {
      log(`✓ Updated ${updatedCount}/${urlsData.length} URLs with individual UUIDs`, 'success');
    }
    if (notFoundCount > 0) {
      log(`⏳ ${notFoundCount} URLs still being processed by Netcraft`, 'info');
    }
    if (updatedCount === 0 && notFoundCount === 0) {
      log(`All URLs using batch UUID: ${submissionUuid}`, 'info');
    }

    // Delay between batches
    if (i + BATCH_SIZE < urlsToReport.length) {
      log('Waiting before next batch...', 'info');
      await sleep(CONFIG.delayBetweenRequests);
    }
  }

  log('\n=== Summary ===', 'info');
  log(`Total URLs: ${allUrls.length}`, 'info');
  log(`Reported: ${totalReported}`, 'success');
  log(`Skipped: ${skipped}`, 'warning');
  log(`Failed: ${totalFailed}`, 'error');
  log(`Data saved to Supabase`, 'info');
}

async function checkStatuses() {
  log('Checking submission statuses...', 'info');

  const db = new SupabaseDB(CONFIG.supabase);
  const api = new NetcraftAPI(CONFIG.email, CONFIG.apiKey);

  // Get submissions that need status check (pending or processing)
  const submissions = await db.getPendingSubmissions();

  if (submissions.length === 0) {
    log('No pending or processing submissions to check', 'warning');
    return;
  }

  log(`Checking ${submissions.length} submissions (pending + processing)...`, 'info');

  for (const submission of submissions) {
    const result = await api.getSubmissionStatus(submission.uuid);

    if (result.success) {
      const { state, tags } = result.data;

      // Extract tag names only
      const tagNames = tags && Array.isArray(tags)
        ? tags.map(tag => tag.name || tag).filter(name => name)
        : [];

      await db.updateSubmission(submission.uuid, { state, tags: tagNames });

      const tagInfo = tagNames.length > 0 ? ` [Tags: ${tagNames.join(', ')}]` : '';
      log(`${submission.uuid}: ${state}${tagInfo}`, 'success');
    } else {
      log(`Failed to check ${submission.uuid}: ${result.error}`, 'error');
    }

    await sleep(500);
  }

  log('\n=== Updated Statistics ===', 'info');
  const stats = await db.getStats();
  log(`Total: ${stats.total}`, 'info');
  log(`Pending: ${stats.pending}`, 'warning');
  log(`Processing: ${stats.processing}`, 'warning');
  log(`Completed: ${stats.completed}`, 'success');
  log(`Failed: ${stats.failed}`, 'error');
}

async function showStats() {
  const db = new SupabaseDB(CONFIG.supabase);
  const stats = await db.getStats();

  console.log('\n=== Submission Statistics ===');
  console.log(`Total Submissions: ${stats.total}`);
  console.log(`Successfully Reported: ${stats.reported}`);
  console.log(`Failed: ${stats.failed}`);
  console.log(`Pending: ${stats.pending}`);
  console.log(`Processing: ${stats.processing}`);
  console.log(`Completed: ${stats.completed}`);
  console.log('');
}

async function showDailyStats(days = 7) {
  const db = new SupabaseDB(CONFIG.supabase);
  const dailyStats = await db.getDailyStats(days);
  
  const sortedDates = Object.keys(dailyStats).sort((a, b) => 
    new Date(b) - new Date(a)
  );
  
  if (sortedDates.length === 0) {
    log('No submissions found', 'warning');
    return;
  }
  
  console.log(`\n=== Daily Statistics (Last ${days} days) ===\n`);
  
  sortedDates.forEach(date => {
    const stats = dailyStats[date];
    console.log(`📅 ${date}`);
    console.log(`   Reported: ${stats.reported}`);
    console.log(`   Completed: ${stats.completed}`);
    console.log(`   Failed: ${stats.failed}`);
    console.log('');
  });

  const totals = sortedDates.reduce((acc, date) => {
    const stats = dailyStats[date];
    return {
      reported: acc.reported + stats.reported,
      completed: acc.completed + stats.completed,
      failed: acc.failed + stats.failed
    };
  }, { reported: 0, completed: 0, failed: 0 });

  console.log('=== Total (Selected Period) ===');
  console.log(`Reported: ${totals.reported}`);
  console.log(`Completed: ${totals.completed}`);
  console.log(`Failed: ${totals.failed}`);
  console.log('');
}

async function listSubmissions(filter = 'all') {
  const db = new SupabaseDB(CONFIG.supabase);
  let submissions = await db.getAllSubmissions();

  if (filter === 'completed') {
    submissions = submissions.filter(s => db.isCompleted(s.state));
  } else if (filter !== 'all') {
    submissions = submissions.filter(s => s.state === filter);
  }

  if (submissions.length === 0) {
    log(`No submissions found with filter: ${filter}`, 'warning');
    return;
  }

  console.log(`\n=== Submissions (${filter}) ===`);
  submissions.forEach((sub, idx) => {
    console.log(`\n[${idx + 1}] ${sub.url}`);
    console.log(`    UUID: ${sub.uuid || 'N/A'}`);
    console.log(`    State: ${sub.state}`);
    console.log(`    Reported: ${new Date(sub.reported_at).toLocaleString()}`);
    if (sub.tags && sub.tags.length > 0) {
      console.log(`    Tags: ${sub.tags.join(', ')}`);
    }
    if (sub.error) {
      console.log(`    Error: ${sub.error}`);
    }
  });
  console.log('');
}

async function testDatabase() {
  log('Testing Supabase database connection...', 'info');

  const db = new SupabaseDB(CONFIG.supabase);

  // Test connection by trying to read from the table
  const { data, error } = await db.supabase
    .from(db.tableName)
    .select('*')
    .limit(1);

  if (error) {
    log('Database connection test FAILED!', 'error');
    console.error('Error details:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code
    });
    console.log('\nPossible issues:');
    console.log('1. Table "netcraft_submissions" does not exist - run "setup" command to see SQL');
    console.log('2. Incorrect Supabase URL or API key in CONFIG');
    console.log('3. Row Level Security (RLS) is blocking access');
    console.log('4. Network/connectivity issues');
    return false;
  }

  log('Database connection test PASSED!', 'success');
  log(`Table "${db.tableName}" is accessible`, 'success');

  // Test insert
  log('\nTesting insert operation...', 'info');
  const testUrl = `https://test-${Date.now()}.example.com`;
  const testUuid = 'test-uuid-' + Date.now();

  const inserted = await db.addSubmission(testUrl, testUuid, 'pending');

  if (inserted) {
    log('Insert test PASSED! Data was written to database.', 'success');
    console.log('Inserted record:', inserted);

    // Clean up test record
    const { error: deleteError } = await db.supabase
      .from(db.tableName)
      .delete()
      .eq('url', testUrl);

    if (!deleteError) {
      log('Test record cleaned up', 'info');
    }
  } else {
    log('Insert test FAILED! Could not write to database.', 'error');
    return false;
  }

  return true;
}

async function setupDatabase() {
  log('Setting up Supabase database...', 'info');

  console.log('\n=== Supabase Setup Instructions ===\n');
  console.log('1. Go to https://supabase.com and create a new project');
  console.log('2. Go to SQL Editor and run this SQL:');
  console.log('\n--- SQL START ---');
  console.log(`
CREATE TABLE netcraft_submissions (
  id BIGSERIAL PRIMARY KEY,
  url TEXT NOT NULL,
  uuid TEXT,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  state TEXT NOT NULL DEFAULT 'pending',
  tags TEXT[] DEFAULT '{}',
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX idx_netcraft_url ON netcraft_submissions(url);
CREATE INDEX idx_netcraft_uuid ON netcraft_submissions(uuid);
CREATE INDEX idx_netcraft_state ON netcraft_submissions(state);
CREATE INDEX idx_netcraft_reported_at ON netcraft_submissions(reported_at);

-- Enable Row Level Security (optional, but recommended)
ALTER TABLE netcraft_submissions ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations (adjust based on your security needs)
CREATE POLICY "Enable all operations for authenticated users" ON netcraft_submissions
  FOR ALL
  USING (true)
  WITH CHECK (true);
  `);
  console.log('--- SQL END ---');
  console.log('\n3. Get your project URL and anon key from Settings > API');
  console.log('4. Update the CONFIG.supabase section in this file with your credentials');
  console.log('5. Install the Supabase client: npm install @supabase/supabase-js');
  console.log('\nDone! You can now use the tool with Supabase.\n');
}

function showHelp() {
  console.log(`
Netcraft URL Reporter - CLI Tool (Supabase Edition)

Usage:
  node netcraft-reporter.js <command> [options]

Commands:
  setup                  Show Supabase database setup instructions
  test                   Test database connection and permissions
  report <file>          Report URLs from a text file
  check                  Check status of all pending submissions
  stats                  Show overall submission statistics
  daily [days]           Show daily statistics (default: 7 days)
  list [filter]          List submissions (filter: all, pending, completed, failed)
  help                   Show this help message

Configuration:
  Edit the CONFIG object at the top of the file to set:
  - email: Your reporter email address
  - apiKey: Your Netcraft API key (optional)
  - supabase.url: Your Supabase project URL
  - supabase.key: Your Supabase anon key
  - delayBetweenRequests: Delay in ms between API calls

Supabase Benefits:
  ✓ Visual dashboard at supabase.com
  ✓ SQL queries and analysis
  ✓ Real-time updates
  ✓ Automatic backups
  ✓ API access to your data
  ✓ Export to CSV/JSON

Examples:
  node netcraft-reporter.js setup
  node netcraft-reporter.js report urls.txt
  node netcraft-reporter.js check
  node netcraft-reporter.js stats
  node netcraft-reporter.js daily 30
  node netcraft-reporter.js list completed
`);
}

// Main Entry Point
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    showHelp();
    return;
  }

  const command = args[0];

  switch (command) {
    case 'setup':
      await setupDatabase();
      break;

    case 'test':
      await testDatabase();
      break;

    case 'report':
      if (args.length < 2) {
        log('Please provide a filename', 'error');
        console.log('Usage: node netcraft-reporter.js report <file>');
        return;
      }
      await reportUrls(args[1]);
      break;

    case 'check':
      await checkStatuses();
      break;

    case 'stats':
      await showStats();
      break;

    case 'daily':
      const days = parseInt(args[1]) || 7;
      await showDailyStats(days);
      break;

    case 'list':
      const filter = args[1] || 'all';
      await listSubmissions(filter);
      break;

    case 'help':
      showHelp();
      break;

    default:
      log(`Unknown command: ${command}`, 'error');
      showHelp();
  }
}

// Run the application
main().catch(error => {
  log(`Unexpected error: ${error.message}`, 'error');
  console.error(error);
  process.exit(1);
});