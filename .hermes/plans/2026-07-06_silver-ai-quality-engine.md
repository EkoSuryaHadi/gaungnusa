# Silver AI Data Quality Engine — Analysis & Roadmap

> **For Hermes:** Use subagent-driven-development to implement this plan task-by-task.
> **Status:** TAHAP 1 — ANALISIS (menunggu approval sebelum coding)

---

## 1. Current Architecture Analysis

### 1.1 Dependency Graph (Current)
```
┌──────────────────────────────────────────────────────────────┐
│                CURRENT SILVER ARCHITECTURE                    │
│                (Monolithic — perlu refactor)                  │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Frontend                    Backend API          Worker      │
│  ────────                    ───────────          ──────      │
│                                                               │
│  pipelines/new/page.tsx      api/pipelines/       worker/     │
│  ┌─────────────────────┐     [id]/run/route.ts   etl_runner.py│
│  │ ConfigState (11      │     ┌──────────────┐   ┌──────────┐│
│  │  step types)         │────→│ spawn py3    │──→│ 768 lines││
│  │                      │     │ etl_runner   │   │ MONOLITH ││
│  │ CLEAN config:        │     └──────────────┘   │          ││
│  │  stripWhitespace     │                        │step_clean││
│  │  deduplicate         │      ┌──────────────┐  │  (82 loc)││
│  │  fillNulls           │      │api/lakehouse/ │  │step_val  ││
│  │  fillNullsValue      │      │  [layer]/     │  │  (192loc)││
│  │                      │      │  route.ts     │  │step_trans││
│  │ VALIDATE config:     │      └──────────────┘  │  (22 loc)││
│  │  validationRules(str)│                        │step_agg  ││
│  │  validationMode      │      ┌──────────────┐  │  (67 loc)││
│  │                      │      │api/lakehouse/ │  │step_filt ││
│  │ OUTPUT config:       │      │  [layer]/     │  │  (17 loc)││
│  │  outputLayer=SILVER  │      │  [table]/     │  │step_cat  ││
│  │  outputTable         │      │  route.ts     │  │  (21 loc)││
│  └─────────────────────┘      └──────────────┘  │step_sort ││
│                                                   │  (10 loc)││
│  pipelines/run-button.tsx                         │step_join ││
│  ┌─────────────────────┐                          │  (16 loc)││
│  │ authFetch POST /run │                          │step_src  ││
│  └─────────────────────┘                          │  (16 loc)││
│                                                   └──────────┘│
│  Prisma Schema                                         │       │
│  ┌──────────────────────┐     ┌──────────────────────┐ │       │
│  │ PipelineStep         │     │ LakehouseTable       │ │       │
│  │  type: String        │     │  layer: SILVER|BRONZE│ │       │
│  │  config: JSON String │     │  tableName, schema.. │ │       │
│  │  outputLayer: String │     │  rowsCount, sizeBytes│ │       │
│  │  outputTable: String │     └──────────────────────┘ │       │
│  └──────────────────────┘                               │       │
│                                                         │       │
│  PostgreSQL 16 (port 5433)                              │       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │       │
│  │  BRONZE  │  │  SILVER  │  │   GOLD   │             │       │
│  │  schema  │  │  schema  │  │  schema  │             │       │
│  │  (raw)   │  │  (clean) │  │  (agg)   │             │       │
│  └──────────┘  └──────────┘  └──────────┘             │       │
└──────────────────────────────────────────────────────────────┘
```

### 1.2 Masalah Arsitektur Saat Ini

| # | Masalah | Dampak |
|---|---|---|
| 1 | **Monolithic etl_runner.py** (768 loc) | Semua logic campur: source, clean, validate, transform, output. Tidak modular. |
| 2 | **Rule hardcode** di `step_validate` | Rule didefinisikan sebagai string dengan format custom (NOT_NULL:col\nCOMPARE:...). Tidak reusable. |
| 3 | **Tidak ada profiling** | Data masuk langsung diproses tanpa analisis dulu. User tidak tahu kualitas data. |
| 4 | **Tidak ada quality scoring** | Tidak ada metrik untuk completeness, validity, consistency. User blind. |
| 5 | **Tidak ada audit trail terstruktur** | Hanya print() ke stdout. Tidak tersimpan, tidak queryable. |
| 6 | **Tidak ada dataset classification** | Tidak bisa auto-detect jenis data (IoT vs Finance vs Sales). |
| 7 | **Tidak ada recommendation engine** | Tidak ada saran otomatis apa yang harus dilakukan pada data. |
| 8 | **Tidak ada explainability** | Kalau validasi gagal, tidak ada penjelasan kenapa — hanya flagged. |
| 9 | **Config tersebar** di JSON string di DB | Rule, config, semua disimpan sebagai JSON string di Prisma. Sulit di-version control. |
| 10 | **Tidak ada dependency injection** | Semua hardcoded. Tidak bisa swap implementation. |

