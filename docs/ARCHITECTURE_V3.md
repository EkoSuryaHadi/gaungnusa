# Gaung V3 — Lakehouse Architecture (Open Source)

> **Status:** Blueprint | **Target:** Production-grade data lakehouse

---

## Stack (100% Open Source)

| Layer | Tool | License | Peran |
|---|---|---|---|
| Storage | **MinIO** | AGPL v3 | S3-compatible object storage |
| Table Format | **Apache Iceberg** | Apache 2.0 | ACID transactions, time travel, schema evolution |
| Bronze DB | **DuckDB** | MIT | Read Parquet/Iceberg langsung, lightweight OLAP |
| Transform | **dbt-core** | Apache 2.0 | SQL-based transformations, SCD Type 2, testing |
| Silver DB | **DuckDB** | MIT | Columnar store, incremental materializations |
| Gold DB | **DuckDB** | MIT | Materialized views, dashboard queries |
| Orchestration | **Dagster** | Apache 2.0 | Pipeline scheduling, retry, backfill, monitoring |
| Quality | **Great Expectations** | Apache 2.0 | Automated data validation, anomaly detection |
| Lineage | **OpenLineage + Marquez** | Apache 2.0 | End-to-end data lineage, schema tracking |
| Catalog | **Amundsen** | Apache 2.0 | Data discovery, metadata search |
| API Layer | **Gaung (Next.js)** | Existing | UI, pipeline builder, dashboard |

---

## Architecture

```
                    ┌──────────────────────────────────────┐
                    │            DAGSTER                    │
                    │  (Orchestration, Retry, Monitoring)   │
                    └──────────────────────────────────────┘
                                       │
    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │  SOURCE  │ →  │  BRONZE  │ →  │  SILVER  │ →  │   GOLD   │
    │  Upload  │    │ MinIO    │    │ DuckDB   │    │ DuckDB   │
    │  API     │    │ Iceberg  │    │ dbt      │    │ Views    │
    └──────────┘    └──────────┘    └──────────┘    └──────────┘
                         │               │               │
                    ┌──────────────────────────────────────┐
                    │       OPENLINEAGE + MARQUEZ          │
                    │     (Lineage, Schema, Metadata)      │
                    └──────────────────────────────────────┘
                                       │
                    ┌──────────────────────────────────────┐
                    │       GREAT EXPECTATIONS             │
                    │  (Validation, Profiling, Anomalies)  │
                    └──────────────────────────────────────┘
                                       │
                    ┌──────────────────────────────────────┐
                    │          GAUNG UI (Next.js)          │
                    │   Pipeline Builder + Dashboard       │
                    └──────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Foundation (Week 1-2)

```bash
# 1. Install MinIO (S3-compatible object storage)
docker run -d --name minio \
  -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=gaung \
  -e MINIO_ROOT_PASSWORD=gaung-minio-2026 \
  quay.io/minio/minio server /data --console-address :9001

# 2. Install DuckDB
pip install duckdb

# 3. Install dbt + dbt-duckdb
pip install dbt-duckdb

# 4. Install Great Expectations
pip install great_expectations

# 5. Install Dagster
pip install dagster dagster-webserver
```

### Phase 2: Bronze Layer (Week 2-3)

**Upload → MinIO (Parquet) → Iceberg table**

```python
# worker/bronze/ingest.py
import boto3
import duckdb
from pyiceberg.catalog import load_catalog

def bronze_ingest(csv_path: str, source_name: str):
    # 1. Read CSV as Pandas
    df = pd.read_csv(csv_path)

    # 2. Write to MinIO as Parquet (immutable)
    parquet_path = f"s3://bronze/{source_name}/{timestamp}.parquet"
    df.to_parquet(parquet_path)

    # 3. Create/Append Iceberg table via DuckDB
    con = duckdb.connect()
    con.execute(f"""
        CREATE TABLE IF NOT EXISTS iceberg.bronze.{source_name}
        AS SELECT * FROM read_parquet('{parquet_path}')
    """)

    # 4. Emit OpenLineage event
    emit_lineage_event("BRONZE_INGEST", source_name, parquet_path)
```

### Phase 3: Silver Layer — SCD Type 2 (Week 3-4)

**dbt model with Slowly Changing Dimension**

```sql
-- dbt/models/silver/data_iot_silver.sql
{{
  config(
    materialized='scd2',
    unique_key='device_id || timestamp',
    strategy='timestamp',
    updated_at='_dbt_updated_at'
  )
}}

