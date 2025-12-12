// Standalone script to export credited URLs to a text file
// Usage: node export-credited-urls.js

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Read config from config.json
let config = {
  supabase: {
    url: '',
    key: '',
    tableName: 'netcraft_submissions'
  }
};

const CONFIG_FILE = 'config.json';
if (fs.existsSync(CONFIG_FILE)) {
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    console.log('Configuration loaded from config.json');
  } catch (err) {
    console.error('Error loading config.json:', err.message);
  }
} else {
  console.error('config.json not found!');
  process.exit(1);
}

async function exportCreditedUrls() {
  try {
    console.log('Connecting to Supabase...');
    const supabase = createClient(config.supabase.url, config.supabase.key);

    console.log('Fetching all URLs with "credited" tag...');

    // Fetch all URLs in batches (pagination)
    const pageSize = 1000;
    let allCreditedUrls = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from(config.supabase.tableName)
        .select('url, tags')
        .range(page * pageSize, (page + 1) * pageSize - 1)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching data:', error);
        break;
      }

      if (data && data.length > 0) {
        // Filter URLs that have "credited" tag
        const creditedInBatch = data.filter(item =>
          item.tags && Array.isArray(item.tags) && item.tags.includes('credited')
        );

        allCreditedUrls = allCreditedUrls.concat(creditedInBatch.map(item => item.url));

        console.log(`Fetched page ${page + 1}: Found ${creditedInBatch.length} credited URLs (${allCreditedUrls.length} total)`);

        page++;
        hasMore = data.length === pageSize;
      } else {
        hasMore = false;
      }
    }

    if (allCreditedUrls.length === 0) {
      console.log('No credited URLs found.');
      return;
    }

    // Save to text file
    const filename = 'credited-urls.txt';
    fs.writeFileSync(filename, allCreditedUrls.join('\n'));

    console.log(`\n✅ Success! Exported ${allCreditedUrls.length} credited URLs to ${filename}`);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

exportCreditedUrls();
