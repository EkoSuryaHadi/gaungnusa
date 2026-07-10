# Gaung — Product Requirements Document (PRD)

> **Gaung** (bahasa Indonesia: *echo*) — Platform Data Lakehouse + Visualisasi Drag & Drop.  
> "Data masuk, insight bergema."
>
> **Version:** 2.2  
> **Last updated:** 5 July 2026

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
| Teknologi | Purpose | Status |
|-----------|---------|--------|
| **Next.js 16** (App Router + Turbopack) | Full-stack framework | ✅ Deployed |
| **TypeScript** | Type safety | ✅ |
| **Tailwind CSS v4** | Styling, utility-first | ✅ |
| **Shadcn/ui** | Component library | ✅ |
| **react-grid-layout** | Drag & drop dashboard grid | ✅ |
| **Recharts** | Chart visualization (Bar, Line, Pie, Area, Table) | ✅ |
| **Lucide React** | Icon library | ✅ |
| **CSS Custom Properties** | Design tokens (Batik Gold palette) | ✅ |

### 3.2 Backend
| Teknologi | Purpose | Status |
|-----------|---------|--------|
| **Next.js API Routes** | REST API | ✅ |
| **Prisma ORM v5** | Database access | ✅ |
| **PostgreSQL 16** (port 5433) | Lakehouse storage (Bronze, Silver, Gold) | ✅ |
| **Python 3.11** | ETL worker scripts | ✅ |
| **Pandas** | Data transformation | ✅ |
| **JWT (jose)** | Authentication via localStorage | ✅ |
| **DuckDB** | In-process analytical queries | 🔜 Planned |
| **BullMQ + Redis** | Job queue for async ETL | 🔜 Planned |

### 3.3 Infrastructure
| Teknologi | Purpose | Status |
|-----------|---------|--------|
| **Systemd** (`gaung.service`) | Process management, auto-restart | ✅ |
| **Tencent Cloud Lighthouse** | VPS hosting (Ubuntu 22.04) | ✅ |
| **Nginx** | Reverse proxy | 🔜 Planned |
| **Docker** | Containerization (future) | 🔜 Planned |

---

## 4. Data Lakehouse — 3 Tier

### 4.1 Bronze Layer (Raw)
> Data mentah langsung dari source — disimpan apa adanya.

**Karakteristik:**
- Raw ingestion tanpa transformasi
- Preserve original format & values
- Append-only (immutable)
- Full audit trail (`_ingested_at`, `_source_id` auto-injected)
- Schema exactly as source
- **Automatic Ingestion:** Upload CSV/Excel otomatis di-ingest ke `bronze.csv_{sourceId}` secara async di background, memastikan seluruh input data melewati Bronze Layer terlebih dahulu.

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
- Pre-aggregated metrics (bukan row-level data)
- Time-series rollups (daily, weekly, monthly)
- KPI definitions (MIN, MAX, AVG, SUM, COUNT)
- Group-by category breakdowns
- Optimized for dashboard queries
- **⚠️ Enforcement:** OUTPUT ke GOLD HARUS didahului oleh AGGREGATE, JOIN, atau PIVOT step. Pipeline akan ditolak (400) jika aturan ini dilanggar.

**Storage:** PostgreSQL schema `gold` + materialized views

**Contoh Nyata (bank_rekon_gold_summary):**
```yaml
gold:
  metrics:
    - name: bank_rekon_gold_summary
      from: silver.bank_rekon_silver_v2
      group_by: [Recon_Status]
      aggregations:
        total_amount: "SUM(Amount)"
        transaction_count: "COUNT(*)"
        avg_amount: "AVG(Amount)"
```

**Hasil:**
| Recon_Status | total_amount | transaction_count | avg_amount |
|---|---:|---:|---:|
| Matched | 412,550,000 | 37 | 11,150,000 |
| Date Difference | 31,800,000 | 3 | 10,600,000 |
| Amount Difference | 29,650,000 | 3 | 9,883,333 |
| Outstanding | 28,600,000 | 3 | 9,533,333 |
| Duplicate | 19,800,000 | 2 | 9,900,000 |
| Wrong Reference | 14,100,000 | 2 | 7,050,000 |

