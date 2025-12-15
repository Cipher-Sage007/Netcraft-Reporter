# CT Logs Monitor Dashboard - Implementation Plan

## Project Overview
A centralized dashboard for managing CT (Certificate Transparency) logs monitoring campaigns, keywords, and analytics with integration to Netcraft Reporter.

---

## Architecture

```
CT Monitor Dashboard ──► MongoDB (Central DB) ◄── CT Logs Monitor Script
                            │
                            ├──► Metabase (Analytics)
                            └──► Netcraft Reporter API
```

---

## MongoDB Schema

### 1. Campaigns Collection
```javascript
{
  _id: ObjectId,
  campaign: String (unique, indexed),
  description: String,
  keywords: [String],                    // Array of keyword IDs or names
  count_keywords: Number,                // Auto-calculated
  currently_monitored: Boolean,
  added_at: ISODate,
  updated_at: ISODate,
  score: Number,
  metadata: {
    created_by: String,
    tags: [String]
  }
}
```

**Indexes:**
- `campaign` (unique)
- `currently_monitored`
- `added_at`

### 2. Keywords Collection
```javascript
{
  _id: ObjectId,
  keyword: String (unique, indexed),
  campaign: String,                      // Reference to campaign
  currently_monitored: Boolean,
  added_at: ISODate,
  last_processed: ISODate,
  score: Number,
  match_count: Number,                   // Total URLs matched
  regex_pattern: String,                 // Optional: for advanced matching
  case_sensitive: Boolean
}
```

**Indexes:**
- `keyword` (unique)
- `campaign`
- `currently_monitored`
- `last_processed`

### 3. URLs Collection
```javascript
{
  _id: ObjectId,
  url: String (unique, indexed),
  first_seen: ISODate,
  is_reported: Boolean,
  reported_at: ISODate,
  keyword: String,                       // Matched keyword
  campaign: String,                      // Matched campaign
  certificate_info: {
    issuer: String,
    subject: String,
    not_before: ISODate,
    not_after: ISODate,
    san_domains: [String],
    fingerprint: String
  },
  netcraft_uuid: String,                 // From Netcraft Reporter
  netcraft_status: String,               // "pending", "reported", "failed"
  netcraft_state: String,                // "no threats", "malicious", etc.
  source: String,                        // "ct-monitor-{campaign}"
  metadata: {
    ct_log_source: String,
    entry_index: Number
  }
}
```

**Indexes:**
- `url` (unique)
- `keyword`
- `campaign`
- `is_reported`
- `first_seen`
- Compound: `{campaign: 1, is_reported: 1}`

### 4. Analytics Events Collection
```javascript
{
  _id: ObjectId,
  event_type: String,                    // "url_discovered", "keyword_added", "reported"
  timestamp: ISODate,
  campaign: String,
  keyword: String,
  url: String,
  details: Object,
  user: String
}
```

**Indexes:**
- `event_type`
- `timestamp`
- `campaign`
- Compound: `{event_type: 1, timestamp: -1}`

---

## Tech Stack

### Backend API
- **Node.js + Express.js**
- **Mongoose** (MongoDB ODM)
- **Socket.IO** (Real-time updates)
- **Joi** (Request validation)
- **Morgan** (Logging)

### Frontend
- **React 18** (via CDN or Vite)
- **Monaco Editor** (VS Code-like JSON editor)
- **React Flow** (Visual graph for campaigns/keywords)
- **Recharts** or **Chart.js** (Mini charts)
- **TailwindCSS** or keep your current CSS approach

### Analytics
- **Metabase** (Self-hosted or cloud)
- Direct MongoDB connection

### Integration
- **Netcraft Reporter API** (existing project)
- **CT Monitor Script** (Python/Node - separate process)

---

## API Endpoints Design

### Campaigns

```
GET    /api/campaigns                    # List all campaigns
GET    /api/campaigns/:id                # Get single campaign
POST   /api/campaigns                    # Create campaign
PUT    /api/campaigns/:id                # Update campaign
DELETE /api/campaigns/:id                # Delete campaign
PATCH  /api/campaigns/:id/toggle         # Toggle monitoring
POST   /api/campaigns/bulk-import        # Import JSON
GET    /api/campaigns/:id/stats          # Get campaign stats
```

### Keywords

```
GET    /api/keywords                     # List all keywords
GET    /api/keywords/:id                 # Get single keyword
POST   /api/keywords                     # Create keyword
PUT    /api/keywords/:id                 # Update keyword
DELETE /api/keywords/:id                 # Delete keyword
PATCH  /api/keywords/:id/toggle          # Toggle monitoring
GET    /api/keywords/:id/urls            # URLs matched by keyword
POST   /api/keywords/bulk-add            # Bulk add keywords to campaign
```

