#!/usr/bin/env python3
"""
Gaung ETL Worker — processes pipeline steps sequentially.

Usage: python3 etl_runner.py /tmp/gaung_pipeline_<runId>.json

Pipeline config format:
{
  "pipelineId": 1,
  "runId": 1,
  "source": { "filePath": "sales.csv", "fileSize": 1234 },
  "steps": [
    { "type": "SOURCE",  "config": {}, "order": 0 },
    { "type": "CLEAN",   "config": { "stripWhitespace": true, "deduplicate": true }, "order": 1 },
    { "type": "OUTPUT",  "config": {}, "order": 2, "outputLayer": "SILVER", "outputTable": "sales_clean" }
  ]
}
"""

import json
import sys
import os
from pathlib import Path

import pandas as pd
from sqlalchemy import create_engine, text

# ============================================================
# Helpers
# ============================================================

def get_engine():
    """Create SQLAlchemy engine from DATABASE_URL env var."""
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        raise RuntimeError("DATABASE_URL not set")
    return create_engine(db_url)


def load_source(source: dict) -> pd.DataFrame:
    """Load CSV file from uploads directory."""
    if not source.get("filePath"):
        raise ValueError("No filePath in source config")

    file_path = Path(os.getcwd()) / "uploads" / source["filePath"]
    if not file_path.exists():
        raise FileNotFoundError(f"Source file not found: {file_path}")

    print(f"[SOURCE] Loading {file_path.name} ({source.get('fileSize', '?')} bytes)")
    df = pd.read_csv(file_path)
    print(f"[SOURCE] Loaded {len(df)} rows, {len(df.columns)} columns")
    return df


def load_lakehouse_source(source: dict) -> pd.DataFrame:
    """Load data from an existing lakehouse table (bronze/silver/gold)."""
    table_name = source.get("sourceTable", "")
    source_layer = source.get("sourceLayer", "BRONZE").lower()

    if not table_name:
        raise ValueError("No sourceTable in lakehouse source config")

    engine = get_engine()
    full_table = f'{source_layer}."{table_name}"'

    print(f"[SOURCE] Loading lakehouse table: {full_table}")
    with engine.connect() as conn:
        result = conn.execute(text(f"SELECT * FROM {full_table}"))
        rows = result.fetchall()
        columns = list(result.keys())
        df = pd.DataFrame(rows, columns=columns)
    print(f"[SOURCE] Loaded {len(df)} rows, {len(df.columns)} columns from {source_layer}")
    return df


def step_clean(df: pd.DataFrame, config: dict) -> pd.DataFrame:
    """Clean data: strip whitespace, deduplicate, fill nulls."""
    result = df.copy()
    rows_before = len(result)

    if config.get("stripWhitespace"):
        for col in result.select_dtypes(include=["object"]).columns:
            result[col] = result[col].str.strip()
        print("[CLEAN] Stripped whitespace")

    if config.get("deduplicate"):
        result = result.drop_duplicates()
        removed = rows_before - len(result)
        if removed > 0:
            print(f"[CLEAN] Removed {removed} duplicate rows")

    if config.get("fillNulls"):
        fill_map = config["fillNulls"]
        for col, val in fill_map.items():
            if col in result.columns:
                result[col] = result[col].fillna(val)
                print(f"[CLEAN] Filled nulls in '{col}' with '{val}'")

    return result


def step_validate(df: pd.DataFrame, config: dict) -> pd.DataFrame:
    """Validate data types and constraints. Returns rows that pass."""
    result = df.copy()
    rules = config.get("rules", [])

    for rule in rules:
        col = rule.get("column", "")
        dtype = rule.get("type", "")
        if col not in result.columns:
            print(f"[VALIDATE] Column '{col}' not found, skipping")
            continue

        if dtype == "number":
            result[col] = pd.to_numeric(result[col], errors="coerce")
            if rule.get("min") is not None:
                mask = result[col] >= rule["min"]
                removed = (~mask).sum()
                result = result[mask]
                if removed:
                    print(f"[VALIDATE] Removed {removed} rows where {col} < {rule['min']}")

        elif dtype == "date":
            result[col] = pd.to_datetime(result[col], errors="coerce")

    return result