50 baris Silver → 6 baris Gold (agregat per status)

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
| **Output** | 📤 | Target layer (Silver/Bronze/Gold) with Write Modes: Overwrite, Append, Upsert |

### 5.4 Write Modes (Incremental / Delta Processing)
Ketika menulis ke target layer (Silver/Gold), pipeline mendukung tiga mode penulisan:
1. **Overwrite (Full Refresh)**: Menghapus tabel lama (membackup snapshot terlebih dahulu) lalu membuat tabel baru.
2. **Append (Incremental Insert)**: Memasukkan baris data baru ke tabel yang sudah ada secara langsung tanpa menghapus data lama.
3. **Upsert (Incremental Merge)**: Melakukan update baris lama dan menyisipkan baris baru (using `ON CONFLICT DO UPDATE`) berdasarkan Primary Key yang dikonfigurasi.

### 5.5 Reliability & Security
- **SQL Injection Prevention**: Semua dynamic identifiers (table/schema names) disanitasi ketat menggunakan regex `sanitize_identifier` dan parameterization query ($1/$2).
- **Transactional Staging**: Data ditulis ke temporary table staging lalu di-rename/merge secara atomis di dalam satu database transaction block.
- **Rollback Snapshot**: Mode overwrite otomatis membuat backup tabel lawas `{table}__bak_{timestamp}` (menyimpan 3 snapshot historis terakhir).
- **Step-level Error Isolation**: Eror di tahap transformasi tidak langsung mematikan pipeline (non-fatal errors dilanjutkan dengan df sebelumnya, sementara SOURCE/OUTPUT tetap bersifat fatal).
- **Concurrent Run Protection**: Mencegah race condition dengan memblokir eksekusi ganda jika pipeline yang sama sedang berjalan (409 Conflict).
- **OOM Protection**: Menggunakan pandas `read_sql` dengan `chunksize=50_000` streaming untuk memproses datasets raksasa tanpa kehabisan RAM.

### 5.6 Scheduling
- **Manual**: Run now
- **Scheduled**: Cron expression (daily, hourly, weekly)
- **Trigger**: On new data arrival (webhook)
- **Dependency**: After pipeline X completes

---

## 6. Frontend Pages

### 6.1 Route Structure

