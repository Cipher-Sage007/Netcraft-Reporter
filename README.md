# 🛡️ Netcraft Reporter - Dockerized Web Application

A production-ready, containerized web application for reporting malicious URLs to Netcraft with real-time progress tracking and comprehensive management capabilities.

[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://www.docker.com/)
[![Node.js](https://img.shields.io/badge/Node.js-18.x-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 🚀 Quick Start with Docker

```bash
# 1. Clone and navigate
git clone <repository-url>
cd "Netcraft Reporter"

# 2. Create configuration
cp config.example.json config.json
# Edit config.json with your email and Supabase credentials

# 3. Start the application
docker-compose up -d

# 4. Open browser
# http://localhost:3000
```

**That's it!** 🎉

---

## ✨ Features

- **Batch URL Submission** - Report up to 1000 URLs at once
- **Real-time Progress** - Live updates via WebSocket
- **Drag & Drop Upload** - Upload .txt files with URLs
- **Interactive Table** - Sort, search, and filter submissions
- **Rate Limit Handling** - Graceful notifications
- **Auto-refresh** - Updates every 30 seconds
- **Web-based Configuration** - No code editing required
- **Docker Support** - One-command deployment

---

## 📋 Prerequisites

- **Docker** 20.10+ and **Docker Compose** 1.29+
- **Supabase** account (free tier available)

---

## 📖 Full Documentation

| Document | Description |
|----------|-------------|
| [QUICKSTART.md](QUICKSTART.md) | 5-minute setup guide |
| [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) | Complete architecture documentation |
| [config.example.json](config.example.json) | Example configuration |

---

## 🐳 Docker Deployment

### Start Application
```bash
docker-compose up -d
```

### View Logs
```bash
docker-compose logs -f
```

### Stop Application
```bash
docker-compose down
```

### Rebuild After Updates
```bash
docker-compose up -d --build
```

---

## ⚙️ Configuration

Create `config.json` from the example:

```json
{
  "email": "your-email@example.com",
  "apiKey": "",
  "supabase": {
    "url": "https://your-project.supabase.co",
    "key": "your-supabase-anon-key",
    "tableName": "netcraft_submissions"
  }
}
```

Or configure via the web interface at http://localhost:3000 → Configuration tab.

---

## 🗄️ Database Setup

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. In SQL Editor, run:

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

3. Get credentials from Settings → API
4. Enter in the Configuration tab or `config.json`

---

## 💻 Manual Installation (Without Docker)

```bash
# Install dependencies
npm install

# Create configuration
cp config.example.json config.json
# Edit config.json

# Start server
npm start

# Development mode with auto-reload
npm run dev
```

---

## 📊 Usage

### Submitting URLs

1. **Paste URLs:** Enter URLs (one per line) in the text area
2. **Upload File:** Drag & drop a .txt file with URLs
3. **Submit:** Click "Submit URLs" and watch real-time progress

### Viewing Submissions

1. Go to "View Submissions" tab
2. Use search box to find URLs/UUIDs
3. Click filters to show specific states
4. Click column headers to sort
5. Auto-refreshes every 30 seconds

### Checking Status

Click "Check Status Updates" to fetch latest analysis results from Netcraft.

---

## 🏗️ Architecture

```
Browser (React) ←→ Express.js + Socket.IO ←→ Netcraft API
                          ↓
                    Supabase (PostgreSQL)
```

**See [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) for detailed architecture**

---

## 🔧 Troubleshooting

### Container Won't Start
```bash
docker-compose logs
```

Common issues:
- Port 3000 in use → Change port in `docker-compose.yml`
- Missing `config.json` → Copy from `config.example.json`

### Database Connection Failed
- Verify Supabase URL and key
- Check table exists
- Disable RLS: `ALTER TABLE netcraft_submissions DISABLE ROW LEVEL SECURITY;`

### Rate Limit Reached
- Wait 15-30 minutes
- Get Netcraft API key for higher limits

---

## 🔐 Security

- Never commit `config.json`
- Use environment variables in production
- Enable HTTPS with reverse proxy
- Set up Row Level Security in Supabase
- Implement authentication for multi-user setups

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/config` | Get configuration |
| POST | `/api/config` | Update configuration |
| POST | `/api/test-db` | Test database |
| POST | `/api/report` | Submit URLs |
| GET | `/api/submissions` | List submissions |
| GET | `/api/stats` | Get statistics |
| POST | `/api/check-statuses` | Check updates |
| POST | `/api/upload` | Upload file |

---

## 🚀 Production Deployment

### Recommended Setup

```
NGINX (Reverse Proxy + SSL)
    ↓
Docker Container (Application)
    ↓
Supabase (Database)
```

### Production Checklist

- [ ] Use HTTPS (SSL/TLS)
- [ ] Set up NGINX reverse proxy
- [ ] Configure firewall
- [ ] Enable authentication
- [ ] Set up monitoring
- [ ] Configure backups
- [ ] Use environment variables

---

## 🤝 Contributing

Contributions welcome! Submit issues and pull requests on GitHub.

---

## 📄 License

MIT License - Free to use and modify.

---

## 🙏 Credits

- [Netcraft](https://www.netcraft.com/) - URL threat intelligence
- [Supabase](https://supabase.com/) - Database platform
- [Docker](https://www.docker.com/) - Containerization

---

**Made with ❤️ for the security community**