### 1.3 Data Flow Saat Ini
```
Upload CSV → SOURCE (load_file) → CLEAN (strip,dedup,fill) → OUTPUT(silver)
                                                               │
                                          VALIDATE (optional, manual config)
                                          TRANSFORM (optional)
                                          FILTER (optional)
```

## 2. Proposed Target Architecture

### 2.1 High-Level Design
```
┌─────────────────────────────────────────────────────────────────┐
│                  SILVER AI DATA QUALITY ENGINE                    │
│                  (Clean Architecture + Plugin System)            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  BRONZE DATA                                                     │
│      │                                                           │
│      ▼                                                           │
│  ┌──────────────────────────────────────────────────────┐       │
│  │              SILVER PIPELINE ORCHESTRATOR              │       │
│  │              (silver/engine/orchestrator.py)           │       │
│  │                                                       │       │
│  │  1. Profiling     ──→ silver/modules/profiling.py     │       │
│  │  2. Classification──→ silver/ai/classifier.py         │       │
│  │  3. Load Modules  ──→ silver/engine/module_loader.py  │       │
│  │  4. Run Cleaning  ──→ silver/modules/datatype.py      │       │
│  │                      silver/modules/timestamp.py      │       │
│  │                      silver/modules/duplicate.py      │       │
│  │                      silver/modules/missing.py        │       │
│  │                      silver/modules/outlier.py        │       │
│  │  5. Run Validation──→ silver/modules/validation.py    │       │
│  │                      silver/rules/finance.yaml        │       │
│  │                      silver/rules/iot.yaml etc...     │       │
│  │  6. Quality Scoring──→ silver/modules/scoring.py      │       │
│  │  7. Audit Logging  ──→ silver/modules/logging.py      │       │
│  │  8. Recommendations──→ silver/ai/recommender.py       │       │
│  │  9. Explainability ──→ silver/ai/explainability.py    │       │
│  │                                                       │
│  └──────────────────────────────────────────────────────┘       │
│      │                                                           │
│      ▼                                                           │
│  SILVER DATA (clean, validated, audited, scored)                 │
│      │                                                           │
│      ▼                                                           │
│  GOLD (optional: aggregations, dashboards)                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Module Architecture (Plugin Pattern)
```
                    ┌──────────────────┐
                    │   BaseModule      │  ← Abstract base
                    │   (ABC)           │
                    │                   │
                    │ + run(df, ctx)    │
                    │   → (df, ctx)     │
                    └────────┬─────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
  ┌──────┴──────┐   ┌───────┴──────┐   ┌────────┴──────┐
  │ DataType    │   │  Duplicate   │   │   Outlier      │
  │ Module      │   │  Module      │   │   Module       │
  └─────────────┘   └──────────────┘   └───────────────┘
         │                   │                   │
  ... 7 more modules with identical interface
```

### 2.3 Context Object (Pass-Through State)
```python
@dataclass
class SilverContext:
    # Profiling
    profile: Optional[DataProfile] = None
    dataset_class: Optional[str] = None
    
    # Quality
    quality_scores: dict = field(default_factory=dict)
    
    # Audit
    audit_trail: list = field(default_factory=list)
    module_timings: dict = field(default_factory=dict)
    
    # Warnings & Errors
    warnings: list = field(default_factory=list)
    errors: list = field(default_factory=list)
    
    # AI
    recommendations: list = field(default_factory=list)
    explanations: list = field(default_factory=list)
    
    # Tenant isolation
    tenant_id: Optional[int] = None
    pipeline_id: Optional[int] = None
    run_id: Optional[int] = None