```
/                           Landing page / redirect to dashboard
/login                      Authentication (JWT localStorage)
/sources                    Data source list + management
├── /new                    Upload new source (CSV) + auto-trigger pipeline
└── /[id]                   Source detail + preview + download
/pipelines                  ETL pipeline list + status
├── /new                    Pipeline designer (visual canvas)
└── /[id]                   Pipeline detail + runs + logs
/lakehouse                  Data explorer (tab: Bronze | Silver | Gold)
├── /bronze/[table]         Table detail + schema + preview
├── /silver/[table]         Table detail
└── /gold/[table]           Table detail
/dashboards                 Dashboard list
├── /new                    Dashboard builder (drag & drop)
├── /[id]                   View dashboard (read-only)
├── /[id]?edit=ID           Edit dashboard (builder mode)
├── /[id]/print             Print layout view
└── /share/[token]          Public shared dashboard (read-only)
/api/**                     REST API routes
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

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| **Auth** | | | |
| POST | `/api/auth/login` | Login (email + password) | Public |
| POST | `/api/auth/logout` | Logout | JWT |
| GET | `/api/auth/session` | Current session | JWT |
| **Sources** | | | |
| GET | `/api/sources` | List all sources | JWT |
| POST | `/api/sources` | Create/upload source | JWT |
| GET | `/api/sources/[id]` | Source detail | JWT |
| DELETE | `/api/sources/[id]` | Delete source | JWT |
| **Pipelines** | | | |
| GET | `/api/pipelines` | List pipelines + steps + runs | JWT |
| POST | `/api/pipelines` | Create pipeline | JWT |
| GET | `/api/pipelines/[id]` | Pipeline detail + steps | JWT |
| PUT | `/api/pipelines/[id]` | Update pipeline | JWT |
| DELETE | `/api/pipelines/[id]` | Delete pipeline | JWT |
| POST | `/api/pipelines/[id]/run` | Execute pipeline | JWT |
| **Lakehouse** | | | |
| GET | `/api/lakehouse/[layer]` | List tables in layer | JWT |
| GET | `/api/lakehouse/[layer]/[table]` | Table preview (100 rows) | JWT |
| GET | `/api/lakehouse/[layer]/[table]/schema` | Table schema (columns + types) | JWT |
| GET | `/api/lakehouse/[layer]/[table]/distinct` | Distinct values for column | JWT |
| DELETE | `/api/lakehouse/[layer]/[table]` | Drop table permanently | JWT |
| GET | `/api/lakehouse/tables` | All tables across layers | JWT |
| **Dashboards** | | | |
| GET | `/api/dashboards` | List dashboards | JWT |
| POST | `/api/dashboards` | Create dashboard | JWT |
| GET | `/api/dashboards/[id]` | Dashboard detail + widgets | JWT |
| PUT | `/api/dashboards/[id]` | Update layout + widgets | JWT |
| DELETE | `/api/dashboards/[id]` | Delete dashboard | JWT |
| GET | `/api/dashboards/[id]/data` | Widget data refresh | JWT |
| GET | `/api/dashboards/[id]/export` | Export dashboard data | JWT |
| POST | `/api/dashboards/[id]/share` | Generate share token | JWT |
| GET | `/api/public/dashboards/[token]` | Public shared dashboard | Public |
| **Metabase** | | | |
| POST | `/api/metabase/auto-dashboard` | Auto-generate Metabase dashboard | JWT |

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

### 8.1 Core Models

```prisma
model User {
  id         Int          @id @default(autoincrement())
  email      String       @unique
  password   String       // bcrypt hashed
  name       String?
  tenantId   Int?
  tenant     Tenant?      @relation(fields: [tenantId], references: [id])
  createdAt  DateTime     @default(now())
}

model Tenant {
  id         Int          @id @default(autoincrement())
  name       String
  slug       String       @unique
  createdAt  DateTime     @default(now())
  users      User[]
  sources    DataSource[]
  pipelines  Pipeline[]
  dashboards Dashboard[]
}

// ---- Data Sources ----
model DataSource {
  id          Int         @id @default(autoincrement())
  userId      Int
  tenantId    Int?
  name        String
  type        String      // "CSV" | "EXCEL" | "JSON" | "API" | "DATABASE"
  fileName    String?     // original uploaded filename
  fileSize    Int?        // bytes
  config      String      @default("{}")  // JSON: connection details
  columns     Int?        // detected column count
  rowsCount   Int?        // detected row count
  status      String      @default("UPLOADING")  // UPLOADING | READY | ERROR
  errorMsg    String?
  lastSyncAt  DateTime?
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
  pipelines   Pipeline[]
}

// ---- ETL Pipelines ----
model Pipeline {
  id          Int           @id @default(autoincrement())
  userId      Int
  sourceId    Int?
  tenantId    Int?
  name        String
  description String?
  schedule    String?       // Cron expression (future)
  status      String        @default("DRAFT")  // DRAFT | ACTIVE | ARCHIVED
  source      DataSource?   @relation(fields: [sourceId], references: [id])
  steps       PipelineStep[]
  runs        PipelineRun[]
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
}

model PipelineStep {
  id          Int       @id @default(autoincrement())
  pipelineId  Int
  pipeline    Pipeline  @relation(fields: [pipelineId], references: [id], onDelete: Cascade)
  order       Int
  type        String    // SOURCE | CLEAN | VALIDATE | TRANSFORM | JOIN | FILTER | CATEGORIZE | AGGREGATE | SORT | PIVOT | OUTPUT
  config      String    @default("{}")  // JSON: step-specific config
  inputLayer  String?   // bronze | silver | gold
  outputLayer String?   // bronze | silver | gold
  outputTable String?   // target table name
  positionX   Float     @default(0)
  positionY   Float     @default(0)
}

