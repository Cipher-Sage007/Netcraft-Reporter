const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const upload = multer({ dest: 'uploads/' });

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increase JSON body size limit for large URL lists
app.use(express.urlencoded({ limit: '50mb', extended: true })); // Increase URL-encoded body size limit
app.use(express.static('public'));

// In-memory configuration (in production, use a database)
let config = {
  email: '',
  apiKey: '',
  apiBaseUrl: 'https://report.netcraft.com/api/v3',
  supabase: {
    url: '',
    key: '',
    tableName: 'netcraft_submissions'
  },
  waitBeforeUuidFetch: 10000,
  uuidFetchRetries: 3,
  uuidFetchRetryDelay: 5000
};

// Load config from file if exists
const CONFIG_FILE = 'config.json';
if (fs.existsSync(CONFIG_FILE)) {
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    console.log('Configuration loaded from config.json');
  } catch (err) {
    console.error('Error loading config:', err);
  }
}

// Save config to file
function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (err) {
    console.error('Error saving config:', err);
  }
}

// Netcraft API Client
class NetcraftAPI {
  constructor(email, apiKey) {
    this.email = email;
    this.apiKey = apiKey;
    this.baseUrl = config.apiBaseUrl;
  }

  async reportUrls(urls) {
    const headers = {
      'Content-Type': 'application/json'
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    try {
      // Format URLs with required fields: country and reason
      const urlObjects = urls.map(url => ({
        url: url,
        country: 'IN',  // India - adjust as needed
        reason: 'phishing site'  // Required by Netcraft API
      }));

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

  async getSubmissionUrls(batchUuid, count = 1000) {
    const headers = {};

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    try {
      // Add count parameter to fetch all URLs (default API limit is 25)
      const response = await fetch(`${this.baseUrl}/submission/${batchUuid}/urls?count=${count}`, {
        method: 'GET',
        headers
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `HTTP ${response.status}: ${errorText}` };
      }

      const data = await response.json();
      // Returns { urls: [{ url, url_state, tags, classification_log, uuid, ... }] }
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// Supabase Database Client
class SupabaseDB {
  constructor(supabaseConfig) {
    if (!supabaseConfig.url || !supabaseConfig.key) {
      throw new Error('Supabase URL and key are required');
    }
    this.supabase = createClient(supabaseConfig.url, supabaseConfig.key);
    this.tableName = supabaseConfig.tableName;
  }

  async addSubmission(url, uuid, state = 'pending', errorMsg = null) {
    const submission = {
      url,
      uuid,
      reported_at: new Date().toISOString(),
      state,
      tags: [],
      error: errorMsg
    };

    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .insert([submission])
        .select();

      if (error) {
        console.error('Error adding submission:', error);
        return null;
      }

      return data[0];
    } catch (err) {
      console.error('Exception in addSubmission:', err);
      return null;
    }
  }

  async updateSubmissionByUrl(url, updates) {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .update(updates)
        .eq('url', url)
        .select();

      if (error) {
        console.error('Error updating submission:', error);
        return null;
      }

      return data && data.length > 0 ? data[0] : null;
    } catch (err) {
      console.error('Exception in updateSubmissionByUrl:', err);
      return null;
    }
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

  async deleteSubmissions(urls) {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .delete()
        .in('url', urls)
        .select();

      if (error) {
        console.error('Error deleting submissions:', error);
        return { success: false, error: error.message };
      }

      return { success: true, deleted: data.length };
    } catch (err) {
      console.error('Exception in deleteSubmissions:', err);
      return { success: false, error: err.message };
    }
  }

  async getAllSubmissions(filter = {}) {
    // Fetch all submissions with pagination to handle large datasets (70k+ URLs)
    // Supabase has a default limit of 1000 rows
    const pageSize = 1000;
    let allData = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      let query = this.supabase
        .from(this.tableName)
        .select('*', { count: 'exact' })
        .range(page * pageSize, (page + 1) * pageSize - 1)
        .order('reported_at', { ascending: false });

      if (filter.state) {
        query = query.eq('state', filter.state);
      }

      const { data, error, count } = await query;

      if (error) {
        console.error('Error getting submissions:', error);
        break;
      }

      if (data && data.length > 0) {
        allData = allData.concat(data);
        page++;
        hasMore = data.length === pageSize;
      } else {
        hasMore = false;
      }
    }

    console.log(`Fetched ${allData.length} total submissions from database`);
    return allData;
  }

  async updateSubmission(uuid, updates) {
    try {
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
    } catch (err) {
      console.error('Exception in updateSubmission:', err);
      return null;
    }
  }

  async getStats() {
    // Fetch all submissions with pagination for accurate stats (70k+ URLs)
    const pageSize = 1000;
    let allData = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) {
        console.error('Error getting stats:', error);
        break;
      }

      if (data && data.length > 0) {
        allData = allData.concat(data);
        page++;
        hasMore = data.length === pageSize;
      } else {
        hasMore = false;
      }
    }

    if (allData.length === 0) {
      return { total: 0, reported: 0, failed: 0, completed: 0, pending: 0, processing: 0, credited: 0 };
    }

    const total = allData.length;
    const reported = allData.filter(s => s.uuid && s.state !== 'failed').length;
    const failed = allData.filter(s => s.state === 'failed').length;
    const completed = allData.filter(s => ['no threats', 'suspicious', 'malicious'].includes(s.state)).length;
    const pending = allData.filter(s => s.state === 'pending').length;
    const processing = allData.filter(s => s.state === 'processing').length;
    const credited = allData.filter(s =>
      s.tags && Array.isArray(s.tags) && s.tags.includes('credited')
    ).length;

    console.log(`Stats calculated from ${allData.length} total submissions`);
    return { total, reported, failed, completed, pending, processing, credited };
  }

  async getPendingSubmissions() {
    // Fetch ALL URLs that need status updates (exclude final states)
    // Final states: failed, no threats, malicious, rejected, unavailable
    // Use pagination to handle 50k+ URLs
    const pageSize = 1000;
    let allData = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error} = await this.supabase
        .from(this.tableName)
        .select('*')
        .not('uuid', 'is', null)
        .not('state', 'in', '("failed","no threats","malicious","rejected","unavailable")')
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) {
        console.error('Error getting pending submissions:', error);
        break;
      }

