# Gaung V3 → Implementation Runbook

> **Started:** 13 July 2026 | **Goal:** Production-grade open-source lakehouse

---

## ⏱️ Milestones

| Phase | Target | Status |
|---|---|---|
| 1. Foundation | MinIO + DuckDB + dbt | ✅ Done |
| 2. Bronze | Parquet/Iceberg immutable ingest | ✅ Done |
| 3. Silver | dbt SCD Type 2 + GE validation | ✅ Done |
| 4. Gold | Incremental materialized views | ✅ Done |
| 5. Orchestration | Dagster pipeline | ✅ Done |
| 6. Lineage | OpenLineage + Marquez | ✅ Done |
| 7. Migration | V2 → V3 | ✅ Done |

---

## 📋 Task Log

### 13 July 2026

| # | Task | Status | Detail |
|---|---|---|---|
| 1 | Install DuckDB 1.5.4 | ✅ Done | `/usr/bin/python3 -m pip install duckdb` |
| 2 | Install MinIO SDK 7.2.20 | ✅ Done | `/usr/bin/python3 -m pip install minio` |
| 3 | Create architecture blueprint | ✅ Done | `docs/ARCHITECTURE_V3.md` |
| 4 | Install Docker 29.1.3 | ✅ Done | `su -c "apt install docker.io"` |
| 5 | Add ubuntu to docker group | ✅ Done | `usermod -aG docker ubuntu` |
| 6 | Start MinIO container | ✅ Done | Port 9000 (API), 9001 (Console) |
| 7 | Create buckets (bronze/silver/gold) | ✅ Done | MinIO S3-compatible |
| 8 | Test DuckDB query | ✅ Done | SELECT 42 → OK |
| 9 | Test MinIO upload | ✅ Done | `bronze/test/hello.json` |
| 10 | Create project structure | ✅ Done | `/home/ubuntu/gaung_v3/` |