```

## 3. File Mapping (What Changes Where)

### 3.1 NEW Files (silver/ package)
```
worker/silver/                          ← NEW package
├── __init__.py
├── engine/
│   ├── __init__.py
│   ├── orchestrator.py                ← Main pipeline coordinator
│   ├── pipeline.py                    ← Pipeline builder (fluent API)
│   └── module_loader.py               ← Dynamic module discovery
├── modules/
│   ├── __init__.py
│   ├── base.py                        ← BaseModule ABC
│   ├── profiling.py                   ← Data profiling engine
│   ├── datatype.py                    ← Type detection + casting
│   ├── timestamp.py                   ← Timestamp normalization
│   ├── duplicate.py                   ← Duplicate detection
│   ├── missing.py                     ← Missing value handler
│   ├── outlier.py                     ← Outlier detection (IQR, Z-score)
│   ├── validation.py                  ← Rule-based validation
│   ├── enrichment.py                  ← Data enrichment (lookups)
│   ├── scoring.py                     ← Quality scoring (0-100)
│   └── logging.py                     ← Structured audit logging
├── rules/
│   ├── finance.yaml                   ← Financial data rules
│   ├── iot.yaml                       ← IoT/sensor rules
│   ├── hr.yaml                        ← HR/payroll rules
│   ├── sales.yaml                     ← Sales/transaction rules
│   ├── erp.yaml                       ← ERP/inventory rules
│   └── generic.yaml                   ← Default rules
├── ai/
│   ├── __init__.py
│   ├── classifier.py                  ← Dataset classification
│   ├── recommender.py                 ← Recommendation engine
│   ├── explainability.py              ← Explain-AI
│   └── anomaly.py                     ← Anomaly detection (optional ML)
├── models/
│   ├── __init__.py
│   └── types.py                       ← DataProfile, AuditEntry, etc.
└── utils/
    ├── __init__.py
    └── helpers.py                     ← Common utilities
```

### 3.2 MODIFIED Files
```
worker/etl_runner.py                   ← Refactor: delegate to silver/ package
                                        ← Keep backward compat wrapper for 14 days
                                        ← Mark DEPRECATED after migration

worker/ws_reporter.py                   ← MINOR: add silver-specific progress events

app/api/pipelines/[id]/run/route.ts     ← MINOR: pass silver config from pipeline steps
app/api/lakehouse/[layer]/route.ts      ← MINOR: return quality scores in table metadata

prisma/schema.prisma                    ← ADD models:
                                        ←   SilverRun (quality metrics per run)
                                        ←   AuditLog (structured audit entries)
                                        ←   QualityRule (optional: DB-backed rules)

