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
app.use(express.json());
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

  async getSubmissionUrls(batchUuid) {
    const headers = {};

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    try {
      const response = await fetch(`${this.baseUrl}/submission/${batchUuid}/urls`, {
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
    const completed = data.filter(s => ['no threats', 'suspicious', 'malicious'].includes(s.state)).length;
    const pending = data.filter(s => s.state === 'pending').length;
    const processing = data.filter(s => s.state === 'processing').length;

    return { total, reported, failed, completed, pending, processing };
  }

  async getPendingSubmissions() {
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
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

async function processUrls(urls, jobId) {
  const socketRoom = `job-${jobId}`;

  try {
    const db = new SupabaseDB(config.supabase);
    const api = new NetcraftAPI(config.email, config.apiKey);

    io.to(socketRoom).emit('progress', {
      stage: 'filtering',
      message: 'Checking for already reported URLs...',
      progress: 0
    });

    // Filter out already reported URLs
    const urlsToReport = [];
    let skipped = 0;

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const existing = await db.findByUrl(url);

      if (existing) {
        skipped++;
      } else {
        urlsToReport.push(url);
      }

      io.to(socketRoom).emit('progress', {
        stage: 'filtering',
        message: `Checked ${i + 1}/${urls.length} URLs`,
        progress: ((i + 1) / urls.length) * 20
      });
    }

    if (urlsToReport.length === 0) {
      io.to(socketRoom).emit('complete', {
        success: true,
        total: urls.length,
        reported: 0,
        skipped: skipped,
        failed: 0
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
      const batch = urlsToReport.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(urlsToReport.length / BATCH_SIZE);

      io.to(socketRoom).emit('progress', {
        stage: 'submitting',
        message: `Submitting batch ${batchNum}/${totalBatches} (${batch.length} URLs)...`,
        progress: 20 + ((i / urlsToReport.length) * 20)
      });

      const result = await api.reportUrls(batch);

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
          message: `⚠️ Rate limit reached! Successfully reported ${totalReported} URLs. ${remainingUrls.length} URLs were not submitted.`
        });
        return;
      }

      if (!result.success) {
        for (const url of batch) {
          await db.addSubmission(url, null, 'failed', result.error);
        }
        totalFailed += batch.length;
        continue;
      }

      const submissionUuid = result.uuid;

      // Store with batch UUID
      io.to(socketRoom).emit('progress', {
        stage: 'storing',
        message: 'Storing URLs in database...',
        progress: 40 + ((i / urlsToReport.length) * 10)
      });

      let insertedCount = 0;
      for (const url of batch) {
        const inserted = await db.addSubmission(url, submissionUuid);
        if (inserted) insertedCount++;
      }

      totalReported += insertedCount;

      io.to(socketRoom).emit('progress', {
        stage: 'storing',
        message: `Stored ${insertedCount} URLs with batch UUID`,
        progress: 70 + ((i / urlsToReport.length) * 20)
      });

      if (i + BATCH_SIZE < urlsToReport.length) {
        await sleep(1000);
      }
    }

    io.to(socketRoom).emit('complete', {
      success: true,
      total: urls.length,
      reported: totalReported,
      skipped: skipped,
      failed: totalFailed
    });

  } catch (error) {
    io.to(socketRoom).emit('error', {
      message: error.message
    });
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

    let updated = 0;

    // Check each batch
    for (const [batchUuid, batchSubmissions] of Object.entries(batches)) {
      const result = await api.getSubmissionUrls(batchUuid);

      if (result.success && result.data.urls) {
        const apiUrls = result.data.urls;

        // Update each URL in the batch
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

            await db.updateSubmissionByUrl(matchingSubmission.url, {
              state: apiUrl.url_state,
              tags: tagNames
            });
            updated++;
          }
        }
      }

      await sleep(500);
    }

    res.json({ success: true, updated, total: submissions.length });
  } catch (error) {
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
      .filter(line => line && (line.startsWith('http://') || line.startsWith('https://')));

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

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
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
