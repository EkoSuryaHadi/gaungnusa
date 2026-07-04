# Gaung — Product Requirements Document (PRD)

> **Gaung** (bahasa Indonesia: *echo*) — Platform Data Lakehouse + Visualisasi Drag & Drop.  
> "Data masuk, insight bergema."

---

## 1. Product Overview

### 1.1 Vision
Platform all-in-one yang memungkinkan user non-teknis untuk:
1. **Upload data** dari berbagai sumber (CSV, Excel, API, Database)
2. **Transformasi otomatis** melalui ETL pipeline
3. **Menyimpan** dalam 3-tier lakehouse (Bronze → Silver → Gold)
4. **Memvisualisasikan** dengan drag & drop dashboard builder
5. **Berbagi** dashboard ke stakeholder

### 1.2 Target User
| Persona | Kebutuhan |
|---------|-----------|
| Data Analyst | Upload, transform, visualisasi |
| Manager/Executive | Lihat dashboard, export laporan |
| Developer | API access, custom ETL scripts |
| Admin | Kelola data source, user, permission |

### 1.3 Unique Value Proposition
- **Zero-code ETL** — transformasi data tanpa coding
- **3-tier Lakehouse** — data terstruktur rapi: raw → clean → analytics-ready
- **Drag & Drop Dashboard** — seperti Notion/Canva untuk data
- **Self-hosted** — data tetap di server sendiri
- **Multi-tenant** — satu instance untuk banyak klien

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      DATA SOURCES                           │
│  CSV │ Excel │ JSON │ API │ PostgreSQL │ MySQL │ BigQuery   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    INGEST ENGINE                             │
│  File Upload │ API Connector │ DB Connector │ Webhook        │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    ETL PIPELINE                              │
│  Extract → Clean → Validate → Transform → Enrich → Load     │
│  (Pandas / DuckDB / Python Workers)                         │
└────────────────────────┬────────────────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
     ┌─────────┐   ┌─────────┐   ┌─────────┐
     │ BRONZE  │   │ SILVER  │   │  GOLD   │
     │  Raw    │──▶│ Cleaned │──▶│Aggregatd│
     │  Data   │   │  Data   │   │  Data   │
     └─────────┘   └─────────┘   └─────────┘
          │              │              │
          └──────────────┼──────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                 VISUALIZATION ENGINE                         │
│  Chart Builder │ Dashboard Grid │ Filter & Drill-down       │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Tech Stack

### 3.1 Frontend
| Teknologi | Purpose |
|-----------|---------|
| **Next.js 15** (App Router) | Full-stack framework |
| **TypeScript** | Type safety |
| **Tailwind CSS** | Styling, glassmorphism |
| **Shadcn/ui** | Component library |
| **react-grid-layout** | Drag & drop dashboard grid |
| **Recharts / ECharts** | Chart visualization |
| **react-query (TanStack)** | Server state management |
| **Zustand** | Client state |

### 3.2 Backend
| Teknologi | Purpose |
|-----------|---------|
| **Next.js API Routes** | REST API |
| **Prisma ORM** | Database access |
| **PostgreSQL 16** | Lakehouse storage (Silver, Bronze, Gold) |
| **DuckDB** | In-process analytical queries |
| **Python 3.11+** | ETL worker scripts |
| **Pandas** | Data transformation |
| **BullMQ + Redis** | Job queue for ETL pipelines |
| **JWT (jose)** | Authentication |

### 3.3 Infrastructure
| Teknologi | Purpose |
|-----------|---------|
| **Docker + Compose** | Containerization |
| **Nginx** | Reverse proxy |
| **Systemd** | Process management |
| **MinIO** (optional) | Object storage for raw files |

---

## 4. Data Lakehouse — 3 Tier

### 4.1 Bronze Layer (Raw)
> Data mentah langsung dari source — disimpan apa adanya.

**Karakteristik:**
- Raw ingestion tanpa transformasi
- Preserve original format & values
- Append-only (immutable)
- Full audit trail
- Schema exactly as source

**Storage:** PostgreSQL schema `bronze`

**Contoh Pipeline:**
```yaml
source: uploads/sales_jan.csv
bronze:
  ingest:
    mode: raw
    preserve_nulls: true
```