### URLs

```
GET    /api/urls                         # List all URLs (paginated)
GET    /api/urls/:id                     # Get single URL
GET    /api/urls/by-campaign/:campaign   # Filter by campaign
POST   /api/urls/report                  # Report URLs to Netcraft
GET    /api/urls/unreported              # Get unreported URLs
PATCH  /api/urls/:id/mark-reported       # Mark as reported
```

### Configuration

```
GET    /api/config/export                # Export all config as JSON
POST   /api/config/import                # Import config from JSON
GET    /api/config/validate              # Validate config JSON
GET    /api/config/schema                # Get JSON schema
```

### Analytics

```
GET    /api/analytics/summary            # Overall stats
GET    /api/analytics/campaign/:id       # Campaign-specific stats
GET    /api/analytics/timeline           # Timeline of discoveries
GET    /api/analytics/top-keywords       # Most active keywords
```

### WebSocket Events

```
url:discovered      # New URL found
url:reported        # URL reported to Netcraft
campaign:updated    # Campaign config changed
keyword:matched     # Keyword matched new URL
system:stats        # Real-time stats update
```

---

## Frontend - Configuration UI Design

### Page Structure

```
┌─────────────────────────────────────────────────────────────────┐
│  CT Logs Monitor                                    [@] [@] [@]  │
├─────────────────────────────────────────────────────────────────┤
│  [Configuration] [Analytics] [URLs] [Settings]                  │
├──────────────────┬──────────────────────────────────────────────┤
│                  │                                              │
│  Campaigns (5)   │        Campaign: "Brand Monitoring"          │
│  ┌────────────┐  │  ┌────────────────────────────────────────┐ │
│  │🟢 Brand    │◄─┼──┤ {                                      │ │
│  │   Mon.  [✎]│  │  │   "campaign": "Brand Monitoring",     │ │
│  │  12 keys   │  │  │   "description": "Monitor brand abuse",│ │
│  ├────────────┤  │  │   "keywords": [                       │ │
│  │⚫ Phishing │  │  │     "mycompany",                      │ │
│  │   Detect   │  │  │     "my-company",                     │ │
│  │  8 keys    │  │  │     "mycompany-login"                 │ │
│  ├────────────┤  │  │   ],                                  │ │
│  │🟢 Typosqt  │  │  │   "currently_monitored": true,        │ │
│  │  15 keys   │  │  │   "score": 10                         │ │
│  └────────────┘  │  │ }                                      │ │
│                  │  └────────────────────────────────────────┘ │
│  [+ Campaign]    │                                              │
│                  │  [Validate ✓] [Save] [Export ⬇] [Import ⬆] │
│  Keywords (35)   │                                              │
│  🔍 [Search...]  │  ┌────────────────────────────────────────┐ │
│  ┌────────────┐  │  │ Associated Keywords (12)              │ │
│  │🟢 mycompany│  │  │ ┌──────────────────────────┐          │ │
│  │🟢 my-comp..│  │  │ │ mycompany         [🗑][⚙]│ 45 URLs  │ │
│  │⚫ disabled │  │  │ │ my-company        [🗑][⚙]│ 23 URLs  │ │
│  └────────────┘  │  │ │ mycompany-login   [🗑][⚙]│ 12 URLs  │ │
│  [+ Keyword]     │  │ └──────────────────────────┘          │ │
│                  │  │ [+ Add Keyword]                        │ │
├──────────────────┤  └────────────────────────────────────────┘ │
│  Live Stats      │                                              │
│  🟢 12 Active    │  Visual Graph View: [Switch to Graph →]     │
│  📊 1,234 URLs   │                                              │
│  📨 567 Reported │                                              │
└──────────────────┴──────────────────────────────────────────────┘
```

### Interactive Features

1. **Split-View Editor**
   - Left: Tree/List view (traditional UI)
   - Right: JSON editor (Monaco/CodeMirror)
   - Bi-directional sync

2. **JSON Playground Features**
   - Syntax highlighting
   - Auto-completion (campaign names, keywords)
   - Real-time validation
   - Schema hints
   - Diff viewer (before/after changes)
   - Version history

3. **Visual Graph Mode**
   ```
   [Campaign A]───┬───[keyword1]───(45 URLs)
                  ├───[keyword2]───(23 URLs)
                  └───[keyword3]───(12 URLs)

   [Campaign B]───┬───[keyword4]───(89 URLs)
                  └───[keyword5]───(34 URLs)
   ```

4. **Quick Actions**
   - Drag keywords between campaigns
   - Toggle monitoring with switches
   - Bulk operations (select multiple, activate/deactivate)
   - Clone campaigns as templates
   - Export/Import JSON