model PipelineRun {
  id           Int       @id @default(autoincrement())
  pipelineId   Int
  pipeline     Pipeline  @relation(fields: [pipelineId], references: [id], onDelete: Cascade)
  status       String    // PENDING | RUNNING | SUCCESS | FAILED
  startedAt    DateTime?
  finishedAt   DateTime?
  duration     Int?      // milliseconds
  rowsInput    Int?
  rowsOutput   Int?
  errorMessage String?
  logs         String?   // text logs from ETL worker
  createdAt    DateTime  @default(now())
}

// ---- Dashboard ----
model Dashboard {
  id          Int       @id @default(autoincrement())
  userId      Int
  tenantId    Int?
  name        String
  description String?
  widgets     Widget[]
  layout      String    @default("[]")  // JSON: react-grid-layout config
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}

model Widget {
  id          Int       @id @default(autoincrement())
  dashboardId Int
  dashboard   Dashboard @relation(fields: [dashboardId], references: [id], onDelete: Cascade)
  type        String    // KPI | BAR | LINE | PIE | AREA | TABLE | TEXT
  title       String
  config      String    @default("{}")  // JSON: { dataSource, xField, yField, aggregation, filters, layer }
  gridX       Int       @default(0)
  gridY       Int       @default(0)
  gridW       Int       @default(4)
  gridH       Int       @default(3)
}
```

### 8.2 Lakehouse Tables (Dynamic)

Lakehouse tables dibuat dinamis via ETL pipeline output — bukan model Prisma statis. Setiap pipeline step dengan `outputTable` akan membuat tabel PostgreSQL di schema `bronze`, `silver`, atau `gold`.

```
Schema:  bronze  →  public (tabel dengan prefix atau direct)
         silver  →  tabel hasil CLEAN/VALIDATE/TRANSFORM
         gold    →  tabel hasil AGGREGATE/JOIN (analytics-ready)
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
- **Dark theme** — deep charcoal background (`#0d0d0c`)
- **Batik Gold** — warm, earthy, anti-AI aesthetic (gold, clay, amber)
- **Serif display font** (Newsreader italic) + clean body font (DM Sans)
- **Card-based layout** with subtle borders
- **Drag & drop** interactions with visual feedback
- **Real-time** progress indicators
- **Responsive** — works on desktop & tablet
- **No emoji** — Lucide icons only

### 10.2 Color Palette (Batik Gold)
```
Background:    #0d0d0c  (deep charcoal)
Surface:       #1a1917  (warm dark card)
Border:        rgba(212,168,83,0.12)  (gold subtle)
Primary:       #D4A853  (batik gold)
Primary Dim:   rgba(212,168,83,0.08)  (gold whisper)
Text Primary:  #e8e4db  (warm white)
Text Muted:    #8a8578  (clay)
Accent Safety: #4d7c5a  (sage green, for success)
Accent Danger:  #b85c3a  (terracotta, for errors)
Accent Warning: #c4953e  (amber gold, for warnings)
```

### 10.3 Typography
```
Font Display:  Newsreader (serif, italic) — headings & brand
Font Body:     DM Sans (sans-serif) — body text & UI
Font Mono:     JetBrains Mono — code & data
```

---

## 11. Development Phases

### Phase 1: Foundation ✅ COMPLETE
- [x] Project scaffold (Next.js 16 + Prisma + PostgreSQL 16)
- [x] Auth system (login, JWT localStorage, AuthGuard, authFetch)
- [x] Data source CRUD (CSV upload, chunked, success screen)
- [x] Auto pipeline trigger after upload
- [x] Lakehouse schema creation (bronze, silver, gold)
- [x] Multi-tenant support (tenantId isolation)
- [x] Batik Gold design system (dark theme, gold palette)

### Phase 2: ETL Engine ✅ COMPLETE
- [x] Python ETL worker (Pandas transformation)
- [x] Pipeline designer UI (visual canvas + toolbox)
- [x] All pipeline steps: SOURCE, CLEAN, VALIDATE, TRANSFORM, JOIN, FILTER, CATEGORIZE, AGGREGATE, SORT, PIVOT, OUTPUT
- [x] Bronze, Silver & Gold layer transformations
- [x] Pipeline run with logs, duration, row counts
- [x] Upload → Auto-create pipeline → Auto-run flow