### 4.2 Silver Layer (Cleaned)
> Data yang sudah dibersihkan, divalidasi, & di-deduplicate.

**Karakteristik:**
- Schema inferred otomatis dari source
- Data type detection (string, number, date, boolean)
- Null handling (fill default / drop)
- Deduplication
- Basic validation rules

**Storage:** PostgreSQL schema `silver`

**Contoh Pipeline:**
```yaml
source: uploads/sales_jan.csv
silver:
  clean:
    - strip_whitespace: all
    - drop_duplicates: true
    - fill_null:
        amount: 0
        status: "unknown"
  validate:
    - column: amount
      type: number
      min: 0
    - column: date
      type: date
      format: "YYYY-MM-DD"
```

### 4.3 Gold Layer (Aggregated)
> Data siap analisis — aggregasi, KPI, business metrics.

**Karakteristik:**
- Pre-aggregated metrics
- Time-series rollups (daily, weekly, monthly)
- KPI definitions
- Materialized views
- Optimized for dashboard queries

**Storage:** PostgreSQL schema `gold` + materialized views

**Contoh:**
```yaml
gold:
  metrics:
    - name: monthly_revenue
      from: bronze.sales_enriched
      group_by: [month, region]
      aggregations:
        revenue: "SUM(total_price)"
        orders: "COUNT(DISTINCT order_id)"
        avg_order: "AVG(total_price)"
    - name: top_products
      from: bronze.sales_enriched
      group_by: [product_name]
      aggregations:
        total_sold: "SUM(quantity)"
      order: total_sold DESC
      limit: 10
```

---

## 5. ETL Engine

### 5.1 Data Sources (Input)

| Source Type | Format | Implementation |
|-------------|--------|----------------|
| File Upload | CSV, Excel (.xlsx), JSON, Parquet | Drag-drop upload, chunked |
| API | REST, GraphQL | URL + headers + schedule |
| Database | PostgreSQL, MySQL | Connection string + query |
| Manual Input | Form | Table editor (spreadsheet-like) |
| Webhook | JSON payload | URL endpoint + secret |

### 5.2 Pipeline Designer (UI)
User mendesain pipeline secara visual:

```
┌──────────────────────────────────────────────────────┐
│  PIPELINE: "Sales Analytics"                         │
│                                                      │
│  [CSV Upload] ──▶ [Clean] ──▶ [Join] ──▶ [Aggregate]│
│       │              │          │           │        │
│       ▼              ▼          ▼           ▼        │
│  bronze.sales silver.     gold.monthly  │
│                 products   enriched   _revenue       │
│                                                      │
│  [+ Add Step]   [▶ Run]   [⏸ Schedule]  [⚙ Config] │
└──────────────────────────────────────────────────────┘
```

### 5.3 Pipeline Steps

| Step | Icon | Function |
|------|------|----------|
| **Source** | 📥 | Select data source |
| **Clean** | 🧹 | Strip whitespace, deduplicate, fill nulls |
| **Validate** | ✅ | Type check, range check, regex pattern |
| **Transform** | 🔄 | Calculated columns, rename, type cast |
| **Join** | 🔗 | Merge with other tables |
| **Filter** | 🔍 | WHERE clause builder |
| **Categorize** | 🏷️ | Bucket data into categories |
| **Aggregate** | 📊 | SUM, AVG, COUNT, MIN, MAX, GROUP BY |
| **Sort** | ↕️ | ORDER BY |
| **Pivot** | 📐 | Reshape data (rows → columns) |
| **Output** | 📤 | Target layer (Silver/Bronze/Gold) |

### 5.4 Scheduling
- **Manual**: Run now
- **Scheduled**: Cron expression (daily, hourly, weekly)
- **Trigger**: On new data arrival (webhook)
- **Dependency**: After pipeline X completes

---

## 6. Frontend Pages

### 6.1 Page Structure

