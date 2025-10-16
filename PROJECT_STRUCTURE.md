# Project Structure

## Netcraft Reporter - File Organization

This document explains the purpose of each file and directory in the project.

---

## Root Directory

```
Netcraft Reporter/
├── server.js                 # Backend server (Express.js + Socket.IO)
├── netcraft-cli.js          # CLI tool (legacy, still functional)
├── package.json             # Dependencies and scripts
├── config.json              # Configuration file (created by user)
├── config.example.json      # Example configuration template
├── Dockerfile               # Docker container definition
├── docker-compose.yml       # Docker orchestration configuration
├── .dockerignore           # Files to exclude from Docker image
├── .gitignore              # Files to exclude from version control
├── README.md                # Main documentation
├── QUICKSTART.md            # 5-minute setup guide
├── SYSTEM_DESIGN.md         # Comprehensive architecture documentation
├── PROJECT_STRUCTURE.md     # This file
├── input.txt               # Example URL list for testing
├── public/                  # Frontend static files
│   └── index.html          # React-based web application (SPA)
└── uploads/                # Temporary file upload directory (auto-created)
```

---

## File Descriptions

### Core Application Files

#### `server.js`
**Purpose:** Main backend server application

**Contains:**
- Express.js HTTP server setup
- Socket.IO WebSocket server
- REST API endpoints
- Background job processor
- NetcraftAPI class (API client)
- SupabaseDB class (database layer)
- File upload handling

**Key Features:**
- Batch URL processing
- Real-time progress updates
- Rate limit handling
- Configuration management
- Database operations

**Lines of Code:** ~700+

---

#### `public/index.html`
**Purpose:** Complete frontend web application

**Contains:**
- React components (via CDN)
- Socket.IO client
- All UI logic and styling
- Three main tabs:
  - Submit URLs
  - View Submissions
  - Configuration

**Key Features:**
- Drag-and-drop file upload
- Real-time progress tracking
- Interactive data table
- Search and filtering
- Responsive design

**Lines of Code:** ~1000+

---

#### `netcraft-cli.js`
**Purpose:** Command-line interface tool (legacy)

**Contains:**
- NetcraftAPI class (standalone)
- SupabaseDB class (standalone)
- CLI command handlers
- Utility functions

**Usage:**
```bash
node netcraft-cli.js report input.txt
node netcraft-cli.js check
node netcraft-cli.js stats
```

**Status:** Still functional, alternative to web interface

**Lines of Code:** ~900+

---

### Configuration Files

#### `config.json`
**Purpose:** Runtime configuration

**Created by:** User (not in repository)

**Contains:**
- Email address
- Netcraft API key (optional)
- Supabase credentials
- Timing parameters

**Security:** Contains sensitive data, never commit to git

---

#### `config.example.json`
**Purpose:** Configuration template

**Use:** Copy to `config.json` and edit

```bash
cp config.example.json config.json
```

---

#### `package.json`
**Purpose:** Node.js project manifest

**Contains:**
- Project metadata
- Dependencies list
- NPM scripts
- Version information

**Scripts:**
- `npm start` - Start production server
- `npm run dev` - Start with auto-reload (nodemon)
- `npm run cli` - Run CLI tool

**Dependencies:**
- `@supabase/supabase-js` - Database client
- `express` - Web framework
- `socket.io` - WebSocket server
- `cors` - CORS middleware
- `multer` - File upload handling

---

### Docker Files

#### `Dockerfile`
**Purpose:** Define Docker container image

**Base Image:** `node:18-alpine`

**Process:**
1. Set working directory
2. Copy package files
3. Install dependencies (production only)
4. Copy application files
5. Create directories
6. Set environment variables
7. Define health check
8. Set startup command

**Result:** Lightweight production-ready container

---

#### `docker-compose.yml`
**Purpose:** Orchestrate Docker containers

**Defines:**
- Service configuration
- Port mappings (3000:3000)
- Volume mounts
- Environment variables
- Health checks
- Network configuration
- Restart policy

**Usage:**
```bash
docker-compose up -d      # Start
docker-compose logs -f    # View logs
docker-compose down       # Stop
```

---

#### `.dockerignore`
**Purpose:** Exclude files from Docker image

**Excludes:**
- `node_modules/` (rebuilt in container)
- `config.json` (mounted as volume)
- `.git/` (not needed in container)
- Documentation files
- IDE files
- Log files

**Benefit:** Smaller, faster Docker builds

---

### Documentation Files

#### `README.md`
**Purpose:** Main project documentation

**Audience:** Users and developers

**Sections:**
- Quick start guide
- Features overview
- Installation methods
- Configuration guide
- Usage instructions
- Troubleshooting
- API reference

**Length:** ~400 lines

---

#### `QUICKSTART.md`
**Purpose:** Fast 5-minute setup guide

**Audience:** New users

**Focus:** Minimal steps to get running

**Length:** ~200 lines

---

#### `SYSTEM_DESIGN.md`
**Purpose:** Comprehensive technical documentation

**Audience:** Developers, architects, contributors

**Sections:**
- Architecture diagrams
- Component descriptions
- Data flow charts
- Technology stack details
- Database schema
- API specifications
- Security considerations
- Scalability discussion
- Deployment guides
- Troubleshooting

**Length:** ~1000+ lines

---

#### `PROJECT_STRUCTURE.md`
**Purpose:** File organization reference (this file)

**Audience:** Developers, contributors

**Focus:** Understanding the codebase structure

---

### Utility Files