def step_transform(df: pd.DataFrame, config: dict) -> pd.DataFrame:
    """Transform: calculated columns, rename, type cast."""
    result = df.copy()

    if config.get("calculatedColumns"):
        for col_name, expr in config["calculatedColumns"].items():
            try:
                result[col_name] = result.eval(expr)
                print(f"[TRANSFORM] Created calculated column '{col_name}' = {expr}")
            except Exception as e:
                print(f"[TRANSFORM] Failed to calculate '{col_name}': {e}")

    if config.get("rename"):
        result = result.rename(columns=config["rename"])
        print(f"[TRANSFORM] Renamed columns: {config['rename']}")

    if config.get("drop"):
        result = result.drop(columns=config["drop"], errors="ignore")
        print(f"[TRANSFORM] Dropped columns: {config['drop']}")

    return result


def step_filter(df: pd.DataFrame, config: dict) -> pd.DataFrame:
    """Filter rows using pandas query expression."""
    condition = config.get("condition", "")
    if not condition:
        return df

    rows_before = len(df)
    try:
        result = df.query(condition)
        removed = rows_before - len(result)
        if removed:
            print(f"[FILTER] Filtered out {removed} rows with condition: {condition}")
        return result
    except Exception as e:
        print(f"[FILTER] Query failed: {e}, returning original")
        return df


def step_categorize(df: pd.DataFrame, config: dict) -> pd.DataFrame:
    """Bucket numeric field into categories."""
    result = df.copy()
    field = config.get("field", "")
    new_col = config.get("newColumn", f"{field}_tier")
    categories = config.get("categories", [])

    if field not in result.columns:
        print(f"[CATEGORIZE] Field '{field}' not found")
        return result

    result[new_col] = "Unknown"
    for cat in categories:
        lo = cat.get("min", float("-inf"))
        hi = cat.get("max", float("inf"))
        label = cat.get("label", f"{lo}-{hi}")
        result.loc[(result[field] >= lo) & (result[field] < hi), new_col] = label

    print(f"[CATEGORIZE] Created '{new_col}' with {len(categories)} categories")
    return result


def step_aggregate(df: pd.DataFrame, config: dict) -> pd.DataFrame:
    """Aggregate: GROUP BY with aggregations."""
    group_by = config.get("groupBy", [])
    aggs = config.get("aggregations", {})

    if not aggs:
        return df

    pandas_agg = {}
    for out_col, expr in aggs.items():
        parts = expr.split()
        if len(parts) >= 2:
            inp_col = parts[0]
            func = parts[1] if parts[1] != "mean" else "mean"
            if inp_col in df.columns:
                pandas_agg[out_col] = pd.NamedAgg(column=inp_col, aggfunc=func)

    if group_by:
        result = df.groupby(group_by, as_index=False).agg(**pandas_agg)
    else:
        result = df.agg(**pandas_agg)
        result = pd.DataFrame([result])

    print(f"[AGGREGATE] Grouped by {group_by}, result: {len(result)} rows")
    return result


def step_sort(df: pd.DataFrame, config: dict) -> pd.DataFrame:
    """Sort by columns."""
    by = config.get("by", [])
    ascending = config.get("ascending", True)
    if by:
        result = df.sort_values(by=by, ascending=ascending)
        print(f"[SORT] Sorted by {by} {'ASC' if ascending else 'DESC'}")
        return result
    return df


def step_join(df: pd.DataFrame, config: dict) -> pd.DataFrame:
    """Join with another table (from DB)."""
    join_type = config.get("type", "left")
    join_key = config.get("on", df.columns[0])
    join_source = config.get("source", "")

    if not join_source:
        return df

    engine = get_engine()
    table_name = join_source.replace("silver.", "").replace("bronze.", "").replace("gold.", "")
    other = pd.read_sql_table(table_name, engine)

    result = df.merge(other, on=join_key, how=join_type)
    print(f"[JOIN] {join_type} join with {join_source} on '{join_key}': {len(result)} rows")
    return result


# ============================================================
# Database helpers
# ============================================================

def ensure_layer_schema(engine, layer: str):
    """Create schema if not exists."""
    schema = layer.lower()
    with engine.connect() as conn:
        conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {schema}"))
        conn.commit()
    print(f"[DB] Ensured schema '{schema}' exists")