```
/                           Landing page
/login                      Authentication
/dashboard                  Main workspace
├── /sources                Data source management
│   ├── /new                Add new source
│   └── /[id]               Source detail + preview
├── /pipelines              ETL pipeline list
│   ├── /new                Pipeline designer
│   └── /[id]               Pipeline detail + runs
├── /lakehouse              Data explorer
│   ├── /silver             Silver layer tables
│   ├── /bronze              Bronze layer tables
│   └── /gold               Gold layer tables + metrics
├── /dashboards             Dashboard list
│   ├── /new                Dashboard builder
│   └── /[id]               View dashboard
├── /settings               Account, team, billing
└── /api                    REST API docs
```

### 6.2 Key Screens

#### A. Data Source Manager (`/sources`)
```
┌─────────────────────────────────────────────────────┐
│  📥 Data Sources                          [+ New]   │
├─────────────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │ 📄 CSV   │ │ 🔌 API   │ │ 🗄️ DB   │            │
│  │ sales    │ │ weather  │ │ prod DB  │            │
│  │ 2.3 MB   │ │ hourly   │ │ pg://... │            │
│  │ ✓ active │ │ ⏸ paused │ │ ✓ active │            │
│  └──────────┘ └──────────┘ └──────────┘            │
└─────────────────────────────────────────────────────┘
```

