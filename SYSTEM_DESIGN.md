# System Design Document

## Netcraft Reporter Web Application

**Version:** 2.0.0
**Last Updated:** 2025
**Author:** Security Tools Team

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [System Components](#system-components)
4. [Data Flow](#data-flow)
5. [Technology Stack](#technology-stack)
6. [Database Schema](#database-schema)
7. [API Design](#api-design)
8. [Security Considerations](#security-considerations)
9. [Scalability](#scalability)
10. [Deployment](#deployment)

---

## Overview

### Purpose
The Netcraft Reporter is a web application designed to streamline the process of reporting malicious URLs to Netcraft's threat intelligence platform. It provides batch processing capabilities, real-time progress tracking, and comprehensive management of submissions.

### Key Features
- Batch URL submission (up to 1000 URLs per batch)
- Real-time progress tracking via WebSocket
- Configurable email and database settings
- Interactive dashboard with sorting, filtering, and search
- Automatic UUID mapping with retry logic
- Rate limit handling
- Status monitoring and updates

### Target Users
- Security researchers
- SOC (Security Operations Center) analysts
- Threat intelligence teams
- IT security professionals

---

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                             │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │          React Single Page Application (SPA)             │   │
│  │  • Submit URLs Tab    • View Submissions Tab            │   │
│  │  • Configuration Tab  • Real-time Progress Display      │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↕ HTTP/WebSocket
┌─────────────────────────────────────────────────────────────────┐
│                      Application Layer                           │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Express.js Server (Node.js)                 │   │
│  │  • REST API Endpoints    • WebSocket Server (Socket.IO) │   │
│  │  • File Upload Handler   • Background Job Processor     │   │
│  │  • Configuration Manager • Rate Limit Handler           │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                    ↕                              ↕
      ┌──────────────────────┐        ┌──────────────────────┐
      │   External Services   │        │   Data Layer         │
      │                       │        │                      │
      │  Netcraft API v3      │        │  Supabase Database   │
      │  • Report URLs        │        │  • PostgreSQL        │
      │  • Get Submission     │        │  • Real-time API     │
      │  • Get URL UUIDs      │        │  • Auto-indexing     │
      └──────────────────────┘        └──────────────────────┘
```

### Component Interaction Flow

```
User Action → Frontend (React) → Backend API → External Service/Database
                  ↓                    ↓
            WebSocket ←────────  Background Job
                  ↓
            Real-time Updates → Frontend
```

---

## System Components

### 1. Frontend (Client-Side)

**Technology:** React 18 (via CDN, no build required)

**Components:**
- **App Component**: Main container, tab management
- **SubmitTab**: URL submission interface with file upload
- **SubmissionsTab**: Interactive table with submissions
- **ConfigTab**: Configuration management UI

**State Management:**
- useState hooks for local component state
- useEffect hooks for side effects and API calls
- useMemo for performance optimization (filtering/sorting)

**Real-time Communication:**
- Socket.IO client for WebSocket connections
- Event handlers for progress updates
- Room-based messaging for job isolation

### 2. Backend (Server-Side)

**Technology:** Node.js with Express.js

**Core Modules:**

#### a. HTTP Server
- Express.js REST API
- CORS middleware for cross-origin requests
- JSON body parser
- Static file serving for frontend

#### b. WebSocket Server
- Socket.IO for bidirectional communication
- Job-based room management
- Event emitters for progress tracking

#### c. API Client Layer
```javascript
NetcraftAPI {
  - reportUrls(urls)          // Batch submit to Netcraft
  - getUrlUuids(uuid, urls)   // Map URLs to individual UUIDs
  - getSubmissionStatus(uuid) // Check analysis status
}
```

#### d. Database Layer
```javascript
SupabaseDB {
  - addSubmission(url, uuid, state, error)
  - updateSubmission(uuid, updates)
  - updateSubmissionByUrl(url, updates)
  - findByUrl(url)
  - getAllSubmissions(filter)
  - getStats()
  - getPendingSubmissions()
}
```

#### e. Background Job Processor
- Async URL processing
- Batch management (1000 URLs per batch)
- Retry logic with exponential backoff
- Rate limit detection and handling

### 3. External Services

#### a. Netcraft API v3
**Base URL:** `https://report.netcraft.com/api/v3`

**Endpoints Used:**
- `POST /report/urls` - Submit URLs for analysis
- `POST /submission/{uuid}/url_uuids` - Get individual UUIDs
- `GET /submission/{uuid}` - Get submission status

**Authentication:** Optional API key via Bearer token

#### b. Supabase (Database)
**Type:** PostgreSQL (managed)

**Features Used:**
- Real-time subscriptions (optional)
- REST API via client library
- Automatic connection pooling
- Row Level Security (RLS)

---

## Data Flow

### 1. URL Submission Flow

```
┌─────────┐
│  User   │ Pastes URLs or uploads file
└────┬────┘
     │
     ↓
┌────────────────┐
│   Frontend     │ Validates URLs, creates job
└───────┬────────┘
        │ HTTP POST /api/report
        ↓
┌────────────────────┐
│   Backend API      │ Returns jobId, starts background process
└───────┬────────────┘
        │
        ↓
┌────────────────────┐
│  Background Job    │
│                    │
│  1. Filter         │ Check database for duplicates
│     duplicates     │
│                    │
│  2. Batch URLs     │ Group into 1000-URL batches
│                    │
│  3. Submit batch   │ → Netcraft API
│                    │
│  4. Store with     │ → Supabase (batch UUID)
│     batch UUID     │
│                    │
│  5. Wait 10s       │ Allow Netcraft to process
│                    │
│  6. Fetch          │ → Netcraft API (individual UUIDs)
│     individual     │
│     UUIDs          │
│                    │
│  7. Update DB      │ → Supabase (individual UUIDs)
│                    │
│  8. Emit events    │ → WebSocket → Frontend
│                    │
└────────────────────┘
```

### 2. Status Check Flow

```
User clicks "Check Status" → Backend API
                                   ↓
                        Query pending submissions
                                   ↓
                        For each submission:
                                   ↓
                          Netcraft API (get status)
                                   ↓
                          Update database
                                   ↓
                        Return updated count
```

### 3. Real-time Progress Flow

```
Background Job          WebSocket           Frontend
     │                     │                    │
     ├─ emit('progress')──→│                    │
     │                     ├──────────────────→ │
     │                     │   Update progress  │
     │                     │   bar & message    │
     │                     │                    │
     ├─ emit('complete')──→│                    │
     │                     ├──────────────────→ │
     │                     │   Show summary     │
```

---

## Technology Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.x | UI framework |
| Socket.IO Client | 4.5.4 | Real-time communication |
| Babel Standalone | Latest | JSX transformation |
| Native CSS | - | Styling |

### Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 18.x LTS | Runtime environment |
| Express.js | 4.18.x | Web framework |
| Socket.IO | 4.5.x | WebSocket server |
| @supabase/supabase-js | 2.58.x | Database client |
| Multer | 1.4.x | File upload handling |
| CORS | 2.8.x | Cross-origin support |

### Database
| Technology | Purpose |
|------------|---------|
| PostgreSQL | Primary database |
| Supabase | Managed PostgreSQL with API |

### Infrastructure
| Technology | Purpose |
|------------|---------|
| Docker | Containerization |
| Docker Compose | Multi-container orchestration |

---

## Database Schema

### Table: `netcraft_submissions`

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
```

### Indexes

```sql
CREATE INDEX idx_netcraft_url ON netcraft_submissions(url);
CREATE INDEX idx_netcraft_uuid ON netcraft_submissions(uuid);
CREATE INDEX idx_netcraft_state ON netcraft_submissions(state);
CREATE INDEX idx_netcraft_reported_at ON netcraft_submissions(reported_at);
```

### Field Descriptions

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| id | BIGSERIAL | Auto-incrementing primary key | PRIMARY KEY |
| url | TEXT | The reported URL | NOT NULL |
| uuid | TEXT | Netcraft submission UUID | Nullable (NULL for failed submissions) |
| reported_at | TIMESTAMPTZ | When the URL was reported | NOT NULL, DEFAULT NOW() |
| state | TEXT | Current status | NOT NULL, DEFAULT 'pending' |
| tags | TEXT[] | Analysis tags from Netcraft | DEFAULT '{}' |
| error | TEXT | Error message if failed | Nullable |
| created_at | TIMESTAMPTZ | Record creation timestamp | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | Last update timestamp | DEFAULT NOW() |

### State Values

| State | Description |
|-------|-------------|
| `pending` | Submitted to Netcraft, awaiting analysis |
| `processing` | Netcraft is analyzing the URL |
| `no threats` | Analysis complete - no threats detected |
| `suspicious` | Analysis complete - suspicious content |
| `malicious` | Analysis complete - malicious confirmed |
| `failed` | Submission failed (see error field) |

---

## API Design

### REST Endpoints

#### GET /api/config
**Description:** Get current configuration (sanitized)

**Response:**
```json
{
  "email": "user@example.com",
  "hasApiKey": true,
  "hasSupabaseConfig": true,
  "supabaseUrl": "https://xxxxx.supabase.co...",
  "tableName": "netcraft_submissions"
}
```

#### POST /api/config
**Description:** Update configuration

**Request:**
```json
{
  "email": "user@example.com",
  "apiKey": "optional-key",
  "supabaseUrl": "https://project.supabase.co",
  "supabaseKey": "eyJhbGciOiJIUzI1NiIs...",
  "tableName": "netcraft_submissions"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Configuration updated"
}
```

#### POST /api/test-db
**Description:** Test database connection

**Response:**
```json
{
  "success": true,
  "message": "Database connection successful"
}
```

#### POST /api/report
**Description:** Report URLs to Netcraft

**Request:**
```json
{
  "urls": [
    "https://example.com",
    "https://phishing-site.com"
  ]
}
```

**Response:**
```json
{
  "success": true,
  "jobId": "1234567890",
  "message": "Processing started"
}
```

#### GET /api/submissions
**Description:** Get all submissions

**Query Parameters:**
- `state` (optional): Filter by state

**Response:**
```json
{
  "success": true,
  "submissions": [
    {
      "id": 1,
      "url": "https://example.com",
      "uuid": "abc123...",
      "reported_at": "2025-10-16T12:00:00Z",
      "state": "pending",
      "tags": [],
      "error": null
    }
  ]
}
```

#### GET /api/stats
**Description:** Get submission statistics

**Response:**
```json
{
  "success": true,
  "stats": {
    "total": 100,
    "reported": 95,
    "failed": 5,
    "completed": 80,
    "pending": 10,
    "processing": 5
  }
}
```

#### POST /api/check-statuses
**Description:** Check status updates from Netcraft

**Response:**
```json
{
  "success": true,
  "updated": 15,
  "total": 20
}
```

#### POST /api/upload
**Description:** Upload URL file

**Request:** multipart/form-data with file

**Response:**
```json
{
  "success": true,
  "urls": [
    "https://example.com",
    "https://test.com"
  ]
}
```

### WebSocket Events

#### Client → Server

| Event | Data | Description |
|-------|------|-------------|
| `join-job` | `jobId: string` | Join a specific job room |

#### Server → Client

| Event | Data | Description |
|-------|------|-------------|
| `progress` | `{ stage, message, progress }` | Progress update |
| `rate-limit` | `{ message, processed, remaining }` | Rate limit reached |
| `complete` | `{ success, total, reported, skipped, failed }` | Job completed |
| `error` | `{ message }` | Error occurred |

---

## Security Considerations

### 1. Authentication & Authorization
- **Current:** No authentication (suitable for internal use)
- **Production Recommendation:** Add authentication layer (OAuth, JWT)

### 2. Data Protection
- Configuration stored in `config.json` (should be excluded from version control)
- API keys transmitted securely via environment variables (recommended)
- Supabase uses TLS for all connections

### 3. Input Validation
- URL validation (http/https only)
- File type validation (.txt only)
- Request size limits via Express middleware

### 4. Rate Limiting
- Netcraft API rate limits respected
- Graceful handling with user notification
- Failed URLs tracked for retry

### 5. CORS
- Configured for cross-origin requests
- Production should restrict to specific origins

### 6. Database Security
- Supabase Row Level Security (RLS) policies recommended
- Indexes prevent slow queries (DoS mitigation)
- Prepared statements via Supabase client (SQL injection prevention)

### 7. File Uploads
- Temporary storage in `uploads/` directory
- Files deleted after processing
- Size limits enforced by Multer

---

## Scalability

### Current Limitations
- Single-server architecture
- In-memory job tracking
- Synchronous batch processing

### Horizontal Scaling Strategy

```
┌──────────────────────────────────────────────────────┐
│                   Load Balancer                       │
│              (NGINX / AWS ALB / etc.)                 │
└───────────┬──────────────────────┬───────────────────┘
            │                      │
     ┌──────▼──────┐        ┌──────▼──────┐
     │  Server 1   │        │  Server 2   │
     │  (Node.js)  │        │  (Node.js)  │
     └──────┬──────┘        └──────┬──────┘
            │                      │
            └──────────┬───────────┘
                       │
            ┌──────────▼──────────┐
            │   Redis (Shared)     │
            │  • Session storage   │
            │  • Job queue         │
            │  • WebSocket state   │
            └──────────────────────┘
```

### Recommendations for Scale

1. **Job Queue:** Implement Redis-based queue (Bull, BullMQ)
2. **WebSocket:** Use Redis adapter for Socket.IO
3. **Caching:** Cache configuration and stats
4. **Database:** Connection pooling (already handled by Supabase)
5. **CDN:** Serve static assets via CDN

### Performance Optimizations

1. **Database:**
   - Indexes on frequently queried columns (already implemented)
   - Pagination for large result sets
   - Connection pooling

2. **API:**
   - Response compression
   - HTTP caching headers
   - Batch operations

3. **Frontend:**
   - Lazy loading for large tables
   - Debounced search
   - Virtual scrolling for 1000+ rows

---

## Deployment

### Docker Deployment

```bash
# Build image
docker build -t netcraft-reporter .

# Run with docker-compose
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Production Deployment Checklist

- [ ] Set up Supabase production project
- [ ] Configure environment variables
- [ ] Enable HTTPS (SSL/TLS)
- [ ] Set up monitoring (logs, metrics)
- [ ] Configure backups (Supabase handles this)
- [ ] Set up alerts (rate limits, errors)
- [ ] Enable authentication
- [ ] Configure CORS for production domain
- [ ] Set up process manager (PM2, systemd)
- [ ] Configure reverse proxy (NGINX)
- [ ] Enable firewall rules
- [ ] Set up log rotation

### Environment Variables

```bash
# Server
PORT=3000
NODE_ENV=production

# Optional: Override config file
REPORTER_EMAIL=your-email@example.com
NETCRAFT_API_KEY=your-api-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-key
```

### Health Monitoring

**Health Check Endpoint:**
- Built-in Docker health check
- Monitors server responsiveness
- 30-second interval
- 3 retries before marking unhealthy

**Metrics to Monitor:**
- API response times
- Database query times
- WebSocket connections
- Job success/failure rates
- Rate limit hits
- Error rates

---

## Future Enhancements

### Short Term
1. User authentication (OAuth 2.0)
2. API rate limiting on backend
3. Export submissions to CSV/JSON
4. Bulk status checking
5. Email notifications

### Medium Term
1. Multi-tenant support
2. Role-based access control
3. Audit logging
4. Advanced analytics dashboard
5. Scheduled reporting

### Long Term
1. Machine learning for URL classification
2. Integration with other threat intel platforms
3. API for third-party integrations
4. Mobile application
5. Kubernetes deployment

---

## Troubleshooting Guide

### Common Issues

#### 1. Database Connection Failed
**Symptoms:** "Database connection test FAILED"

**Solutions:**
- Verify Supabase URL and key
- Check network connectivity
- Verify table exists
- Check RLS policies

#### 2. Rate Limit Reached
**Symptoms:** "Rate limit reached on Netcraft API"

**Solutions:**
- Wait 15-30 minutes before retry
- Use Netcraft API key for higher limits
- Reduce batch size
- Spread submissions over time

#### 3. WebSocket Disconnects
**Symptoms:** Progress updates stop

**Solutions:**
- Check firewall rules
- Enable WebSocket support in reverse proxy
- Increase timeout values
- Check browser console for errors

#### 4. Uploads Failing
**Symptoms:** File upload returns error

**Solutions:**
- Check file format (.txt only)
- Verify file size limit
- Check uploads/ directory permissions
- Ensure proper URL format in file

---

## Architecture Decision Records (ADRs)

### ADR-001: Why React via CDN instead of Build System?
**Decision:** Use React via CDN (no build step)

**Rationale:**
- Faster development iteration
- No build complexity for users
- Single HTML file deployment
- Easier to understand for beginners

**Trade-offs:**
- Larger initial load (mitigated by CDN caching)
- No tree-shaking
- No TypeScript support

### ADR-002: Why Supabase instead of Direct PostgreSQL?
**Decision:** Use Supabase managed service

**Rationale:**
- Built-in connection pooling
- REST API and client library
- Automatic backups
- Real-time subscriptions (future use)
- Easier setup for users

**Trade-offs:**
- Vendor lock-in (mitigated by PostgreSQL compatibility)
- Requires internet access

### ADR-003: Why Socket.IO instead of Server-Sent Events?
**Decision:** Use Socket.IO for real-time updates

**Rationale:**
- Bidirectional communication
- Automatic reconnection
- Room-based messaging
- Fallback transports

**Trade-offs:**
- Slightly larger library size
- More complex than SSE

---

## Glossary

| Term | Definition |
|------|------------|
| **UUID** | Unique identifier assigned by Netcraft for each submission |
| **Batch** | Group of up to 1000 URLs submitted together |
| **Rate Limit** | Maximum number of API requests allowed in a time period |
| **RLS** | Row Level Security - PostgreSQL feature for access control |
| **WebSocket** | Protocol for bidirectional real-time communication |
| **Job** | Background task processing URL submissions |
| **State** | Current status of a URL submission (pending, processing, etc.) |

---

## Contact & Support

For issues, questions, or contributions:
- GitHub Issues: [Repository URL]
- Documentation: README.md
- Quick Start: QUICKSTART.md

---

**Document Version:** 1.0
**Last Reviewed:** 2025-10-16
