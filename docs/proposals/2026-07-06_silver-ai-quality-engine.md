# Gaung v2.4 — Silver AI Data Quality Engine

## Proposal Refactoring

**Tanggal:** 6 Juli 2026
**Versi:** 1.0
**Status:** Draft — Menunggu Review
**Penulis:** Hermes Agent (AI Architect)

---

## Daftar Isi

1. [Ringkasan Eksekutif](#1-ringkasan-eksekutif)
2. [Masalah Saat Ini](#2-masalah-saat-ini)
3. [Visi & Tujuan](#3-visi--tujuan)
4. [Arsitektur Target](#4-arsitektur-target)
5. [Rencana Implementasi](#5-rencana-implementasi)
6. [Estimasi & Timeline](#6-estimasi--timeline)
7. [Risiko & Mitigasi](#7-risiko--mitigasi)
8. [Success Metrics](#8-success-metrics)

---

## 1. Ringkasan Eksekutif

**Gaung v2.3** saat ini memiliki pipeline ETL 3-layer (Bronze → Silver → Gold) yang berfungsi dengan baik. Namun, implementasi **Silver layer** masih bersifat prosedural dan monolitik — hanya melakukan cleaning sederhana (strip whitespace, deduplikasi, fill nulls) tanpa introspeksi data.

**Proposal ini mengusulkan refactoring Silver layer** menjadi **AI Data Quality Engine** yang modular dan enterprise-grade, dengan kemampuan:

- ✅ Data Profiling otomatis
- ✅ Dataset Classification (IoT, Finance, Sales, ERP, HR)
- ✅ Plugin-based Cleaning & Validation Modules
- ✅ YAML-driven Rule Engine
- ✅ Quality Scoring (completeness, validity, consistency)
- ✅ Structured Audit Trail
- ✅ AI Explainability & Recommendation

**Dampak:** Zero downtime, backward compatible. Existing pipeline tetap berjalan tanpa perubahan.

---

## 2. Masalah Saat Ini

### 2.1 Arsitektur Monolitik

```
┌─────────────────────────────────────────────────────────┐
│              CURRENT: etl_runner.py (768 lines)          │
│              Semua logic dalam 1 file                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  def load_source()     ─┐                                │
│  def load_lakehouse()   ├── 40 lines                     │
│                         │                                │
│  def step_clean()      ─┤                                │
│  def step_validate()    ├── 300+ lines                   │
│  def step_transform()   │   Mixed concerns               │
│  def step_filter()      │                                 │
│  def step_categorize()  │                                 │
│  def step_aggregate()   │                                 │
│  def step_sort()       ─┘                                │
│  def step_join()                                         │
│                                                          │
│  def write_output()    ─── 60 lines                      │
│  def run_pipeline()    ─── 100 lines (main loop)         │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Pain Points

| # | Masalah | Dampak Bisnis |
|---|---|---|
| 1 | **Rule hardcode** di kode Python | Setiap ubah rule bisnis harus deploy ulang |
| 2 | **Tidak ada profiling** | User tidak tahu kualitas data sebelum diproses |
| 3 | **Tidak ada quality scoring** | Tidak bisa ukur "seberapa bersih data saya?" |
| 4 | **Tidak ada audit trail** | Tidak tahu apa yang terjadi pada data (compliance risk) |
| 5 | **Tidak ada explainability** | Kalau data di-flag, tidak ada penjelasan kenapa |
| 6 | **Tidak modular** | Tambah fitur = edit file utama (high risk of regression) |
| 7 | **Tidak ada rekomendasi** | User harus tahu sendiri apa yang perlu dilakukan |

### 2.3 Data Flow Saat Ini

```
┌──────────┐     ┌───────────────────────┐     ┌──────────┐
│  BRONZE  │────→│  CLEAN (strip, dedup)  │────→│  SILVER  │
│  (raw)   │     │  VALIDATE (opsional)   │     │  (clean) │
└──────────┘     └───────────────────────┘     └──────────┘
                        ↑
                   User harus setup
                   manual semua rule
```

---

## 3. Visi & Tujuan

### 3.1 Vision Statement

> **"Silver layer menjadi AI-powered Data Quality Engine yang secara otomatis memahami, membersihkan, memvalidasi, dan menilai kualitas data — tanpa user harus menjadi data engineer."**

### 3.2 Tujuan Spesifik

| # | Tujuan | Metric |
|---|---|---|
| 1 | Data Profiling otomatis | Setiap data yang masuk Silver di-profile dalam < 5 detik |
| 2 | Dataset auto-classification | Akurasi ≥ 85% untuk 6 kategori domain |
| 3 | Rule dari YAML (bukan hardcode) | 0 hardcoded rules di kode Python |
| 4 | Quality Score 0-100 | User bisa lihat skor kualitas per dataset |
| 5 | Audit Trail lengkap | 100% module tercatat: timing, rows affected, warnings |
| 6 | Modular (plugin) | Tambah module baru tanpa ubah existing code |
| 7 | Backward compatible | 0 perubahan pada pipeline yang sudah ada |

### 3.3 Prinsip Desain

```
┌────────────────────────────────────────────────────────────┐
│                    DESIGN PRINCIPLES                        │
├────────────────────────────────────────────────────────────┤
│                                                             │
│   🧹 CLEAN ARCHITECTURE                                     │
│      Dependency rule: outer → inner, never inner → outer   │
│                                                             │
│   🧩 PLUGIN ARCHITECTURE                                    │
│      Setiap module = plugin independen dengan interface     │
│      yang sama. Tambah/hapus module tanpa refactor.        │
│                                                             │
│   📐 SOLID PRINCIPLES                                       │
│      S - Single Responsibility (satu module, satu tugas)    │
│      O - Open/Closed (terbuka untuk ekstensi, tertutup     │
│          untuk modifikasi)                                  │
│      L - Liskov Substitution (semua module bisa di-swap)   │
│      I - Interface Segregation (interface kecil & fokus)    │
│      D - Dependency Injection (module tidak buat own deps) │
│                                                             │
│   🔧 MODULAR DESIGN                                         │
│      Setiap module = 1 file, 1 tanggung jawab, testable    │
│                                                             │
│   📝 YAML-DRIVEN RULES                                      │
│      Zero hardcode. Semua rule dari file .yaml              │
│      Version-controlled, human-readable, auditable         │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

---

## 4. Arsitektur Target

### 4.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    GAUNG v2.4 — SILVER AI ENGINE                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│                          ┌─────────────┐                             │
│                          │   BRONZE    │                             │
│                          │  (raw data) │                             │
│                          └──────┬──────┘                             │
│                                 │                                    │
│                                 ▼                                    │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                   SILVER ORCHESTRATOR                         │   │
│  │                   (silver/engine/orchestrator.py)             │   │
│  │                                                               │   │
│  │  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │   │
│  │  │ PROFIL  │→│CLASSIFY  │→│  LOAD    │→│  CLEAN   │      │   │
│  │  │  data   │ │ dataset  │ │  modules │ │  data    │      │   │
│  │  └─────────┘  └──────────┘  └──────────┘  └──────────┘      │   │
│  │       │             │              │              │          │   │
│  │       ▼             ▼              ▼              ▼          │   │
│  │  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │   │
│  │  │VALIDATE │→│  SCORE   │→│  AUDIT   │→│ RECOMMEND│      │   │
│  │  │ rules   │ │ quality  │ │  trail   │ │  actions │      │   │
│  │  └─────────┘  └──────────┘  └──────────┘  └──────────┘      │   │
│  │                                                               │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                 │                                    │
│                                 ▼                                    │
│                          ┌─────────────┐                             │
│                          │   SILVER    │                             │
│                          │ (clean,     │                             │
│                          │  validated, │                             │
│                          │  scored)    │                             │
│                          └──────┬──────┘                             │
│                                 │                                    │
│                                 ▼                                    │
│                          ┌─────────────┐                             │
│                          │    GOLD     │                             │
│                          │ (aggregated)│                             │
│                          └─────────────┘                             │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                      SUPPORTING SYSTEMS                       │   │
│  │                                                               │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐    │   │
│  │  │ Rule Engine   │  │ AI Services  │  │ Quality Database │    │   │
│  │  │ (YAML files)  │  │ (classifier, │  │ (Prisma models)  │    │   │
│  │  │               │  │  recommender,│  │ SilverRun,       │    │   │
│  │  │ finance.yaml  │  │  explain)    │  │ AuditLog         │    │   │
│  │  │ iot.yaml      │  │               │  │                  │    │   │
│  │  │ sales.yaml    │  │               │  │                  │    │   │
│  │  │ erp.yaml      │  │               │  │                  │    │   │
│  │  │ hr.yaml       │  │               │  │                  │    │   │
│  │  └──────────────┘  └──────────────┘  └──────────────────┘    │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Module Architecture (Plugin System)

```
                    ┌─────────────────────────┐
                    │     BaseModule (ABC)     │
                    │                          │
                    │  + run(df, ctx)          │
                    │    → Tuple[DataFrame,    │
                    │       SilverContext]     │
                    │                          │
                    │  + name: str             │
                    │  + version: str          │
                    │  + description: str      │
                    └────────────┬────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
┌────────┴────────┐   ┌─────────┴────────┐   ┌─────────┴────────┐
│  Profiling      │   │  Cleaning        │   │  Validation      │
│  Module         │   │  Modules         │   │  Modules         │
├─────────────────┤   ├──────────────────┤   ├──────────────────┤
│ • Row count     │   │ • DataType       │   │ • YAML Rule      │
│ • Column stats  │   │ • Timestamp      │   │   Engine         │
│ • Null %        │   │ • Duplicate      │   │ • Cross-column   │
│ • Duplicate %   │   │ • Missing        │   │ • Regex patterns │
│ • Outlier %     │   │ • Outlier        │   │ • Enum check     │
│ • Memory usage  │   │ • Enrichment     │   │ • Range check    │
└─────────────────┘   └──────────────────┘   └──────────────────┘
         │                       │                       │
┌────────┴────────┐   ┌─────────┴────────┐   ┌─────────┴────────┐
│  AI Services    │   │  Quality         │   │  Audit           │
├─────────────────┤   ├──────────────────┤   ├──────────────────┤
│ • Classifier    │   │ • Completeness   │   │ • Module timing  │
│ • Recommender   │   │ • Validity       │   │ • Row counts     │
│ • Explainability│   │ • Consistency    │   │ • Warnings       │
│ • Anomaly       │   │ • Uniqueness     │   │ • Errors         │
│   Detection     │   │ • Overall 0-100  │   │ • Structured log │
└─────────────────┘   └──────────────────┘   └──────────────────┘
```

### 4.3 Data Flow Detail (Silver Pipeline)

```
INPUT: DataFrame dari Bronze + Pipeline Config
                    │
    ┌───────────────┴───────────────┐
    │  STEP 1: PROFILING            │
    │  ─────────────────            │
    │  Input:  df (raw)             │
    │  Output: ctx.profile          │
    │  • rows: 10,000               │
    │  • cols: 15                   │
    │  • missing: 3.2%              │
    │  • duplicates: 0.1%           │
    │  • outliers: 1.5%             │
    │  • memory: 2.4 MB             │
    │  • column_types detected      │
    └───────────────┬───────────────┘
                    │
    ┌───────────────┴───────────────┐
    │  STEP 2: CLASSIFICATION       │
    │  ─────────────────────        │
    │  Heuristic check:             │
    │  • "temperature" + "humidity" │
    │    → IoT Sensor Data          │
    │  Confidence: 92%              │
    │                               │
    │  ctx.dataset_class = "iot"    │
    └───────────────┬───────────────┘
                    │
    ┌───────────────┴───────────────┐
    │  STEP 3: LOAD RULES           │
    │  ─────────────────            │
    │  Load: rules/iot.yaml         │
    │  • temperature: -40 to 125    │
    │  • humidity: 0 to 100         │
    │  • battery: 2.8 to 4.2        │
    │  • timestamp format: ISO8601  │
    └───────────────┬───────────────┘
                    │
    ┌───────────────┴───────────────┐
    │  STEP 4: CLEANING             │
    │  ───────────────              │
    │  Run modules in order:        │
    │  • DataType (type casting)    │
    │  • Timestamp (normalize)      │
    │  • Duplicate (remove)         │
    │  • Missing (interpolate)      │
    │  • Outlier (flag, optional    │
    │    drop)                      │
    │                               │
    │  Each module logs:            │
    │  • execution time             │
    │  • rows modified              │
    │  • warnings generated         │
    └───────────────┬───────────────┘
                    │
    ┌───────────────┴───────────────┐
    │  STEP 5: VALIDATION           │
    │  ─────────────────            │
    │  Run YAML rules against df:   │
    │  • temperature: 3 rows >125   │
    │  • humidity: 12 rows >100     │
    │  • battery: 0 violations      │
    │                               │
    │  Mode: "flag" (add column)    │
    │  _validation_issues added     │
    └───────────────┬───────────────┘
                    │
    ┌───────────────┴───────────────┐
    │  STEP 6: QUALITY SCORING      │
    │  ────────────────────         │
    │  Completeness:  96.8%  █████  │
    │  Validity:      91.2%  ████   │
    │  Consistency:   99.9%  █████  │
    │  Uniqueness:    99.9%  █████  │
    │  Timeliness:   100%   █████   │
    │  ─────────────────────────    │
    │  OVERALL:       94.2%  ████   │
    └───────────────┬───────────────┘
                    │
    ┌───────────────┴───────────────┐
    │  STEP 7: AUDIT LOG            │
    │  ───────────────              │
    │  Structured audit entries     │
    │  saved to ctx.audit_trail     │
    │  (also to DB if enabled)      │
    └───────────────┬───────────────┘
                    │
    ┌───────────────┴───────────────┐
    │  STEP 8: RECOMMENDATION       │
    │  ────────────────────         │
    │  Based on profile + quality:  │
    │                               │
    │  📋 Dataset: IoT Sensor       │
    │  ⚠️  Humidity outliers tinggi │
    │  💡 Rekomendasi:              │
    │    ✓ Pasang alert humidity>95 │
    │    ✓ Cek sensor ID: SENSOR-7  │
    │    ✓ Buat dashboard monitoring│
    └───────────────┬───────────────┘
                    │
                    ▼
OUTPUT: Clean DataFrame + SilverContext (profile, scores, audit, recommendations)
                    │
                    ▼
              SILVER LAYER (PostgreSQL schema: silver)
```

### 4.4 Database Schema (New Models)

```sql
-- Silver Quality Run (one per pipeline execution)
CREATE TABLE "SilverRun" (
    id          SERIAL PRIMARY KEY,
    runId       INTEGER NOT NULL REFERENCES "PipelineRun"(id),
    tenantId    INTEGER REFERENCES "Tenant"(id),
    
    -- Profile (JSON snapshot)
    profileJson     JSONB,   -- DataProfile output
    
    -- Classification
    datasetClass    VARCHAR(50),  -- iot, finance, sales, erp, hr, general
    classConfidence DECIMAL(3,2), -- 0.00 - 1.00
    
    -- Quality Scores
    completeness    DECIMAL(5,2), -- 0.00 - 100.00
    validity        DECIMAL(5,2),
    consistency     DECIMAL(5,2),
    uniqueness      DECIMAL(5,2),
    timeliness      DECIMAL(5,2),
    overallScore    DECIMAL(5,2),
    
    -- Audit
    auditTrailJson  JSONB,   -- Array of AuditEntry
    totalWarnings   INTEGER DEFAULT 0,
    totalErrors     INTEGER DEFAULT 0,
    
    -- Recommendations
    recommendationsJson JSONB,  -- Array of Recommendation
    
    -- Timing
    profilingMs     INTEGER,
    cleaningMs      INTEGER,
    validationMs    INTEGER,
    totalMs         INTEGER,
    
    createdAt   TIMESTAMP DEFAULT NOW()
);

-- Optional: Structured Audit Log
CREATE TABLE "AuditLog" (
    id          SERIAL PRIMARY KEY,
    runId       INTEGER NOT NULL REFERENCES "PipelineRun"(id),
    moduleName  VARCHAR(100) NOT NULL,
    executionMs INTEGER,
    rowsBefore  INTEGER,
    rowsAfter   INTEGER,
    rowsModified INTEGER,
    warnings    TEXT[],
    errors      TEXT[],
    createdAt   TIMESTAMP DEFAULT NOW()
);
```

---

## 5. Rencana Implementasi

### 5.1 Phased Approach

```
Phase 0       Phase 1        Phase 2        Phase 3
Foundation    Core Modules   Rules + YAML   Scoring+Audit
   ⬡             ⬡              ⬡              ⬡
  Setup       Profiling      YAML Rules     Quality Score
  Types       DataType       Finance.yaml   Completeness
  BaseModule  Timestamp      IoT.yaml       Validity
  Loader      Duplicate      Sales.yaml     Consistency
              Missing        ERP.yaml       Audit Trail
              Outlier        HR.yaml        Structured Log
              Validation     Generic.yaml
              Enrichment

   60 min       185 min         95 min          65 min


Phase 4       Phase 5         Phase 6
AI Services   Integration     Frontend
   ⬡             ⬡              ⬡
Classifier    Orchestrator    Quality Badge
Recommender   Pipeline API    Score Panel
Explain       etl_runner      Pipeline Step
Anomaly       Prisma Models
              API Routes
              Integration Test

   85 min       105 min         65 min


TOTAL: ~11 jam (42 tasks)
```

### 5.2 Timeline

```
Week 1                          Week 2
─────────────────────────────────────────────────────
│ Mon │ Tue │ Wed │ Thu │ Fri │ Mon │ Tue │ Wed │
├─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┤
│ P0  │ P1  │ P1  │ P2  │ P3  │ P4  │ P5  │ P6  │
│ 1h  │ 3h  │ 3h  │ 2h  │ 2h  │ 2h  │ 2h  │ 2h  │
└─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┘
      ↑                         ↑
   Review                   Review
   Point #1                 Point #2
```

### 5.3 Milestones

| Milestone | Deliverable | Tanggal Target |
|---|---|---|
| **M1: Foundation** | silver/ package + BaseModule + tests | Hari 1 |
| **M2: Modules** | 8 cleaning modules + tests | Hari 2-3 |
| **M3: Rules** | 6 YAML rule files + rule engine | Hari 4 |
| **M4: Scoring** | Quality scoring + audit logging | Hari 5 |
| **M5: AI** | Classifier + recommender + explainability | Hari 6 |
| **M6: Integration** | Full pipeline end-to-end + deployment | Hari 7 |
| **M7: Go-Live** | Frontend + production release | Hari 8 |

---

## 6. Estimasi & Timeline

### 6.1 Effort Breakdown

| Kategori | Tasks | Estimasi | % Total |
|---|---|---|---|
| Foundation (P0) | 6 | 60 min | 9% |
| Core Modules (P1) | 8 | 185 min | 28% |
| Rules Engine (P2) | 8 | 95 min | 14% |
| Scoring & Audit (P3) | 4 | 65 min | 10% |
| AI Services (P4) | 5 | 85 min | 13% |
| Integration (P5) | 7 | 105 min | 16% |
| Frontend (P6) | 4 | 65 min | 10% |
| **TOTAL** | **42** | **~11 jam** | **100%** |

### 6.2 Dependencies

```
P0 ──→ P1 ──→ P2 ──→ P3 ──→ P4 ──→ P5 ──→ P6
       ↓              ↓              ↓
    (parallel    (P3 depends    (P4 depends
     possible     on P2 rules)   on P3 score
     for P1                      for context)
     modules)
```

### 6.3 Resource Requirements

| Resource | Kebutuhan |
|---|---|
| Developer | 1 (AI-assisted: Hermes Agent + Claude subagents) |
| Test Data | Sample CSV: IoT (100 rows), Sales (50 rows), Finance (30 rows) |
| Dependencies | pyyaml, scipy (already available), pandas (already used) |
| Database | PostgreSQL 16 (existing), 2 new tables |
| Downtime | **ZERO** — backward compatible deployment |

---

## 7. Risiko & Mitigasi

| # | Risiko | Prob | Impact | Mitigasi |
|---|---|---|---|---|
| R1 | Breaking existing pipelines | LOW | HIGH | Backward compat wrapper, 14-day deprecation window, integration tests |
| R2 | Performance overhead | MED | MED | Profile uses sampling. Modules process columns, not rows. Cache profile results. |
| R3 | YAML parsing errors | LOW | MED | Validate on load. Fallback to generic.yaml. Graceful degradation. |
| R4 | Memory usage for large datasets | MED | MED | Profile uses sampling. Stream processing for datasets > 100K rows. |
| R5 | Classifier wrong detection | LOW | LOW | Heuristic is deterministic. User can override. ML model optional. |
| R6 | Dependency conflicts | LOW | LOW | pyyaml and scipy are standard. No new exotic deps. |

**Risk Score:** LOW-MEDIUM (mostly mitigatable with design choices)

---

## 8. Success Metrics

### 8.1 Technical Metrics

| Metric | Target | Measurement |
|---|---|---|
| Code modularity | ≤ 200 lines per module | `wc -l worker/silver/modules/*.py` |
| Test coverage | ≥ 80% | `pytest --cov=silver` |
| Backward compat | 100% existing tests pass | Existing test suite |
| Profiling speed | ≤ 5 detik untuk 10K rows | Benchmark script |
| Quality score accuracy | ±5% dari ground truth | Manual audit 10 datasets |
| Classifier accuracy | ≥ 85% untuk 6 kategori | Test against labeled datasets |

### 8.2 Business Metrics

| Metric | Target | Impact |
|---|---|---|
| User onboarding time | -40% | Auto-classification + recommendation mengurangi setup manual |
| Data quality issues detected | +300% | Profiling + rule engine menemukan masalah yang sebelumnya invisible |
| Rule update cycle | Dari deploy → instant | YAML rules bisa diupdate tanpa deploy |
| Audit compliance | 100% traceability | Setiap transformasi tercatat dengan timestamp |
| User confidence | "Saya tahu kualitas data saya" | Quality score + explainability |

---

## 9. Appendix

### 9.1 Glossary

| Istilah | Definisi |
|---|---|
| **Bronze** | Raw data layer — exact copy dari source |
| **Silver** | Cleaned & validated data layer — target refactoring ini |
| **Gold** | Aggregated business-ready data layer |
| **Module** | Plugin independen dengan interface BaseModule |
| **Context** | Pass-through state object (profile, scores, audit, recommendations) |
| **Orchestrator** | Main coordinator yang menjalankan pipeline step-by-step |
| **Profiling** | Analisis statistik dataset (rows, cols, null%, dup%, outlier%) |
| **Quality Score** | Angka 0-100 yang mengukur kebersihan data |
| **Audit Trail** | Log terstruktur dari setiap operasi pada data |

### 9.2 File Structure Reference

```
worker/silver/                        ← NEW: 25 files
├── __init__.py
├── engine/          (3 files)       ← Orchestration layer
├── modules/         (11 files)      ← Plugin modules
├── rules/           (6 files)       ← YAML rule definitions
├── ai/              (4 files)       ← AI/ML services
├── models/          (1 file)        ← Data classes
└── utils/           (1 file)        ← Helpers

tests/silver/                        ← NEW: ~15 test files
├── test_types.py
├── test_module_loader.py
├── test_profiling.py
├── test_*.py (per module)
└── fixtures/
    ├── sample_iot.csv
    ├── sample_sales.csv
    └── sample_finance.csv

prisma/schema.prisma                 ← MODIFY: +2 models
app/api/pipelines/[id]/run/route.ts  ← MODIFY: +SilverRun storage
app/api/lakehouse/[layer]/route.ts   ← MODIFY: +quality scores
worker/etl_runner.py                 ← MODIFY: +step_silver() delegate
```

### 9.3 Key Design Decisions

| Keputusan | Alasan |
|---|---|
| Plugin architecture | Tambah module tanpa ubah core. Future-proof. |
| YAML rules | Version-controlled, human-readable, auditable. |
| Context object | Thread-safe, testable, clear data flow. |
| Heuristic classifier | Fast, deterministic, no training data needed. Swappable to ML later. |
| Backward compat | Zero risk deployment. Existing users unaffected. |
| Phased delivery | Value delivered incrementally. Risk contained per phase. |

---

> **Dokumen ini adalah proposal teknis untuk refactoring Silver layer Gaung.**
> **Decision awaited:** Approve / Revise / Reject
> **Next step setelah approval:** Phase 0 — Foundation Setup