### Phase 3: Dashboard ✅ COMPLETE
- [x] All chart widgets: KPI, BAR, LINE, PIE, AREA, TABLE
- [x] Drag & drop dashboard builder (react-grid-layout)
- [x] Widget configuration panel (data source, layer, axes, aggregation)
- [x] Aggregation dropdown (COUNT, SUM, AVG, MIN, MAX)
- [x] `detectColumnType` with name-based categorical detection (`*_account`, `*_id`, etc.)
- [x] Batik Gold 8-color palette for charts
- [x] Edit mode via `?edit=ID` URL parameter
- [x] Table widget with sort, search, pagination
- [x] Print layout view

### Phase 4: Polish 🚧 IN PROGRESS
- [x] Auth: localStorage JWT, authFetch on all endpoints
- [x] Instant delete (no page refresh) on Sources, Pipelines, Lakehouse
- [x] Download raw CSV from data source
- [x] Pipeline detail view with run history
- [x] Lakehouse detail view with schema + preview
- [x] **Gold layer differentiation**: enforcement (AGGREGATE/JOIN/PIVOT before GOLD), Gold templates (monthly, top N, breakdown, KPI), Gold UI metric cards
- [x] **Multi-output pipelines**: satu pipeline bisa output ke Silver + Gold
- [x] API connector (REST, webhook)
- [ ] Database connector (PostgreSQL, MySQL)
- [ ] Export dashboard (PDF, CSV, Image)
- [ ] Dashboard share via public link
- [ ] Dashboard templates
- [x] Data quality rules / step-level validations
- [ ] Multi-user RBAC
- [ ] Scheduled pipeline (cron)
- [x] Nginx + domain setup (ekosuryahadi.web.id + SSL)
- [ ] WebSocket real-time pipeline progress
- [ ] DuckDB integration for fast analytical queries
- [x] Security & Reliability (SQL Sanitization, Staging Transactions, Auto-backups, OOM protection)
- [x] Incremental & Delta loads (Overwrite, Append, Upsert UI + Engine)
- [ ] Git push + CI/CD

---

## 12. Key Features (Implemented)

### 12.1 Upload → Pipeline Auto-Trigger
Upload CSV langsung otomatis membuat pipeline dan me-run:
```
User upload CSV
  → File disimpan ke /tmp
  → Data diparsing dengan Pandas (detect delimiter, encoding, schema)
  → Dibuat DataSource (status: READY)
  → Otomatis POST /api/pipelines → pipeline "Quick Clean → Silver"
  → Otomatis POST /api/pipelines/[id]/run → ETL worker jalan
  → Success screen dengan link "View Pipeline Details"
```

### 12.2 Dashboard Widget System
6 widget types tersedia dengan full config:

| Widget | Type | Config |
|--------|------|--------|
| KPI Card | `KPI` | Aggregation (COUNT/SUM/AVG/MIN/MAX), value field, optional filter |
| Bar Chart | `BAR` | X-axis (categorical), Y-axis (numeric), aggregation, descending sort |
| Line Chart | `LINE` | X-axis (categorical), Y-axis (numeric), aggregation, ascending sort |
| Pie Chart | `PIE` | Labels (xField), aggregation, value field, donut style |
| Area Chart | `AREA` | X-axis, Y-axis, aggregation, stacked with gradient fill |
| Table | `TABLE` | All columns, sortable headers, search, pagination 20 rows |

### 12.3 Smart Column Detection (`detectColumnType`)
```typescript
// Kolom bigint dengan nama *_account, *_no, *_id, *_code → categorical
// bukan numeric — sehingga tidak muncul di Y-axis chart
function detectColumnType(colName: string, pgType: string): "numeric" | "categorical" | "date" | "text"
```

