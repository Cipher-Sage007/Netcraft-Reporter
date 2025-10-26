// Test script to verify invalid URL handling

const io = require('socket.io-client');
const fs = require('fs');

const testUrls = [
  'https://google.com',
  'example.com',
  'not a url at all',
  'github.com/test',
  'ftp://invalid-protocol.com',
  "javascript:alert('xss')",
  'http://valid-url.example.org',
  'this is just text',
  '192.168.1.1',
  'stackoverflow.com/questions/123'
];

async function test() {
  console.log('=== Testing Invalid URL Handling ===\n');
  console.log('Test URLs:');
  testUrls.forEach((url, i) => console.log(`  ${i + 1}. ${url}`));
  console.log('\n');

  // Connect to socket
  const socket = io('http://localhost:3000');

  socket.on('connect', async () => {
    console.log('✅ Connected to server\n');

    // Submit URLs
    console.log('Submitting URLs...\n');
    const res = await fetch('http://localhost:3000/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: testUrls })
    });

    const data = await res.json();
    console.log('Submission response:', data);

    if (data.success) {
      const jobId = data.jobId;
      socket.emit('join-job', jobId);

      socket.on('progress', (progressData) => {
        console.log(`[${progressData.stage}] ${progressData.message} (${Math.round(progressData.progress)}%)`);
      });

      socket.on('invalid-urls', (invalidData) => {
        console.log('\n⚠️  INVALID URLS DETECTED:');
        console.log(`   Count: ${invalidData.count}`);
        console.log(`   Message: ${invalidData.message}`);
        if (invalidData.urls && invalidData.urls.length > 0) {
          console.log('   Examples:');
          invalidData.urls.forEach(url => console.log(`     - ${url}`));
        }
        console.log('');
      });

      socket.on('complete', (result) => {
        console.log('\n=== RESULT ===');
        console.log(`Total URLs: ${result.total}`);
        console.log(`✅ Reported: ${result.reported}`);
        console.log(`⏭️  Skipped: ${result.skipped}`);
        console.log(`❌ Invalid: ${result.invalid || 0}`);
        console.log(`💥 Failed: ${result.failed}`);
        console.log('\n=== TEST COMPLETE ===\n');

        // Verify expectations
        console.log('Expected Results:');
        console.log('  - Valid URLs (should be reported or skipped): 5');
        console.log('    * https://google.com');
        console.log('    * example.com → https://example.com');
        console.log('    * github.com/test → https://github.com/test');
        console.log('    * http://valid-url.example.org');
        console.log('    * stackoverflow.com/questions/123 → https://stackoverflow.com/questions/123');
        console.log('');
        console.log('  - Invalid URLs (should be marked as invalid): 5');
        console.log('    * not a url at all');
        console.log('    * ftp://invalid-protocol.com');
        console.log('    * javascript:alert(\'xss\')');
        console.log('    * this is just text');
        console.log('    * 192.168.1.1');
        console.log('');

        const totalProcessed = result.reported + result.skipped + (result.invalid || 0);
        if (totalProcessed === result.total && result.invalid === 5) {
          console.log('✅ TEST PASSED! Invalid URL handling is working correctly.');
        } else {
          console.log('❌ TEST FAILED! Results don\'t match expectations.');
          console.log(`   Expected invalid: 5, Got: ${result.invalid || 0}`);
        }

        socket.disconnect();
        process.exit(0);
      });

      socket.on('error', (errorData) => {
        console.error('\n❌ ERROR:', errorData.message);
        socket.disconnect();
        process.exit(1);
      });
    } else {
      console.error('❌ Failed to submit:', data.error);
      socket.disconnect();
      process.exit(1);
    }
  });

  socket.on('connect_error', (error) => {
    console.error('❌ Connection error:', error.message);
    process.exit(1);
  });
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
