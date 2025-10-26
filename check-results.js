// Check what was stored in the database

async function checkResults() {
  console.log('=== Checking Database Results ===\n');

  const res = await fetch('http://localhost:3000/api/submissions');
  const data = await res.json();

  if (data.success) {
    // Filter to only show our test URLs
    const testUrls = data.submissions.filter(sub =>
      sub.url.includes('google.com') ||
      sub.url.includes('example.com') ||
      sub.url.includes('github.com') ||
      sub.url.includes('ftp://') ||
      sub.url.includes('javascript:') ||
      sub.url.includes('valid-url') ||
      sub.url.includes('192.168') ||
      sub.url.includes('stackoverflow.com') ||
      sub.url.includes('not a url') ||
      sub.url.includes('this is just text')
    ).sort((a, b) => new Date(b.reported_at) - new Date(a.reported_at)).slice(0, 10);

    console.log(`Found ${testUrls.length} test submissions:\n`);

    testUrls.forEach((sub, i) => {
      console.log(`${i + 1}. ${sub.url}`);
      console.log(`   State: ${sub.state}`);
      console.log(`   Error: ${sub.error || 'None'}`);
      console.log('');
    });
  } else {
    console.error('Failed to fetch submissions');
  }
}

checkResults().catch(console.error);
