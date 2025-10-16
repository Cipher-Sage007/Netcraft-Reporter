# 🚀 Quick Start Guide

Get started with Netcraft Reporter Web App in 5 minutes!

## Step 1: Install Dependencies (1 minute)

```bash
cd "/Users/sunthar/Downloads/Netcraft Reporter"
npm install
```

Wait for all packages to download and install.

## Step 2: Start the Server (10 seconds)

```bash
npm start
```

You should see:
```
╔════════════════════════════════════════════════════════════╗
║        Netcraft Reporter Web Application                   ║
╠════════════════════════════════════════════════════════════╣
║  Server running on: http://localhost:3000                  ║
║  API endpoint: http://localhost:3000/api                   ║
╚════════════════════════════════════════════════════════════╝
```

## Step 3: Open the Web App (5 seconds)

Open your browser and go to:
```
http://localhost:3000
```

## Step 4: Set Up Supabase (2 minutes)

### 4a. Create Supabase Project
1. Go to https://supabase.com (sign up if needed)
2. Click "New Project"
3. Choose a name, database password, and region
4. Wait for project to be created (~2 minutes)

### 4b. Create the Database Table
1. In your Supabase dashboard, click "SQL Editor"
2. Click "New Query"
3. Copy this SQL and paste it:

```sql
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

CREATE INDEX idx_netcraft_url ON netcraft_submissions(url);
CREATE INDEX idx_netcraft_uuid ON netcraft_submissions(uuid);
CREATE INDEX idx_netcraft_state ON netcraft_submissions(state);
CREATE INDEX idx_netcraft_reported_at ON netcraft_submissions(reported_at);
```

4. Click "Run" button
5. You should see "Success. No rows returned"

### 4c. Get Your Credentials
1. Click "Settings" (gear icon) in the left sidebar
2. Click "API"
3. Copy these two values:
   - **Project URL** (looks like: `https://xxxxx.supabase.co`)
   - **anon public key** (long JWT token starting with `eyJ...`)

## Step 5: Configure the App (1 minute)

1. In the web app, click the **"⚙️ Configuration"** tab
2. Fill in:
   - **Email**: Your email address (e.g., `your-email@gmail.com`)
   - **Supabase URL**: Paste the Project URL from Supabase
   - **Supabase Key**: Paste the anon/public key from Supabase
3. Click **"🧪 Test Database Connection"**
   - You should see: ✅ "Database connection successful!"
4. Click **"💾 Save Configuration"**

## Step 6: Report Your First URLs! (30 seconds)

1. Click the **"📤 Submit URLs"** tab
2. Paste some test URLs (one per line):
   ```
   https://google.com
   https://github.com
   https://example.com
   ```
3. Click **"🚀 Submit URLs"**
4. Watch the real-time progress!

## Step 7: View Your Submissions (10 seconds)

1. Click the **"📊 View Submissions"** tab
2. See your submissions in the table
3. Try:
   - Clicking column headers to sort
   - Using the search box
   - Filtering by state

## 🎉 Done!

You're all set! Now you can:

- Report real malicious URLs
- Upload .txt files with bulk URLs
- Track submission statuses
- Monitor analysis results from Netcraft

## 💡 Tips

- **Refresh Status**: Click "🔄 Check Status Updates" to get latest analysis results from Netcraft
- **Search**: Use the search box to find specific URLs or UUIDs
- **Filter**: Click the filter buttons to show only specific states
- **Auto-refresh**: The table automatically refreshes every 30 seconds

## ❓ Troubleshooting

### "Database connection failed"
- Double-check your Supabase URL and key
- Make sure the table was created successfully
- Try running the SQL again in Supabase

### "Configuration required" message
- Make sure you filled in Email, Supabase URL, and Supabase Key
- Click "Test Database Connection" to verify
- Click "Save Configuration"

### Can't see any data
- Check the browser console for errors (F12)
- Check the server console for error messages
- Verify the configuration is saved correctly

## 🆘 Need Help?

Check the full README.md for detailed documentation and troubleshooting.

---

Happy URL reporting! 🛡️