WITH validated AS (
  SELECT
    device_id,
    timestamp,
    temperature_c,
    humidity_pct,
    vibration_g,
    battery_v,
    -- Great Expectations validation passed rows only
    _ge_validity_flag,
    _ge_anomaly_score
  FROM {{ ref('bronze_data_iot') }}
  WHERE _ge_validity_flag = TRUE
),

interpolated AS (
  SELECT
    device_id,
    timestamp,
    COALESCE(
      temperature_c,
      AVG(temperature_c) OVER (
        PARTITION BY device_id
        ORDER BY timestamp
        ROWS BETWEEN 5 PRECEDING AND 5 FOLLOWING
      )
    ) AS temperature_c,
    ... -- other columns
  FROM validated
)

SELECT * FROM interpolated
```

### Phase 4: Gold Layer — Materialized Views (Week 4-5)

```sql
-- dbt/models/gold/iot_device_summary.sql
{{
  config(
    materialized='incremental',
    unique_key='device_id',
    on_schema_change='append_new_columns'
  )
}}

SELECT
  device_id,
  COUNT(*) AS total_readings,
  AVG(temperature_c) AS avg_temperature,
  AVG(humidity_pct) AS avg_humidity,
  AVG(vibration_g) AS avg_vibration,
  MIN(battery_v) AS min_battery,
  MAX(battery_v) AS max_battery,
  SUM(CASE WHEN temperature_c IS NULL THEN 1 ELSE 0 END) AS total_missing,
  _dbt_updated_at
FROM {{ ref('silver_data_iot') }}
{% if is_incremental() %}
  WHERE _dbt_updated_at > (SELECT MAX(_dbt_updated_at) FROM {{ this }})
{% endif %}
GROUP BY device_id
```

### Phase 5: Orchestration (Week 5-6)

```python
# dagster/pipeline.py
from dagster import job, op, asset, AssetIn
import great_expectations as ge

@asset(group_name="bronze")
def bronze_iot_data(context):
    """Ingest new IoT data to MinIO"""
    context.log.info("Ingesting IoT data...")
    # ... ingest logic
    yield Output(df, metadata={"rows": len(df)})

@asset(group_name="silver", ins={"upstream": AssetIn("bronze_iot_data")})
def silver_iot_data(context, upstream):
    """Validate & transform via Great Expectations"""
    # Run GE validation
    validator = ge.from_pandas(upstream)
    results = validator.expect_table_row_count_to_be_between(1, 1000000)
    context.log.info(f"Validation: {results.success}")
    # Transform
    yield Output(cleaned_df)

@asset(group_name="gold", ins={"upstream": AssetIn("silver_iot_data")})
def gold_iot_summary(context, upstream):
    """Aggregate to Gold"""
    summary = upstream.groupby("device_id").agg({...})
    yield Output(summary)

@job
def iot_pipeline():
    gold_iot_summary(silver_iot_data(bronze_iot_data()))
```

### Phase 6: Lineage & Quality (Week 6-7)

```bash
# Start Marquez (lineage visualization)
docker run -d --name marquez \
  -p 5000:5000 -p 5001:5001 \
  marquezproject/marquez:latest

# Start OpenLineage integration
export OPENLINEAGE_URL=http://localhost:5000

# Run Great Expectations checkpoint
great_expectations checkpoint run iot_validation
```

---

## Migration dari V2 (Existing)

| V2 | V3 | Migration |
|---|---|---|
| PostgreSQL raw | MinIO + Iceberg | Export PG → Parquet → MinIO |
| Synchronous ETL | Dagster async | Wrap existing Python scripts |
| Static YAML rules | Great Expectations | Convert YAML → GE Expectations |
| No lineage | Marquez | Instrument existing pipeline |
| Row-based PG | DuckDB columnar | Export → DuckDB database |

**Estimasi effort:** 8-10 minggu (2.5 bulan)

---

## Quick Start (MVP dalam 1 minggu)

```bash
# 1 repo install semua
cd /home/ubuntu/gaung

# MinIO
docker compose up minio -d

# DuckDB + dbt
pip install dbt-duckdb duckdb great_expectations dagster

# Init dbt project
dbt init gaung_warehouse

# Init Great Expectations
great_expectations init
```