5. **Smart Filters**
   - Show only active/inactive
   - Filter by last processed date
   - Filter by match count
   - Search across campaigns and keywords

---

## Implementation Phases

### Phase 1: Backend Foundation (Week 1-2)

**Tasks:**
- [ ] Set up MongoDB database
- [ ] Create Mongoose schemas and models
- [ ] Build Express API with all endpoints
- [ ] Implement validation with Joi
- [ ] Add authentication (optional but recommended)
- [ ] Set up Socket.IO for real-time updates
- [ ] Write API tests

**Deliverables:**
- Working REST API
- MongoDB with indexes
- API documentation (Swagger/Postman)

### Phase 2: Configuration UI (Week 2-3)

**Tasks:**
- [ ] Create React app structure
- [ ] Build campaign list/tree component
- [ ] Integrate Monaco Editor for JSON editing
- [ ] Implement bi-directional sync (UI ↔ JSON)
- [ ] Add form validation
- [ ] Create keyword management interface
- [ ] Implement bulk operations
- [ ] Add import/export functionality

**Deliverables:**
- Interactive configuration dashboard
- JSON playground
- Campaign and keyword CRUD

### Phase 3: Visual Enhancements (Week 3-4)

**Tasks:**
- [ ] Implement React Flow graph view
- [ ] Add drag-and-drop functionality
- [ ] Create real-time stats widgets
- [ ] Add animations and transitions
- [ ] Implement search and filtering
- [ ] Add keyboard shortcuts

**Deliverables:**
- Visual graph mode
- Enhanced UX with animations
- Advanced filtering

### Phase 4: Analytics Integration (Week 4-5)

**Tasks:**
- [ ] Set up Metabase instance
- [ ] Connect Metabase to MongoDB
- [ ] Create analytics dashboards in Metabase
- [ ] Embed Metabase dashboards in UI (iframe/API)
- [ ] Build custom analytics endpoints
- [ ] Create timeline visualizations

**Deliverables:**
- Metabase dashboards
- Analytics section in UI
- Custom reports

### Phase 5: CT Monitor Integration (Week 5-6)

**Tasks:**
- [ ] Build keyword fetch API for CT monitor
- [ ] Implement URL submission endpoint
- [ ] Add WebSocket events for real-time updates
- [ ] Create batch processing for discovered URLs
- [ ] Implement error handling and retries

**Deliverables:**
- CT monitor can fetch keywords
- URLs automatically added to database
- Real-time notifications

### Phase 6: Netcraft Reporter Integration (Week 6-7)

**Tasks:**
- [ ] Create reporting workflow
- [ ] Integrate with Netcraft Reporter API
- [ ] Auto-report based on rules
- [ ] Update URL status from Netcraft
- [ ] Add reporting queue management

**Deliverables:**
- Automated reporting pipeline
- Status sync with Netcraft
- Reporting queue UI

### Phase 7: Testing & Deployment (Week 7-8)

**Tasks:**
- [ ] End-to-end testing
- [ ] Performance optimization
- [ ] Security audit
- [ ] Docker containerization
- [ ] CI/CD pipeline
- [ ] Documentation

**Deliverables:**
- Production-ready application
- Deployment scripts
- User documentation

---

## Integration with Netcraft Reporter

### Workflow

```
CT Monitor ──► Discovers URL ──► MongoDB
                                    │
                                    ▼
                              Check if reported
                                    │
                    ┌───────────────┴───────────────┐
                    NO                             YES
                    │                               │
                    ▼                               ▼
            POST /api/report              Update status from
            source: "ct-{campaign}"       Netcraft API
                    │
                    ▼
            Netcraft Reporter
            processes URLs
                    │
                    ▼
            Update MongoDB with
            netcraft_uuid,
            netcraft_status
```

### API Integration Points

1. **Reporting URLs**
   ```javascript
   POST /api/urls/report
   {
     "urls": ["https://evil.com", "https://phish.net"],
     "campaign": "Brand Monitoring",
     "source": "ct-brand-monitoring"
   }

   // Internally calls Netcraft Reporter:
   POST http://localhost:3000/api/report
   {
     "urls": [...],
     "source": "ct-brand-monitoring"
   }
   ```

2. **Status Sync**
   ```javascript
   // Periodic job to check Netcraft status
   GET /api/submissions?source=ct-*

   // Update local MongoDB
   PATCH /api/urls/:id
   {
     "netcraft_status": "reported",
     "netcraft_state": "malicious",
     "netcraft_uuid": "abc-123"
   }
   ```

---

## JSON Configuration Examples

### Campaign Configuration