### 12.4 Instant Delete (Client-Side State)
Delete di Sources, Pipelines, Lakehouse langsung menghapus dari `useState` lokal:
- Tidak perlu page refresh
- Badge count langsung update
- Pattern: `onDeleted` callback → `setXxx(prev => prev.filter(...))`

### 12.5 Auth Architecture
```
localStorage key: gaung_auth
Format:        { token: string, user: { id, email, name } }
Client:        authFetch() — wraps fetch with Authorization header
Guard:         AuthGuard component on all pages
API:           /api/auth/login, /api/auth/session, /api/auth/logout
```

### 12.6 Gold Layer Differentiation
Gold benar-benar berbeda dari Silver — bukan copy-paste:

**Pipeline Enforcement:**
- API (POST/PUT) validasi: OUTPUT ke GOLD HARUS didahului AGGREGATE, JOIN, atau PIVOT
- Client-side: warning di UI saat pilih GOLD di OUTPUT dropdown
- Error: 400 "OUTPUT to GOLD layer requires a preceding AGGREGATE, JOIN, or PIVOT step"

**Gold Templates (4 baru):**
| Template | Steps | Output |
|----------|-------|--------|
| 📅 Monthly Rollup | SOURCE → CLEAN → AGGREGATE | Gold (group by month) |
| 🏆 Top 10 | SOURCE → CLEAN → AGGREGATE → SORT → FILTER | Gold (top 10) |
| 📊 Status Breakdown | SOURCE → CLEAN → CATEGORIZE → AGGREGATE | Gold (per category) |
| 📈 KPI Summary | SOURCE → CLEAN → AGGREGATE | Gold (MIN/MAX/AVG/SUM/COUNT) |

**Gold UI (Lakehouse):**
- Metric cards: tampilkan 3 KPI dari first row 
- Grid KPI dengan gold accent
- Empty state khusus: "No Gold Metrics yet"
- Berbeda visual dari Bronze/Silver

**Demo:** `bank_rekon_silver_v2` (50 rows) → `bank_rekon_gold_summary` (6 rows aggregated by Recon_Status)

### 12.7 Transactional & Backup Output (Staging Pattern)
Tiap write step melakukan penulisan ke table temporer:
```sql
-- Transaction block
BEGIN;
CREATE TABLE "silver"."sales__tmp_17823812" (...);
INSERT INTO "silver"."sales__tmp_17823812" VALUES (...); -- batch execution
ALTER TABLE "silver"."sales" RENAME TO "sales__bak_20260709212210"; -- backup old
ALTER TABLE "silver"."sales__tmp_17823812" RENAME TO "sales"; -- rename staging to active
COMMIT;
```
Snapshots cadangan yang lebih tua dari 3 versi terakhir dibersihkan secara terjadwal.

### 12.8 Auto Bronze Ingestion & Data Lineage Tracking
File CSV/Excel yang diunggah ke portal data source langsung diproses secara asinkronus ke Bronze layer database:
- Nama tabel: `bronze.csv_{sourceId}`
- Audit tracking: Kolom metadata `_ingested_at` dan `_source_id` disematkan secara otomatis.
- Data lineage di layer Silver & Gold melacak asal data melalui kolom `_etl_timestamp`, `_pipeline_run_id`, dan `_source_pipeline_id`.

### 12.9 Incremental/Delta Loads
User dapat mengonfigurasi opsi muatan data di UI designer:
- Append mode: menyalin baris data staging ke target utama tanpa menghapus data sebelumnya.
- Upsert mode: memerlukan primary key yang ditentukan user guna mengeksekusi statement:
  ```sql
  INSERT INTO "silver"."sales" (...) SELECT ... FROM staging
  ON CONFLICT ("id") DO UPDATE SET "amount" = EXCLUDED."amount", ...
  ```

---

## 13. Success Metrics

| Metric | Target |
|--------|--------|
| Time from upload to visualization | < 5 minutes |
| Pipeline success rate | > 99% |
| Dashboard load time | < 2 seconds |
| Max file upload | 100 MB |
| Concurrent users | 50+ |
| Browser support | Chrome, Firefox, Safari, Edge (last 2 versions) |

---

*Last updated: 5 July 2026*