#### `.gitignore`
**Purpose:** Exclude files from version control

**Key Exclusions:**
- `node_modules/` - Dependencies (installed via npm)
- `config.json` - Sensitive configuration
- `uploads/` - Temporary uploads
- `.env` - Environment variables
- `.DS_Store` - macOS system files
- Log files

---

#### `input.txt`
**Purpose:** Example URL list for testing

**Contains:** Sample malicious/test URLs

**Usage:** Test the CLI tool or upload in web UI

---

### Directories

#### `public/`
**Purpose:** Static assets served by Express

**Contains:**
- `index.html` - Frontend SPA

**Served at:** `/` (root URL)

---

#### `uploads/` (auto-created)
**Purpose:** Temporary file storage

**Usage:** Stores uploaded .txt files during processing

**Lifecycle:**
1. File uploaded via `/api/upload`
2. Saved to `uploads/`
3. Processed and URLs extracted
4. File deleted

**Note:** Directory is empty by default

---

## File Size Summary

| File | Approximate Size | Lines of Code |
|------|-----------------|---------------|
| `server.js` | ~25 KB | ~700 |
| `public/index.html` | ~40 KB | ~1000 |
| `netcraft-cli.js` | ~30 KB | ~900 |
| `SYSTEM_DESIGN.md` | ~50 KB | ~1000 |
| `README.md` | ~15 KB | ~400 |
| `QUICKSTART.md` | ~8 KB | ~200 |
| **Total** | **~170 KB** | **~4200** |

---

## Dependency Tree

```
Netcraft Reporter
├── Production Dependencies
│   ├── @supabase/supabase-js@2.58.0
│   ├── express@4.18.2
│   ├── socket.io@4.5.4
│   ├── cors@2.8.5
│   └── multer@1.4.5-lts.1
│
├── Development Dependencies
│   └── nodemon@3.0.1
│
└── Frontend (CDN)
    ├── React@18
    ├── ReactDOM@18
    ├── Babel Standalone
    └── Socket.IO Client@4.5.4
```

---

## Data Flow Between Files

```
User Browser
    ↓
public/index.html (React)
    ↓ HTTP POST
server.js (Express API)
    ↓
NetcraftAPI class → Netcraft API
    ↓
SupabaseDB class → Supabase
    ↓
PostgreSQL Database
```

---

## Development Workflow

### 1. Making Changes

```bash
# Edit server code
vim server.js

# Edit frontend
vim public/index.html

# Test locally
npm run dev  # Auto-reload on changes
```

### 2. Testing Changes

```bash
# Test with CLI
node netcraft-cli.js test

# Test with web interface
open http://localhost:3000
```

### 3. Building Docker Image

```bash
# Build and test
docker-compose build
docker-compose up -d

# Verify
docker-compose logs -f
curl http://localhost:3000
```

### 4. Deploying Updates

```bash
# Pull latest code
git pull

# Rebuild and restart
docker-compose up -d --build

# Verify
docker-compose ps
```

---

## Adding New Features

### Backend API Endpoint

**File:** `server.js`

**Steps:**
1. Add route handler in API Routes section
2. Implement business logic
3. Update API documentation in README
4. Test with curl or Postman

**Example:**
```javascript
app.get('/api/new-endpoint', async (req, res) => {
  // Implementation
  res.json({ success: true });
});
```

### Frontend Component

**File:** `public/index.html`

**Steps:**
1. Add new React component function
2. Update App component to include it
3. Add necessary styling in `<style>` section
4. Test in browser

**Example:**
```javascript
function NewComponent() {
  return <div>New Feature</div>;
}
```

### Database Schema Change

**Steps:**
1. Update SQL in documentation
2. Run migration in Supabase
3. Update SupabaseDB class methods
4. Test with sample data

---

## Troubleshooting Files

| Issue | Check File | Look For |
|-------|-----------|----------|
| Server won't start | `server.js` | Port conflicts, syntax errors |
| Config not loading | `config.json` | JSON syntax, required fields |
| API errors | `server.js` | NetcraftAPI class, error handling |
| Database errors | `server.js` | SupabaseDB class, credentials |
| UI not updating | `public/index.html` | WebSocket connection, React state |
| Docker build fails | `Dockerfile`, `.dockerignore` | File paths, dependencies |

---

## Security-Sensitive Files

⚠️ **Never commit these files to public repositories:**

1. `config.json` - Contains API keys and database credentials
2. `.env` - Environment variables
3. `uploads/*` - May contain sensitive URLs
4. `node_modules/` - Dependencies (can be rebuilt)

✅ **Safe to commit:**
- `config.example.json` - Template without secrets
- All documentation files
- Source code files
- `Dockerfile` and `docker-compose.yml`

---

## Build Artifacts

Not included in repository (generated at runtime):

- `node_modules/` - NPM dependencies
- `uploads/` - Temporary uploads
- `config.json` - User configuration
- `package-lock.json` - Locked dependency versions
- Docker images and containers

---

## Backup Recommendations

### Essential Files to Backup

1. `config.json` - Your configuration
2. Supabase database - Your submission data
3. Custom modifications to source files

### Backup Strategy

```bash
# Backup configuration
cp config.json config.backup.json

# Export database (via Supabase dashboard)
# Settings → Database → Export

# Backup entire project
tar -czf netcraft-reporter-backup.tar.gz \
  config.json server.js public/
```

---

This project structure is designed for clarity, maintainability, and ease of deployment. Each file has a specific purpose and minimal dependencies on others.