```json
{
  "campaign": "Brand Monitoring",
  "description": "Monitor certificate transparency logs for brand abuse",
  "keywords": [
    "mycompany",
    "my-company",
    "mycompany-login",
    "mycompanyonline",
    "mycompany-secure"
  ],
  "currently_monitored": true,
  "score": 10,
  "metadata": {
    "created_by": "security-team",
    "tags": ["brand-protection", "high-priority"],
    "notification_email": "security@mycompany.com"
  }
}
```

### Bulk Import Format

```json
{
  "campaigns": [
    {
      "campaign": "Brand Monitoring",
      "keywords": ["mycompany", "my-company"],
      "currently_monitored": true
    },
    {
      "campaign": "Typosquatting Detection",
      "keywords": ["mycompny", "mycornpany", "mycompany1"],
      "currently_monitored": true
    }
  ],
  "settings": {
    "auto_report": true,
    "min_confidence_score": 7
  }
}
```

---

## Metabase Dashboards

### Dashboard 1: Overview
- Total campaigns (active/inactive)
- Total keywords (active/inactive)
- URLs discovered (timeline chart)
- URLs reported (timeline chart)
- Top campaigns by URL count
- Recent discoveries (table)

### Dashboard 2: Campaign Performance
- Select campaign dropdown
- URLs discovered per keyword (bar chart)
- Discovery timeline (line chart)
- Reporting rate (percentage)
- Top matched keywords (table)

### Dashboard 3: Reporting Analytics
- Reported vs unreported (pie chart)
- Netcraft status distribution
- Average time to report
- Successful vs failed reports
- Monthly reporting trends

### Dashboard 4: Keyword Analytics
- Most active keywords (bar chart)
- Keywords by match count
- Inactive keywords (need review)
- Last processed timestamps

---

## Security Considerations

1. **API Authentication**
   - Use JWT tokens or API keys
   - Rate limiting
   - CORS configuration

2. **Input Validation**
   - Sanitize all inputs
   - Validate JSON schemas
   - Prevent NoSQL injection

3. **MongoDB Security**
   - Use authentication
   - Network isolation
   - Regular backups
   - Role-based access

4. **Secrets Management**
   - Environment variables
   - Vault for sensitive data
   - Never commit credentials

---

## File Structure

```
ct-monitor-dashboard/
├── server/
│   ├── models/
│   │   ├── Campaign.js
│   │   ├── Keyword.js
│   │   ├── URL.js
│   │   └── AnalyticsEvent.js
│   ├── routes/
│   │   ├── campaigns.js
│   │   ├── keywords.js
│   │   ├── urls.js
│   │   ├── analytics.js
│   │   └── config.js
│   ├── controllers/
│   ├── middleware/
│   ├── utils/
│   ├── validators/
│   ├── socket.js
│   └── server.js
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── CampaignTree.jsx
│   │   │   ├── JSONEditor.jsx
│   │   │   ├── KeywordList.jsx
│   │   │   ├── GraphView.jsx
│   │   │   └── StatsWidget.jsx
│   │   ├── pages/
│   │   │   ├── Configuration.jsx
│   │   │   ├── Analytics.jsx
│   │   │   ├── URLs.jsx
│   │   │   └── Settings.jsx
│   │   ├── hooks/
│   │   ├── utils/
│   │   └── App.jsx
│   └── public/
├── docker-compose.yml
├── package.json
└── README.md
```

---

## Next Steps

1. **Immediate**: Set up MongoDB and create initial schema
2. **Week 1**: Build backend API
3. **Week 2**: Create configuration UI prototype
4. **Week 3**: Add visual features and JSON playground
5. **Week 4**: Integrate Metabase
6. **Week 5-6**: Connect CT monitor and Netcraft Reporter
7. **Week 7-8**: Testing and deployment

---

## Questions to Answer

- [ ] Authentication method? (JWT, OAuth, API keys)
- [ ] Deployment target? (Docker, VM, Cloud)
- [ ] Metabase hosting? (Self-hosted or cloud)
- [ ] CT monitor language? (Python, Node.js)
- [ ] Auto-reporting rules? (Score threshold, manual approval)
- [ ] User management? (Single user vs multi-user)
- [ ] Notification system? (Email, Slack, webhook)

---

## Additional Features (Future)

- [ ] Regex pattern support for keywords
- [ ] Machine learning for auto-scoring URLs
- [ ] Integration with VirusTotal, URLScan
- [ ] Automated testing of discovered URLs
- [ ] Telegram/Slack notifications
- [ ] Role-based access control (admin, analyst, viewer)
- [ ] API rate limiting and quotas
- [ ] Audit log for all changes
- [ ] Scheduled reporting
- [ ] Custom webhook integrations

---

**Document Version**: 1.0
**Last Updated**: 2025-12-12
**Author**: CT Monitor Team