app/(app)/pipelines/new/page.tsx        ← MINOR: add "Silver Quality" step type
```

### 3.3 UNCHANGED (No touch)
```
worker/api_fetcher.py                   ← No changes
worker/db_fetcher.py                    ← No changes
worker/crypto_utils.py                  ← No changes
app/api/sources/route.ts                ← No changes (auto-ingest still to Bronze)
app/(app)/lakehouse/page.tsx            ← No changes
app/(app)/pipelines/page.tsx            ← No changes (run-button fix already done)
```

## 4. Dependency Graph (Target)

```
┌────────────────────────────────────────────────────────────────┐
│                     TARGET ARCHITECTURE                         │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  silver/rules/              silver/ai/                          │
│  ┌────────────┐            ┌───────────────┐                   │
│  │ finance.yaml│            │ classifier.py  │                  │
│  │ iot.yaml    │──rule──→  │ recommender.py │←──AI model swap  │
│  │ sales.yaml  │  loading  │ explainability │   ready           │
│  │ erp.yaml    │           │ anomaly.py     │                   │
│  │ hr.yaml     │           └───────┬───────┘                   │
│  │ generic.yaml│                   │                            │
│  └─────┬──────┘                   │                            │
│        │                           │                            │
│        ▼                           ▼                            │
│  silver/engine/                   silver/modules/               │
│  ┌──────────────┐               ┌────────────────┐             │
│  │ orchestrator │──────────────→│ base.py (ABC)  │             │
│  │ pipeline.py  │  orchestrates │ profiling.py    │             │
│  │ module_loader│               │ datatype.py     │             │
│  └──────────────┘               │ timestamp.py    │             │
│        │                        │ duplicate.py    │             │
│        │  uses                  │ missing.py      │             │
│        ▼                        │ outlier.py      │             │
│  silver/models/types.py         │ validation.py   │             │
│  ┌────────────┐                 │ enrichment.py   │             │
│  │DataProfile │                 │ scoring.py      │             │
│  │AuditEntry  │                 │ logging.py      │             │
│  │SilverCtx   │                 └────────────────┘             │
│  │QualityScore│                                                 │
│  └────────────┘                silver/utils/helpers.py          │
│                                                                 │
│                    ┌──────────────┐                             │
│                    │ etl_runner.py│ ← thin wrapper              │
│                    │ (refactored) │   (backward compat)         │
│                    └──────────────┘                             │
│                                                                 │
│  Prisma (new models)                                            │
│  ┌──────────────────────────────────────────┐                  │
│  │ SilverRun                                 │                  │
│  │  runId, qualityScore, profileJson         │                  │
│  │  auditLogJson, recommendationsJson        │                  │
│  │                                           │                  │
│  │ AuditLog (optional — if DB-backed)        │                  │
│  │  runId, moduleName, executionMs           │                  │
│  │  rowsBefore, rowsAfter, warnings          │                  │
│  └──────────────────────────────────────────┘                  │
└────────────────────────────────────────────────────────────────┘
```

## 5. Implementation Roadmap

### Phase 0: Foundation (Setup)
**Goal:** Create the silver/ package structure with zero impact on existing flows.

| # | Task | Files | Est. |
|---|---|---|---|
| 0.1 | Create `worker/silver/` folder structure | All `__init__.py` files | 5 min |
| 0.2 | Create `silver/models/types.py` — DataProfile, SilverContext, AuditEntry dataclasses | `models/types.py` | 10 min |
| 0.3 | Create `silver/modules/base.py` — BaseModule ABC with `run(df, ctx) → (df, ctx)` | `modules/base.py` | 10 min |
| 0.4 | Create `silver/engine/module_loader.py` — dynamic YAML rule loading + module discovery | `engine/module_loader.py` | 15 min |
| 0.5 | Write unit tests for types + module loader | `tests/silver/test_types.py`, `tests/silver/test_module_loader.py` | 15 min |
| 0.6 | Install dependencies: `pyyaml`, `scipy` (for outlier) | `requirements.txt` | 5 min |

### Phase 1: Core Modules
**Goal:** Implement individual cleaning/validation modules following the plugin interface.

| # | Task | Files | Est. |
|---|---|---|---|
| 1.1 | `profiling.py` — compute DataProfile (rows, schema, missing%, duplicate%, outlier%, column stats) | `modules/profiling.py` | 20 min |
| 1.2 | `datatype.py` — detect & cast column types (int→float→string→datetime→bool) | `modules/datatype.py` | 15 min |
| 1.3 | `timestamp.py` — detect timestamp columns, normalize timezone, format unification | `modules/timestamp.py` | 15 min |
| 1.4 | `duplicate.py` — exact + fuzzy duplicate detection (configurable threshold) | `modules/duplicate.py` | 15 min |
| 1.5 | `missing.py` — detect missing patterns, smart fill (mean/median/mode/forward-fill/interpolate) | `modules/missing.py` | 20 min |
| 1.6 | `outlier.py` — IQR + Z-score outlier detection with configurable thresholds | `modules/outlier.py` | 15 min |
| 1.7 | `validation.py` — YAML-driven rule engine (min, max, regex, enum, cross-column) | `modules/validation.py` | 25 min |
| 1.8 | Write tests for each module (TDD: test first, then implement) | `tests/silver/test_*.py` | 60 min |

### Phase 2: Rule Engine + YAML Rules
**Goal:** Externalize all validation rules into YAML files.

| # | Task | Files | Est. |
|---|---|---|---|
| 2.1 | Create `rules/generic.yaml` — default rules (common column names, date formats) | `rules/generic.yaml` | 10 min |
| 2.2 | Create `rules/iot.yaml` — temperature, humidity, battery, pressure ranges | `rules/iot.yaml` | 10 min |
| 2.3 | Create `rules/finance.yaml` — amount, currency, transaction type, account | `rules/finance.yaml` | 10 min |
| 2.4 | Create `rules/sales.yaml` — product, price, quantity, customer | `rules/sales.yaml` | 10 min |
| 2.5 | Create `rules/erp.yaml` — inventory, warehouse, supplier | `rules/erp.yaml` | 10 min |
| 2.6 | Create `rules/hr.yaml` — employee, salary, department, date | `rules/hr.yaml` | 10 min |
| 2.7 | Update `module_loader.py` to load rules from dataset classification result | `engine/module_loader.py` | 15 min |
| 2.8 | Write tests for rule loading + validation against sample datasets | `tests/silver/test_rules.py` | 20 min |

### Phase 3: Quality Scoring + Audit
**Goal:** Compute quality scores and structured audit trail.

| # | Task | Files | Est. |
|---|---|---|---|
| 3.1 | `scoring.py` — completeness (%), validity (%), consistency, uniqueness, overall score (0-100) | `modules/scoring.py` | 20 min |
| 3.2 | `logging.py` — structured AuditEntry logger with module_name, timing, counts, warnings | `modules/logging.py` | 15 min |
| 3.3 | Integrate scoring + logging into existing modules (update each BaseModule) | All modules | 15 min |
| 3.4 | Write tests for quality scoring | `tests/silver/test_scoring.py` | 15 min |

### Phase 4: AI Components
**Goal:** Dataset classification, recommendations, explainability.

| # | Task | Files | Est. |
|---|---|---|---|
| 4.1 | `ai/classifier.py` — heuristic classifier (column names → domain detection: IoT/Finance/Sales/ERP/HR/General) | `ai/classifier.py` | 20 min |
| 4.2 | `ai/recommender.py` — based on profile + classification, recommend modules to run | `ai/recommender.py` | 15 min |
| 4.3 | `ai/explainability.py` — for each flagged row, explain which rule was violated, expected vs actual | `ai/explainability.py` | 20 min |
| 4.4 | `ai/anomaly.py` — optional: ML-based anomaly detection (IsolationForest fallback) | `ai/anomaly.py` | 15 min |
| 4.5 | Write tests for classifier + recommender | `tests/silver/test_ai.py` | 15 min |

### Phase 5: Orchestrator + Pipeline Integration
**Goal:** Wire everything together and connect to existing ETL flow.

| # | Task | Files | Est. |
|---|---|---|---|
| 5.1 | `engine/pipeline.py` — SilverPipeline FLUENT API: `.profile() → .classify() → .load_modules() → .clean() → .validate() → .score() → .audit()` | `engine/pipeline.py` | 20 min |
| 5.2 | `engine/orchestrator.py` — SilverOrchestrator: accepts df + config, runs full pipeline, returns (df, ctx) | `engine/orchestrator.py` | 20 min |
| 5.3 | Refactor `worker/etl_runner.py` — add `step_silver(df, config)` that delegates to SilverOrchestrator | `worker/etl_runner.py` | 15 min |
| 5.4 | Add Prisma model `SilverRun` (optional: DB-backed quality metrics storage) | `prisma/schema.prisma` | 10 min |
| 5.5 | Update `app/api/pipelines/[id]/run/route.ts` — store SilverRun after pipeline completion | API route | 10 min |
| 5.6 | Update `app/api/lakehouse/[layer]/route.ts` — return quality scores for SILVER tables | API route | 10 min |
| 5.7 | Integration test: Bronze → Silver pipeline end-to-end with quality scoring | `tests/integration/test_silver_pipeline.py` | 20 min |

### Phase 6: Frontend + Hardening
**Goal:** Expose Silver quality data in the UI.

| # | Task | Files | Est. |
|---|---|---|---|
| 6.1 | Add "Silver Quality" badge/indicator on lakehouse table cards | `lakehouse/page.tsx` | 15 min |
| 6.2 | Add quality score detail panel (completeness, validity, uniqueness %) | `lakehouse/[layer]/[table]/page.tsx` | 20 min |
| 6.3 | Add `SILVER_QUALITY` step type to pipeline builder (optional: user can insert quality step) | `pipelines/new/page.tsx` | 15 min |
| 6.4 | Final integration test + verify backward compat with existing pipelines | Manual test | 15 min |

## 6. Design Decisions & Tradeoffs

### 6.1 Why Plugin Architecture (not monolithic)
| Pro | Con |
|---|---|
| Swap individual modules without touching others | More files, more imports |
| Test each module in isolation | Initial setup overhead |
| Add new module types without modifying core | Plugin discovery has slight perf cost |
| Future: user-contributed plugins | |

**Decision:** Plugin architecture. The overhead is justified by maintainability.

### 6.2 Why YAML Rules (not DB-only)
| Pro | Con |
|---|---|
| Version-controllable (Git) | Not dynamic without reload |
| Human-readable | Need file system access |
| Can be bundled with app | |

**Decision:** YAML rules + optional DB override. YAML is source of truth, DB can override per-tenant.

### 6.3 Why Context Object (not global state)
| Pro | Con |
|---|---|
| Thread-safe | Passing ctx everywhere is verbose |
| Testable (no global side effects) | |
| Clear data flow | |

**Decision:** Context object. Thread safety is critical for concurrent pipeline runs.

### 6.4 Heuristic vs ML Classifier
| Approach | Pro | Con |
|---|---|---|
| Heuristic | Fast, no deps, deterministic | Less accurate for edge cases |
| ML model | More accurate | Requires training data, slower |

**Decision:** Start with heuristic, make interface swappable. AI classifier can be added later without refactoring.

### 6.5 Backward Compatibility Strategy
- Keep `etl_runner.py` as-is for 14 days as fallback
- New `step_silver()` in `etl_runner.py` delegates to `SilverOrchestrator`
- Existing pipelines with only CLEAN/VALIDATE steps continue working (they don't call Silver engine)
- NEW pipeline step type `SILVER_QUALITY` triggers the full Silver engine
- After 14 days + verification, deprecate old step types

## 7. Testing Strategy

### Unit Tests (per module)
```
tests/silver/
├── __init__.py
├── test_types.py          — DataProfile, SilverContext, AuditEntry
├── test_module_loader.py  — YAML loading, module discovery
├── test_profiling.py      — Profile computation accuracy
├── test_datatype.py       — Type detection correctness
├── test_timestamp.py      — Timezone normalization
├── test_duplicate.py      — Exact + fuzzy dedup
├── test_missing.py        — Fill strategies
├── test_outlier.py        — IQR + Z-score
├── test_validation.py     — Rule parsing + application
├── test_scoring.py        — Quality score calculation
├── test_logging.py        — Audit trail structure
├── test_classifier.py     — Dataset classification
├── test_recommender.py    — Recommendation logic
├── test_explainability.py — Explanation generation
└── test_orchestrator.py   — Full pipeline integration
```

### Test Data
- `tests/fixtures/sample_iot.csv` — 100 rows of sensor data
- `tests/fixtures/sample_sales.csv` — 50 rows of sales data
- `tests/fixtures/sample_finance.csv` — 30 rows of financial data

## 8. Risk Assessment

| Risk | Impact | Mitigation |
|---|---|---|
| Breaking existing pipelines | HIGH | Backward compat wrapper, 14-day deprecation window |
| Performance overhead | MEDIUM | Profile once, cache results. Modules process columns not rows. |
| Rule file corruption | LOW | Validate YAML on load, fallback to generic rules |
| AI classifier wrong | LOW | Heuristic is deterministic. ML model optional later. |
| Memory usage for large datasets | MEDIUM | Profile uses sampling. Stream processing for big data. |

## 9. Total Estimates

| Phase | Tasks | Est. Time |
|---|---|---|
| Phase 0: Foundation | 6 | ~60 min |
| Phase 1: Core Modules | 8 | ~185 min |
| Phase 2: Rules + YAML | 8 | ~95 min |
| Phase 3: Scoring + Audit | 4 | ~65 min |
| Phase 4: AI | 5 | ~85 min |
| Phase 5: Integration | 7 | ~105 min |
| Phase 6: Frontend | 4 | ~65 min |
| **TOTAL** | **42 tasks** | **~11 hours** |

---

## 10. Approval Checkpoint

> **Status:** ⏸️ MENUNGGU APPROVAL

Bro, ini analisis lengkap + roadmap. Sebelum gue mulai coding:

1. ✅ Arsitektur target: Clean Architecture + Plugin system
2. ✅ Semua module punya interface identik (`BaseModule`)
3. ✅ Rule dari YAML (bukan hardcode)
4. ✅ Backward compatible (existing pipeline tetap jalan)
5. ✅ Ada profiling, classification, scoring, audit trail, explainability, recommendation

**Yang perlu elu konfirmasi:**
- Setuju dengan folder structure? (`worker/silver/`)
- Setuju dengan phased approach? (0→1→2→3→4→5→6)
- Ada yang mau ditambahin/diubah dari requirement awal?

Kalau approved, gue langsung gas Phase 0! 🚀