      if (data && data.length > 0) {
        allData = allData.concat(data);
        page++;
        hasMore = data.length === pageSize;
      } else {
        hasMore = false;
      }
    }

    console.log(`Found ${allData.length} pending/processing submissions to check`);
    return allData;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Track active jobs for cancellation
const activeJobs = new Map();

// API Routes

// Get configuration
app.get('/api/config', (req, res) => {
  // Don't send sensitive keys, only structure
  res.json({
    email: config.email,
    hasApiKey: !!config.apiKey,
    hasSupabaseConfig: !!(config.supabase.url && config.supabase.key),
    supabaseUrl: config.supabase.url ? config.supabase.url.substring(0, 30) + '...' : '',
    tableName: config.supabase.tableName
  });
});

// Update configuration
app.post('/api/config', (req, res) => {
  const { email, apiKey, supabaseUrl, supabaseKey, tableName } = req.body;

  if (email !== undefined) config.email = email;
  if (apiKey !== undefined) config.apiKey = apiKey;
  if (supabaseUrl !== undefined) config.supabase.url = supabaseUrl;
  if (supabaseKey !== undefined) config.supabase.key = supabaseKey;
  if (tableName !== undefined) config.supabase.tableName = tableName;

  saveConfig();

  res.json({ success: true, message: 'Configuration updated' });
});

// Test database connection
app.post('/api/test-db', async (req, res) => {
  try {
    if (!config.supabase.url || !config.supabase.key) {
      return res.status(400).json({
        success: false,
        error: 'Supabase configuration not set'
      });
    }

    const db = new SupabaseDB(config.supabase);

    // Test read
    const { data, error } = await db.supabase
      .from(db.tableName)
      .select('*')
      .limit(1);

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.message,
        details: error
      });
    }

    // Test insert
    const testUrl = `https://test-${Date.now()}.example.com`;
    const testUuid = 'test-uuid-' + Date.now();
    const inserted = await db.addSubmission(testUrl, testUuid, 'pending');

    if (!inserted) {
      return res.status(400).json({
        success: false,
        error: 'Failed to insert test record'
      });
    }

    // Clean up
    await db.supabase
      .from(db.tableName)
      .delete()
      .eq('url', testUrl);

    res.json({ success: true, message: 'Database connection successful' });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Report URLs