def write_output(df: pd.DataFrame, config: dict):
    """Write DataFrame to PostgreSQL lakehouse layer using psycopg2 directly."""
    import psycopg2
    import psycopg2.extras as extras

    layer = config.get("outputLayer", "SILVER").lower()
    table = (config.get("outputTable") or "output").lower()
    db_url = os.environ.get("DATABASE_URL", "")

    if not db_url:
        raise RuntimeError("DATABASE_URL not set")

    conn = psycopg2.connect(db_url)
    conn.autocommit = True
    cur = conn.cursor()

    # Create schema
    cur.execute(f"CREATE SCHEMA IF NOT EXISTS {layer}")
    full_table = f'{layer}."{table}"'

    # Determine column types from pandas dtypes
    col_defs = []
    for col in df.columns:
        dtype = str(df[col].dtype)
        if "int" in dtype:
            pg_type = "BIGINT"
        elif "float" in dtype:
            pg_type = "DOUBLE PRECISION"
        elif "datetime" in dtype:
            pg_type = "TIMESTAMP"
        else:
            pg_type = "TEXT"
        col_defs.append(f'"{col}" {pg_type}')

    # Drop & create table
    cur.execute(f"DROP TABLE IF EXISTS {full_table}")
    create_sql = f"CREATE TABLE {full_table} ({', '.join(col_defs)})"
    cur.execute(create_sql)

    # Insert data in batches
    columns = [f'"{c}"' for c in df.columns]
    placeholders = ",".join(["%s"] * len(columns))
    insert_sql = f"INSERT INTO {full_table} ({', '.join(columns)}) VALUES ({placeholders})"

    rows = [tuple(row) for row in df.itertuples(index=False, name=None)]
    extras.execute_batch(cur, insert_sql, rows, page_size=1000)

    cur.close()
    conn.close()

    print(f"[OUTPUT] Wrote {len(df)} rows to {full_table}")
    return len(df)


# ============================================================
# Pipeline runner
# ============================================================

def step_source(_df: None, config: dict, source_data: dict) -> pd.DataFrame:
    """Load source data — from lakehouse table or CSV file."""
    # Lakehouse source (from existing bronze/silver/gold table)
    if source_data.get("fromLakehouse") or source_data.get("sourceTable"):
        source_config = {
            "sourceTable": source_data.get("sourceTable") or config.get("sourceTable", ""),
            "sourceLayer": source_data.get("sourceLayer") or config.get("sourceLayer", "BRONZE"),
        }
        return load_lakehouse_source(source_config)

    # CSV file source
    file_path = config.get("filePath") or source_data.get("filePath")
    if not file_path:
        raise ValueError("No filePath in source config and no lakehouse sourceTable")

    return load_source({"filePath": file_path, "fileSize": config.get("fileSize")})


STEP_HANDLERS = {
    "CLEAN":       step_clean,
    "VALIDATE":    step_validate,
    "TRANSFORM":   step_transform,
    "FILTER":      step_filter,
    "CATEGORIZE":  step_categorize,
    "AGGREGATE":   step_aggregate,
    "SORT":        step_sort,
    "JOIN":        step_join,
    "OUTPUT":      lambda df, cfg, _src: write_output(df, cfg),
}



def dtype_to_sql(dtype) -> str:
    """Convert pandas dtype to SQL type name."""
    d = str(dtype)
    if "int" in d:
        return "INTEGER"
    elif "float" in d:
        return "DECIMAL"
    elif "datetime" in d:
        return "TIMESTAMP"
    elif "bool" in d:
        return "BOOLEAN"
    else:
        return "VARCHAR"


def run_pipeline(config_path: str) -> dict:
    """Execute pipeline steps sequentially."""
    with open(config_path) as f:
        pipeline = json.load(f)

    print(f"=== Gaung ETL Worker ===")
    print(f"Pipeline: {pipeline.get('pipelineId')}, Run: {pipeline.get('runId')}")

    source_data = pipeline.get("source", {})
    steps = sorted(pipeline.get("steps", []), key=lambda s: s["order"])

    df: pd.DataFrame | None = None
    rows_output = 0
    column_metadata: list[dict] = []

    for i, step in enumerate(steps):
        step_type = step.get("type", "UNKNOWN")
        config = step.get("config", {})

        print(f"\n--- Step {i+1}/{len(steps)}: {step_type} ---")

        if step_type == "SOURCE":
            df = step_source(None, config, source_data)

        elif step_type == "OUTPUT":
            if df is None:
                print("[OUTPUT] No data to write, skipping")
                continue
            column_metadata = [{"name": str(col), "type": dtype_to_sql(df[col].dtype)} for col in df.columns]
            rows_output = write_output(df, step)
            df = None  # consumed

        else:
            if df is None:
                print(f"[{step_type}] No data in pipeline, skipping")
                continue
            handler = STEP_HANDLERS.get(step_type)
            if handler:
                df = handler(df, config)
            else:
                print(f"[{step_type}] Unknown step type, skipping")

    print(f"\n=== Pipeline Complete === rows={rows_output}")
    return {"rows": rows_output, "columns": column_metadata}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 etl_runner.py <config.json>")
        sys.exit(1)

    config_path = sys.argv[1]
    result = run_pipeline(config_path)
    print(json.dumps(result))
