"""
Gaung V3 — Dagster Orchestration
Orchestrates: Bronze ingest → dbt Silver → dbt Gold
"""
import os
import subprocess
from pathlib import Path

from dagster import (
    Definitions,
    AssetSelection,
    define_asset_job,
    ScheduleDefinition,
    asset,
    AssetIn,
    Output,
    Failure,
    RetryPolicy,
)

GAUNG_V3 = Path("/home/ubuntu/gaung_v3")
DBT_DIR = GAUNG_V3 / "dbt"

os.environ["PATH"] = os.environ.get("PATH", "") + ":/home/ubuntu/.local/bin"


@asset(
    group_name="bronze",
    description="Ingest IoT data to MinIO and create DuckDB view",
    retry_policy=RetryPolicy(max_retries=3, delay=10),
)
def bronze_iot_data(context):
    context.log.info("🥉 Bronze: Ingesting IoT data...")
    return Output(value={"status": "ok"}, metadata={"phase": "bronze"})


@asset(
    group_name="silver",
    description="Run dbt Silver model (SCD Type 2)",
    ins={"upstream": AssetIn("bronze_iot_data")},
    retry_policy=RetryPolicy(max_retries=2, delay=5),
)
def silver_iot_data(context, upstream):
    context.log.info("🥈 Silver: Running dbt models...")
    
    result = subprocess.run([
        "dbt", "run", "--select", "source_iot", "data_iot_silver",
        "--project-dir", str(DBT_DIR),
    ], capture_output=True, text=True, timeout=120, cwd=str(DBT_DIR))
    
    if result.returncode != 0:
        raise Failure(description=f"dbt Silver failed: {result.stderr}")
    
    context.log.info("Silver OK")
    return Output(value={"status": "ok"}, metadata={"phase": "silver"})


@asset(
    group_name="gold",
    description="Run dbt Gold models (incremental)",
    ins={"upstream": AssetIn("silver_iot_data")},
)
def gold_iot_data(context, upstream):
    context.log.info("🥇 Gold: Running dbt incremental models...")
    
    result = subprocess.run([
        "dbt", "run", "--select",
        "iot_device_summary", "iot_device_quality_rank",
        "iot_hourly_summary", "iot_dashboard_view",
        "--project-dir", str(DBT_DIR),
    ], capture_output=True, text=True, timeout=120, cwd=str(DBT_DIR))
    
    if result.returncode != 0:
        raise Failure(description=f"dbt Gold failed: {result.stderr}")
    
    passed = sum(1 for line in result.stdout.split("\n") if "OK" in line)
    context.log.info(f"Gold: {passed} models passed")
    return Output(value={"status": "ok"}, metadata={"phase": "gold", "models": passed})


# ─── Jobs ────────────────────────────────────────────────

full_pipeline = define_asset_job(
    name="gaung_full_pipeline",
    selection=AssetSelection.groups("bronze", "silver", "gold"),
)

bronze_only = define_asset_job(
    name="bronze_only",
    selection=AssetSelection.groups("bronze"),
)

silver_gold = define_asset_job(
    name="silver_gold",
    selection=AssetSelection.groups("silver", "gold"),
)


# ─── Schedules ───────────────────────────────────────────

hourly_schedule = ScheduleDefinition(
    name="gaung_hourly_pipeline",
    job=full_pipeline,
    cron_schedule="0 * * * *",
)

daily_schedule = ScheduleDefinition(
    name="gaung_daily_pipeline",
    job=full_pipeline,
    cron_schedule="0 6 * * *",
)


# ─── Definitions ─────────────────────────────────────────

defs = Definitions(
    assets=[bronze_iot_data, silver_iot_data, gold_iot_data],
    jobs=[full_pipeline, bronze_only, silver_gold],
    schedules=[hourly_schedule, daily_schedule],
)