app.post('/api/report', async (req, res) => {
  const { urls } = req.body;

  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'URLs array is required' });
  }

  if (!config.email) {
    return res.status(400).json({ error: 'Email not configured' });
  }

  if (!config.supabase.url || !config.supabase.key) {
    return res.status(400).json({ error: 'Supabase not configured' });
  }

  // Start async processing
  const jobId = Date.now().toString();

  res.json({ success: true, jobId, message: 'Processing started' });

  // Process in background
  processUrls(urls, jobId);
});

// URL validation and normalization helper
function normalizeAndValidateUrl(urlString) {
  try {
    // Trim whitespace
    urlString = urlString.trim();

    // If URL doesn't start with http:// or https://, add https://
    if (!urlString.startsWith('http://') && !urlString.startsWith('https://')) {
      urlString = 'https://' + urlString;
    }

    // Try to parse the URL
    const url = new URL(urlString);

    // Validate protocol
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { valid: false, url: null };
    }

    // Return normalized URL
    return { valid: true, url: url.href };
  } catch (e) {
    return { valid: false, url: null };
  }
}

async function processUrls(urls, jobId) {
  const socketRoom = `job-${jobId}`;

  // Register this job as active
  activeJobs.set(jobId, { cancelled: false });

  try {
    const db = new SupabaseDB(config.supabase);
    const api = new NetcraftAPI(config.email, config.apiKey);

    // Helper to check if job is cancelled
    const isCancelled = () => activeJobs.get(jobId)?.cancelled === true;

    // Enforce 50k URL limit per submission
    const MAX_URLS = 50000;
    let remainingUrls = 0;

    if (urls.length > MAX_URLS) {
      remainingUrls = urls.length - MAX_URLS;
      console.log(`⚠️ URL limit exceeded: ${urls.length} URLs submitted, processing first ${MAX_URLS} URLs`);
      urls = urls.slice(0, MAX_URLS);

      io.to(socketRoom).emit('url-limit-warning', {
        total: urls.length + remainingUrls,
        processing: MAX_URLS,
        remaining: remainingUrls,
        message: `⚠️ Submitted ${urls.length + remainingUrls} URLs. Processing first ${MAX_URLS} URLs. Please submit the remaining ${remainingUrls} URLs separately.`
      });
    }

    io.to(socketRoom).emit('progress', {
      stage: 'validating',
      message: 'Validating URLs...',
      progress: 0
    });

    // Validate and filter URLs
    const validUrls = [];
    const invalidUrls = [];
    const normalizedUrlsMap = new Map(); // Use Map to track original -> normalized mapping
    let normalizedUrls = [];

    // First pass: validate and normalize all URLs
    for (let i = 0; i < urls.length; i++) {
      // Check if cancelled
      if (isCancelled()) {
        io.to(socketRoom).emit('stopped');
        activeJobs.delete(jobId);
        return;
      }

      const originalUrl = urls[i];

      // Validate and normalize URL format
      const { valid, url: normalizedUrl } = normalizeAndValidateUrl(originalUrl);

      if (!valid) {
        invalidUrls.push(originalUrl);
        continue;
      }

      // Store mapping and deduplicate within the upload
      if (!normalizedUrlsMap.has(normalizedUrl)) {
        normalizedUrlsMap.set(normalizedUrl, originalUrl);
        normalizedUrls.push(normalizedUrl);
      }

      if ((i + 1) % 100 === 0 || i === urls.length - 1) {
        io.to(socketRoom).emit('progress', {
          stage: 'validating',
          message: `Validated ${i + 1}/${urls.length} URLs (${normalizedUrls.length} unique)`,
          progress: ((i + 1) / urls.length) * 10
        });
      }
    }

    // Check for existing URLs in batches for better performance
    io.to(socketRoom).emit('progress', {
      stage: 'validating',
      message: 'Checking for duplicate URLs...',
      progress: 12
    });

    const DEDUP_BATCH_SIZE = 500;
    const existingUrlsSet = new Set();

    for (let i = 0; i < normalizedUrls.length; i += DEDUP_BATCH_SIZE) {
      if (isCancelled()) {
        io.to(socketRoom).emit('stopped');
        activeJobs.delete(jobId);
        return;
      }

      const batch = normalizedUrls.slice(i, i + DEDUP_BATCH_SIZE);
      const { data, error } = await db.supabase
        .from(db.tableName)
        .select('url')
        .in('url', batch);

      if (!error && data) {
        data.forEach(row => existingUrlsSet.add(row.url));
      }
    }

    let skipped = 0;
    normalizedUrls.forEach(url => {
      if (existingUrlsSet.has(url)) {
        skipped++;
      } else {
        validUrls.push(url);
      }
    });

    // Batch insert invalid URLs AFTER deduplication check
    if (invalidUrls.length > 0) {
      // Deduplicate invalid URLs too
      const uniqueInvalidUrls = [...new Set(invalidUrls)];
      const invalidSubmissions = uniqueInvalidUrls.map(url => ({
        url,
        uuid: null,
        reported_at: new Date().toISOString(),
        state: 'failed',
        tags: [],
        error: 'Invalid URL format'
      }));

      try {
        await db.supabase.from(db.tableName).insert(invalidSubmissions);
      } catch (err) {
        console.error('Error batch inserting invalid URLs:', err);
        // Ignore duplicate key errors - URL might already be in DB
      }
    }

    io.to(socketRoom).emit('progress', {
      stage: 'validating',
      message: `Found ${validUrls.length} new URLs (${skipped} already reported)`,
      progress: 15
    });

    // Report invalid URLs to user
    if (invalidUrls.length > 0) {
      io.to(socketRoom).emit('invalid-urls', {
        count: invalidUrls.length,
        urls: invalidUrls.slice(0, 10), // Send first 10 as examples
        message: `Found ${invalidUrls.length} invalid URL(s) - these have been marked as failed`
      });
    }

    const urlsToReport = validUrls;

    if (urlsToReport.length === 0) {
      io.to(socketRoom).emit('complete', {
        success: true,
        total: urls.length,
        reported: 0,
        skipped: skipped,
        failed: 0,
        invalid: invalidUrls.length
      });
      return;
    }

    io.to(socketRoom).emit('progress', {
      stage: 'submitting',
      message: `Submitting ${urlsToReport.length} URLs to Netcraft...`,
      progress: 20
    });

    // Batch submit
    const BATCH_SIZE = 1000;
    let totalReported = 0;
    let totalFailed = 0;

    for (let i = 0; i < urlsToReport.length; i += BATCH_SIZE) {
      // Check if cancelled
      if (isCancelled()) {
        io.to(socketRoom).emit('stopped');
        activeJobs.delete(jobId);
        return;
      }

      const batch = urlsToReport.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(urlsToReport.length / BATCH_SIZE);

      io.to(socketRoom).emit('progress', {
        stage: 'submitting',
        message: `Submitting batch ${batchNum}/${totalBatches} (${batch.length} URLs)...`,
        progress: 20 + ((i / urlsToReport.length) * 20)
      });

      let result;
      try {
        result = await api.reportUrls(batch);
      } catch (apiError) {
        console.error(`Error submitting batch ${batchNum}:`, apiError);

        // Mark batch as failed and continue with next batch
        const failedSubmissions = batch.map(url => ({
          url,
          uuid: null,
          reported_at: new Date().toISOString(),
          state: 'failed',
          tags: [],
          error: `API Error: ${apiError.message || 'Network error'}`
        }));

        try {
          await db.supabase.from(db.tableName).insert(failedSubmissions);
        } catch (err) {
          console.error('Error inserting failed batch:', err);
        }

        totalFailed += batch.length;

        // Notify user of batch failure
        io.to(socketRoom).emit('batch-error', {
          batchNum,
          totalBatches,
          error: apiError.message || 'Network error',
          message: `Batch ${batchNum}/${totalBatches} failed - continuing with next batch`
        });

        continue; // Continue with next batch instead of stopping
      }

      // Check if cancelled after API call
      if (isCancelled()) {
        io.to(socketRoom).emit('stopped');
        activeJobs.delete(jobId);
        return;
      }

      if (result.limitReached) {
        // Mark remaining URLs as failed with rate limit message
        const remainingUrls = urlsToReport.slice(i);
        for (const url of remainingUrls) {
          await db.addSubmission(url, null, 'failed', 'Rate limit reached');
        }
        totalFailed += remainingUrls.length;

        // Send detailed error message
        io.to(socketRoom).emit('rate-limit', {
          message: 'Rate limit reached on Netcraft API. Please try again after some time.',
          processed: i,
          total: urlsToReport.length,
          remaining: remainingUrls.length
        });

        // Send completion with partial results
        io.to(socketRoom).emit('complete', {
          success: false,
          rateLimitReached: true,
          total: urls.length,
          reported: totalReported,
          skipped: skipped,
          failed: totalFailed,
          invalid: invalidUrls.length,
          message: `⚠️ Rate limit reached! Successfully reported ${totalReported} URLs. ${remainingUrls.length} URLs were not submitted.`
        });
        return;
      }

      if (!result.success) {
        // Batch insert failed URLs for better performance
        const failedSubmissions = batch.map(url => ({
          url,
          uuid: null,
          reported_at: new Date().toISOString(),
          state: 'failed',
          tags: [],
          error: result.error || 'Unknown error'
        }));

        try {
          await db.supabase.from(db.tableName).insert(failedSubmissions);
        } catch (err) {
          console.error('Error inserting failed URLs:', err);
          // Fallback to individual inserts
          for (const url of batch) {
            if (isCancelled()) break;  // Check cancellation
            await db.addSubmission(url, null, 'failed', result.error);
          }
        }

        totalFailed += batch.length;

        // Check if cancelled after handling failures
        if (isCancelled()) {
          io.to(socketRoom).emit('stopped');
          activeJobs.delete(jobId);
          return;
        }

        continue;
      }

      const submissionUuid = result.uuid;

      console.log(`✅ Batch ${batchNum}/${totalBatches}: Netcraft API success - UUID: ${submissionUuid}`);

      // Store with batch UUID
      io.to(socketRoom).emit('progress', {
        stage: 'storing',
        message: 'Storing URLs in database...',
        progress: 40 + ((i / urlsToReport.length) * 10)
      });

      // Double-check for duplicates right before inserting
      // (in case another process inserted between our check and now)
      const { data: recentCheck } = await db.supabase
        .from(db.tableName)
        .select('url')
        .in('url', batch);

      const recentlyAddedUrls = new Set(recentCheck?.map(r => r.url) || []);
      const urlsToInsert = batch.filter(url => !recentlyAddedUrls.has(url));

      if (urlsToInsert.length === 0) {
        // All URLs were already inserted by another process - skip this batch
        console.log(`Skipping batch ${batchNum}/${totalBatches} - all ${batch.length} URLs already exist`);
        totalReported += batch.length; // Count them as "reported" since they already exist with UUID
        continue;
      }

      if (urlsToInsert.length < batch.length) {
        // Some URLs already exist
        const skippedInBatch = batch.length - urlsToInsert.length;
        console.log(`Batch ${batchNum}: Inserting ${urlsToInsert.length}, skipping ${skippedInBatch} duplicates`);
        totalReported += skippedInBatch; // Count skipped ones as already reported
      }

      // Batch insert to database for better performance
      const submissions = urlsToInsert.map(url => ({
        url,
        uuid: submissionUuid,
        reported_at: new Date().toISOString(),
        state: 'pending',
        tags: [],
        error: null
      }));

      try {
        const { data, error } = await db.supabase
          .from(db.tableName)
          .insert(submissions)
          .select();

        if (error) {
          console.error('Batch insert error:', error);

          // If it's a duplicate key error, skip those URLs (already reported)
          if (error.code === '23505' || error.message?.includes('duplicate key')) {
            console.log('Duplicate key error - URLs already exist, skipping...');
            // Don't try to update - just skip since they're already in DB
            // The Netcraft API already has these URLs submitted
            totalReported += urlsToInsert.length;
          } else {
            // Fall back to individual inserts for other errors
            let insertedCount = 0;
            for (const url of urlsToInsert) {
              const inserted = await db.addSubmission(url, submissionUuid);
              if (inserted) insertedCount++;
            }
            totalReported += insertedCount;
          }
        } else {
          totalReported += (data?.length || urlsToInsert.length);
          console.log(`✅ Batch ${batchNum}/${totalBatches}: Stored ${data?.length || urlsToInsert.length} URLs in database`);
        }
      } catch (err) {
        console.error(`❌ Batch ${batchNum}/${totalBatches}: Exception in batch insert:`, err);
        // Fall back to individual inserts
        let insertedCount = 0;
        for (const url of urlsToInsert) {
          const inserted = await db.addSubmission(url, submissionUuid);
          if (inserted) insertedCount++;
        }
        totalReported += insertedCount;
        console.log(`✅ Batch ${batchNum}/${totalBatches}: Stored ${insertedCount} URLs via fallback`);
      }

      io.to(socketRoom).emit('progress', {
        stage: 'storing',
        message: `Stored ${batch.length} URLs with batch UUID`,
        progress: 70 + ((i / urlsToReport.length) * 20)
      });

      if (i + BATCH_SIZE < urlsToReport.length) {
        await sleep(1000);
      }
    }

    console.log(`✅ COMPLETE: Reported ${totalReported}, Skipped ${skipped}, Failed ${totalFailed}, Invalid ${invalidUrls.length}`);

    io.to(socketRoom).emit('complete', {
      success: true,
      total: urls.length,
      reported: totalReported,
      skipped: skipped,
      failed: totalFailed,
      invalid: invalidUrls.length
    });

  } catch (error) {
    io.to(socketRoom).emit('error', {
      message: error.message
    });
  } finally {
    // Clean up job from active jobs
    activeJobs.delete(jobId);
  }
}