#### B. Pipeline Designer (`/pipelines/new`)
```
┌─────────────────────────────────────────────────────┐
│  ⚙ Pipeline Designer                    [Save] [Run]│
├──────────────────┬──────────────────────────────────┤
│  Toolbox         │  Canvas                          │
│                  │                                  │
│  📥 Source       │  [CSV: sales.csv]                │
│  🧹 Clean        │       │                          │
│  ✅ Validate     │       ▼                          │
│  🔄 Transform    │  [Clean: strip + dedupe]         │
│  🔗 Join         │       │                          │
│  🔍 Filter       │       ▼                          │
│  🏷️ Categorize   │  [Transform: calc profit]        │
│  📊 Aggregate    │       │                          │
│  ↕️ Sort         │       ▼                          │
│  📐 Pivot        │  [Output: bronze.sales_clean]     │
│  📤 Output       │                                  │
│                  │                                  │
├──────────────────┴──────────────────────────────────┤
│  Config Panel (appears when step selected)          │
│  ┌─────────────────────────────────────────────┐    │
│  │ Step: Clean                                  │    │
│  │ ☑ Strip whitespace                          │    │
│  │ ☑ Remove duplicates                         │    │
│  │ ☐ Fill nulls: [0] for [amount]              │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

#### C. Lakehouse Explorer (`/lakehouse`)
```
┌─────────────────────────────────────────────────────┐
│  🏠 Lakehouse Explorer                              │
├─────────────────────────────────────────────────────┤
│  [Silver] │ [Bronze] │ [Gold]                        │
├─────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────┐       │
│  │ 📊 silver.sales_transactions              │       │
│  │ 12,450 rows │ 8 columns │ 2.1 MB         │       │
│  │ Last updated: 2 min ago                   │       │
│  ├──────────────────────────────────────────┤       │
│  │ ID │ Date       │ Product  │ Amount│ ...  │       │
│  │ 1  │ 2026-01-01 │ Widget A │ 150   │      │       │
│  │ 2  │ 2026-01-01 │ Widget B │ 200   │      │       │
│  │ ...                                       │       │
│  └──────────────────────────────────────────┘       │
│  [Preview Data] [View Schema] [Create Pipeline ▶]   │
└─────────────────────────────────────────────────────┘
```

#### D. Dashboard Builder (`/dashboards/new`)
```
┌─────────────────────────────────────────────────────┐
│  📊 Dashboard Builder           [Preview] [Save]    │
├──────────────────┬──────────────────────────────────┤
│  Widgets         │  Dashboard Canvas                │
│                  │                                  │
│  📈 Line Chart   │  ┌──────────┐ ┌──────────┐      │
│  📊 Bar Chart    │  │ Revenue  │ │ Top      │      │
│  🥧 Pie Chart    │  │ Trend    │ │ Products │      │
│  📉 Area Chart   │  │ 📈       │ │ 🥧       │      │
│  🔢 KPI Card     │  └──────────┘ └──────────┘      │
│  📋 Table        │  ┌────────────────────┐          │
│  🗺️ Map (future) │  │ Recent Transactions │          │
│  💬 Text         │  │ 📋                  │          │
│  🖼️ Image        │  └────────────────────┘          │
│  📐 Divider      │                                  │
│                  │  Drag widgets here →             │
├──────────────────┴──────────────────────────────────┤
│  Widget Config (appears when widget selected)       │
│  ┌─────────────────────────────────────────────┐    │
│  │ Chart: Revenue Trend                         │    │
│  │ Data Source: [gold.monthly_revenue ▼]        │    │
│  │ X-Axis: [month ▼]  Y-Axis: [revenue ▼]      │    │
│  │ Color: [#10B981]  Type: [Line ▼]            │    │
│  │ Filter: [region = "All" ▼]                  │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

---

## 7. Backend API

### 7.1 REST API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| **Sources** | | |
| GET | `/api/sources` | List all sources |
| POST | `/api/sources` | Create new source |
| GET | `/api/sources/[id]` | Source detail |
| DELETE | `/api/sources/[id]` | Delete source |
| POST | `/api/sources/[id]/sync` | Trigger sync |
| **Pipelines** | | |
| GET | `/api/pipelines` | List pipelines |
| POST | `/api/pipelines` | Create pipeline |
| GET | `/api/pipelines/[id]` | Pipeline detail + DAG |
| PUT | `/api/pipelines/[id]` | Update pipeline |
| DELETE | `/api/pipelines/[id]` | Delete pipeline |
| POST | `/api/pipelines/[id]/run` | Execute pipeline |
| GET | `/api/pipelines/[id]/runs` | Pipeline run history |
| **Lakehouse** | | |
| GET | `/api/lakehouse/[layer]` | List tables in layer |
| GET | `/api/lakehouse/[layer]/[table]` | Table preview |
| GET | `/api/lakehouse/[layer]/[table]/schema` | Table schema |
| POST | `/api/lakehouse/[layer]/query` | Run SQL query |
| **Dashboards** | | |
| GET | `/api/dashboards` | List dashboards |
| POST | `/api/dashboards` | Create dashboard |
| GET | `/api/dashboards/[id]` | Dashboard detail |
| PUT | `/api/dashboards/[id]` | Update layout |
| DELETE | `/api/dashboards/[id]` | Delete |
| GET | `/api/dashboards/[id]/data` | Widget data refresh |
| **Auth** | | |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/session` | Current session |

### 7.2 WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `pipeline:progress` | Server → Client | Pipeline run progress % |
| `pipeline:complete` | Server → Client | Pipeline finished |
| `pipeline:error` | Server → Client | Pipeline error |
| `dashboard:refresh` | Server → Client | Push updated data to widgets |
| `source:synced` | Server → Client | Source sync complete |

---

## 8. Database Schema (Prisma)

```prisma
// ---- Lakehouse Tables ----
model Source {
  id          Int       @id @default(autoincrement())
  name        String
  type        String    // "CSV" | "EXCEL" | "JSON" | "API" | "DB"
  config      String    // JSON: connection details
  status      String    @default("ACTIVE")
  lastSyncAt  DateTime?
  pipelines   Pipeline[]
  createdAt   DateTime  @default(now())
}

model Pipeline {
  id          Int         @id @default(autoincrement())
  name        String
  description String?
  sourceId    Int
  source      Source      @relation(fields: [sourceId], references: [id])
  steps       Step[]
  schedule    String?     // Cron expression
  status      String      @default("DRAFT")
  runs        PipelineRun[]
  createdAt   DateTime    @default(now())
}

model Step {
  id         Int       @id @default(autoincrement())
  pipelineId Int
  pipeline   Pipeline  @relation(fields: [pipelineId], references: [id], onDelete: Cascade)
  order      Int
  type       String    // "CLEAN" | "VALIDATE" | "TRANSFORM" | "JOIN" | "FILTER" | "AGGREGATE" | "OUTPUT"
  config     String    // JSON: step-specific config
  positionX  Float
  positionY  Float
}

model PipelineRun {
  id          Int       @id @default(autoincrement())
  pipelineId  Int
  pipeline    Pipeline  @relation(fields: [pipelineId], references: [id])
  status      String    // "RUNNING" | "SUCCESS" | "FAILED"
  startedAt   DateTime  @default(now())
  finishedAt  DateTime?
  logs        String?
  rowsInput   Int?
  rowsOutput  Int?
}

// ---- Dashboard ----
model Dashboard {
  id        Int       @id @default(autoincrement())
  name      String
  widgets   Widget[]
  layout    String    // JSON: react-grid-layout config
  createdAt DateTime  @default(now())
}

model Widget {
  id           Int       @id @default(autoincrement())
  dashboardId  Int
  dashboard    Dashboard @relation(fields: [dashboardId], references: [id], onDelete: Cascade)
  type         String    // "LINE" | "BAR" | "PIE" | "AREA" | "KPI" | "TABLE" | "TEXT"
  title        String
  config       String    // JSON: chart config, data source, filters
  gridX        Int
  gridY        Int
  gridW        Int       @default(4)
  gridH        Int       @default(3)
}
```

---

## 9. ETL Worker Architecture

### 9.1 Job Queue Flow
```
User clicks "Run Pipeline"
        │
        ▼
  API creates PipelineRun (status: PENDING)
        │
        ▼
  API pushes job to Redis queue
        │
        ▼
  Python Worker picks up job
        │
        ▼
  Execute pipeline steps sequentially
  (Pandas / DuckDB)
        │
        ▼
  Write results to PostgreSQL layer
        │
        ▼
  Update PipelineRun status
        │
        ▼
  Push WebSocket notification to UI
```

### 9.2 Python Worker (`gaung-worker`)
```python
# ETL worker process
# - Watches Redis queue for new pipeline runs
# - Executes pipeline steps using Pandas/DuckDB
# - Writes output to PostgreSQL lakehouse layers
# - Reports progress via WebSocket
```

---

## 10. UI/UX Design Principles

### 10.1 Design Language
- **Dark theme** (like SkillSync)
- **Glassmorphism** cards & panels
- **Gradient accents** (emerald → teal → indigo)
- **Drag & drop** interactions with visual feedback
- **Real-time** progress indicators
- **Responsive** — works on desktop & tablet

### 10.2 Color Palette
```
Background:  #0B0F1F (deep navy)
Surface:     rgba(15, 23, 42, 0.6) (glass)
Accent:      #10B981 (emerald)
Secondary:   #6366F1 (indigo)
Warning:     #F59E0B (amber)
Error:       #EF4444 (red)
Text:        #E2E8F0 (light gray)
```

---

## 11. Development Phases

### Phase 1: Foundation (Week 1-2)
- [x] Project scaffold (Next.js + Prisma + PostgreSQL)
- [ ] Auth system (login, register, RBAC)
- [ ] Data source CRUD (CSV upload)
- [ ] Basic ETL pipeline (CSV → Bronze)
- [ ] Lakehouse schema creation

### Phase 2: ETL Engine (Week 3-4)
- [ ] Python ETL worker
- [ ] Pipeline designer UI (canvas + toolbox)
- [ ] All pipeline steps (Clean, Transform, Join, Aggregate)
- [ ] Bronze & Gold layer transformations
- [ ] Pipeline scheduling

### Phase 3: Dashboard (Week 5-6)
- [ ] Chart components (Line, Bar, Pie, Area, KPI, Table)
- [ ] Drag & drop dashboard builder (react-grid-layout)
- [ ] Widget configuration panel
- [ ] Data source binding
- [ ] Real-time refresh with WebSocket

### Phase 4: Polish (Week 7-8)
- [ ] Multi-tenant support
- [ ] API connector (REST, webhook)
- [ ] Database connector (PostgreSQL, MySQL)
- [ ] Export (PDF, CSV, Image)
- [ ] Permissions & sharing
- [ ] Performance optimization

---

## 12. Success Metrics

| Metric | Target |
|--------|--------|
| Time from upload to visualization | < 5 minutes |
| Pipeline success rate | > 99% |
| Dashboard load time | < 2 seconds |
| Max file upload | 100 MB |
| Concurrent users | 50+ |
| Browser support | Chrome, Firefox, Safari, Edge (last 2 versions) |

---

*Last updated: 1 July 2026*