// Get all submissions
app.get('/api/submissions', async (req, res) => {
  try {
    if (!config.supabase.url || !config.supabase.key) {
      return res.status(400).json({ error: 'Supabase not configured' });
    }

    const db = new SupabaseDB(config.supabase);
    const filter = req.query.state ? { state: req.query.state } : {};
    const submissions = await db.getAllSubmissions(filter);

    res.json({ success: true, submissions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get statistics
app.get('/api/stats', async (req, res) => {
  try {
    if (!config.supabase.url || !config.supabase.key) {
      return res.status(400).json({ error: 'Supabase not configured' });
    }

    const db = new SupabaseDB(config.supabase);
    const stats = await db.getStats();

    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check statuses
app.post('/api/check-statuses', async (req, res) => {
  try {
    if (!config.supabase.url || !config.supabase.key) {
      return res.status(400).json({ error: 'Supabase not configured' });
    }

    const db = new SupabaseDB(config.supabase);
    const api = new NetcraftAPI(config.email, config.apiKey);

    const submissions = await db.getPendingSubmissions();

    if (submissions.length === 0) {
      return res.json({ success: true, message: 'No pending submissions', updated: 0 });
    }

    // Group submissions by batch UUID
    const batches = {};
    submissions.forEach(submission => {
      if (!batches[submission.uuid]) {
        batches[submission.uuid] = [];
      }
      batches[submission.uuid].push(submission);
    });

    const totalBatches = Object.keys(batches).length;
    let updated = 0;
    let batchesProcessed = 0;

    console.log(`Starting status check for ${submissions.length} URLs across ${totalBatches} batches`);

    // Check each batch
    for (const [batchUuid, batchSubmissions] of Object.entries(batches)) {
      batchesProcessed++;
      const result = await api.getSubmissionUrls(batchUuid);

      if (result.success && result.data.urls) {
        const apiUrls = result.data.urls;

        // Collect all updates for this batch (don't update one-by-one!)
        const updates = [];

        for (const apiUrl of apiUrls) {
          // Find matching submission (handle trailing slash normalization)
          const matchingSubmission = batchSubmissions.find(sub =>
            sub.url === apiUrl.url ||
            sub.url + '/' === apiUrl.url ||
            sub.url === apiUrl.url.replace(/\/$/, '')
          );

          if (matchingSubmission) {
            const tagNames = apiUrl.tags && Array.isArray(apiUrl.tags)
              ? apiUrl.tags.map(tag => tag.name || tag).filter(name => name)
              : [];

            updates.push({
              url: matchingSubmission.url,
              state: apiUrl.url_state,
              tags: tagNames,
              reported_at: matchingSubmission.reported_at,
              uuid: matchingSubmission.uuid,
              error: matchingSubmission.error
            });
          }
        }

        // Update URLs in chunks to avoid overwhelming Supabase connections
        if (updates.length > 0) {
          try {
            // Update in chunks of 50 at a time (prevents "fetch failed" errors)
            const CHUNK_SIZE = 50;
            let successCount = 0;

            for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
              const chunk = updates.slice(i, i + CHUNK_SIZE);

              const updatePromises = chunk.map(update =>
                db.updateSubmissionByUrl(update.url, {
                  state: update.state,
                  tags: update.tags
                })
              );

              await Promise.all(updatePromises);
              successCount += chunk.length;
            }

            updated += successCount;
            console.log(`[${batchesProcessed}/${totalBatches}] Batch ${batchUuid}: Updated ${successCount} URLs`);
          } catch (err) {
            console.error(`Exception in batch ${batchUuid} update:`, err);
            // Fallback to sequential updates if parallel fails
            let fallbackCount = 0;
            for (const update of updates) {
              try {
                await db.updateSubmissionByUrl(update.url, {
                  state: update.state,
                  tags: update.tags
                });
                fallbackCount++;
              } catch (updateErr) {
                console.error(`Failed to update ${update.url}:`, updateErr.message);
              }
            }
            updated += fallbackCount;
            console.log(`[${batchesProcessed}/${totalBatches}] Batch ${batchUuid}: Updated ${fallbackCount} URLs (fallback)`);
          }
        }
      } else {
        console.log(`[${batchesProcessed}/${totalBatches}] Batch ${batchUuid}: API call failed or no data`);
      }

      await sleep(500);
    }

    console.log(`✅ Status check complete: Updated ${updated} URLs across ${totalBatches} batches`);
    res.json({ success: true, updated, total: submissions.length, batches: totalBatches });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete submissions
app.post('/api/delete-submissions', async (req, res) => {
  try {
    if (!config.supabase.url || !config.supabase.key) {
      return res.status(400).json({ error: 'Supabase not configured' });
    }

    const { urls } = req.body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'Invalid URLs array' });
    }

    const db = new SupabaseDB(config.supabase);
    const result = await db.deleteSubmissions(urls);

    if (result.success) {
      res.json({ success: true, deleted: result.deleted });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear cache - delete URLs in final states
app.post('/api/clear-cache', async (req, res) => {
  try {
    if (!config.supabase.url || !config.supabase.key) {
      return res.status(400).json({ error: 'Supabase not configured' });
    }

    const db = new SupabaseDB(config.supabase);

    // Delete URLs in final states: no threats, failed, rejected, unavailable
    const { data, error } = await db.supabase
      .from(db.tableName)
      .delete()
      .in('state', ['no threats', 'failed', 'rejected', 'unavailable']);

    if (error) {
      console.error('Error clearing cache:', error);
      return res.status(500).json({ error: error.message });
    }

    // Count how many were deleted
    const deletedCount = data?.length || 0;
    console.log(`✅ Cache cleared: Deleted ${deletedCount} URLs in final states`);

    res.json({
      success: true,
      deleted: deletedCount,
      message: `Cleared ${deletedCount} URLs from cache (no threats, failed, rejected, unavailable)`
    });
  } catch (error) {
    console.error('Exception clearing cache:', error);
    res.status(500).json({ error: error.message });
  }
});

// Upload file
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const content = fs.readFileSync(req.file.path, 'utf8');
    const urls = content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line); // Accept all non-empty lines, validation happens in processUrls

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({ success: true, urls });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Socket.IO connection
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join-job', (jobId) => {
    socket.join(`job-${jobId}`);
    console.log(`Client ${socket.id} joined job ${jobId}`);
  });

  socket.on('stop-job', (jobId) => {
    console.log(`Stop requested for job ${jobId} by ${socket.id}`);
    const job = activeJobs.get(jobId);
    if (job) {
      job.cancelled = true;
      io.to(`job-${jobId}`).emit('stopped');
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    // Note: We don't cancel jobs on disconnect to prevent orphan process issues
    // Jobs will continue running even if client disconnects
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║        Netcraft Reporter Web Application                   ║
╠════════════════════════════════════════════════════════════╣
║  Server running on: http://localhost:${PORT}                 ║
║  API endpoint: http://localhost:${PORT}/api                  ║
╚════════════════════════════════════════════════════════════╝
  `);
});
