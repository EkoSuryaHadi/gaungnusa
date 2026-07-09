#!/usr/bin/env python3
"""
Gaung Database Fetcher — connect to external PostgreSQL/MySQL databases,
run a query (or discover tables), and store results in the Bronze layer.

Usage:
  python3 db_fetcher.py /path/to/db_source_config.json

Config format:
{
  "sourceId": 2,
  "config": {
    "dbType": "POSTGRESQL",          // POSTGRESQL | MYSQL
    "host": "192.168.1.100",
    "port": 5432,
    "database": "analytics",
    "username": "reader",
    "password": "<encrypted base64 Fernet token>",
    "sqlQuery": "SELECT * FROM sales WHERE date > '2025-01-01'",
    "schedule": "0 */6 * * *"        // optional cron, stored for future
  },
  "env": {
    "DATABASE_URL": "postgresql://..."  // Gaung's own DB for Bronze storage
  }
}

When sqlQuery is empty the script discovers tables (lists them and grabs
metadata) rather than fetching data.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

import pandas as pd
from sqlalchemy import create_engine, inspect, text

# Add the worker directory to sys.path so crypto_utils is importable
sys.path.insert(0, str(Path(__file__).resolve().parent))

from crypto_utils import decrypt


# ============================================================
# Helpers
# ============================================================


def build_connection_url(cfg: dict[str, Any]) -> str:
    """Build a SQLAlchemy connection URL from config."""
    db_type = cfg.get("dbType", "POSTGRESQL").upper()
    host = cfg.get("host", "localhost")
    port = cfg.get("port", 5432 if db_type == "POSTGRESQL" else 3306)
    database = cfg.get("database", "")
    username = cfg.get("username", "")
    password = cfg.get("password", "")

    # Decrypt password if it looks encrypted
    try:
        password = decrypt(password)
    except Exception:
        pass  # assume plaintext for backward compat

    if db_type == "POSTGRESQL":
        return f"postgresql://{username}:{password}@{host}:{port}/{database}"
    elif db_type == "MYSQL":
        return f"mysql+pymysql://{username}:{password}@{host}:{port}/{database}"
    else:
        raise ValueError(f"Unsupported database type: {db_type}")


def get_gaung_engine() -> Any:
    """Create SQLAlchemy engine for Gaung's own DB (Bronze layer)."""
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        raise RuntimeError("DATABASE_URL not set — cannot write to Bronze layer")
    return create_engine(db_url)


def discover_tables(engine: Any, schema: str | None = None) -> list[dict[str, Any]]:
    """Introspect the external database and return table metadata."""
    inspector = inspect(engine)
    tables = inspector.get_table_names(schema=schema)
    result: list[dict[str, Any]] = []
    for tname in tables:
        cols = inspector.get_columns(tname, schema=schema)
        result.append({
            "table_name": f"{schema}.{tname}" if schema else tname,
            "column_count": len(cols),
            "columns": [
                {"name": c["name"], "type": str(c["type"])} for c in cols
            ],
            "row_count_estimate": _estimate_row_count(engine, schema, tname),
        })
    return result


def _estimate_row_count(engine: Any, schema: str | None, table: str) -> int:
    """Return an approximate row count for a table."""
    try:
        full = f'"{schema}"."{table}"' if schema else f'"{table}"'
        with engine.connect() as conn:
            result = conn.execute(text(f"SELECT COUNT(*) FROM {full}"))
            return int(result.scalar())
    except Exception:
        return -1  # unknown


# ============================================================
# Main
# ============================================================


def ensure_layer_schema(engine: Any, layer: str) -> None:
    """Create schema if not exists."""
    schema = layer.lower()
    with engine.connect() as conn:
        conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {schema}"))
        conn.commit()
    print(f"[DB] Ensured schema '{schema}' exists")


def write_to_bronze(df: pd.DataFrame, table_name: str) -> int:
    """Write DataFrame to Bronze layer and return row count."""
    import psycopg2
    import psycopg2.extras as extras

    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        raise RuntimeError("DATABASE_URL not set")

    conn = psycopg2.connect(db_url)
    try:
        cur = conn.cursor()
        cur.execute("CREATE SCHEMA IF NOT EXISTS bronze")
        # Create table
        cols = []
        for col_name in df.columns:
            safe = col_name.replace('"', '""')
            cols.append(f'"{safe}" TEXT')
        col_defs = ",\n  ".join(cols)
        ddl = f'CREATE TABLE IF NOT EXISTS bronze."{table_name}" (\n  {col_defs}\n)'
        cur.execute(ddl)

        # Truncate first for idempotent runs
        cur.execute(f'TRUNCATE TABLE bronze."{table_name}"')

        # Insert rows
        if len(df) > 0:
            columns = [c for c in df.columns]
            tuples = [tuple(x) for x in df.to_numpy()]
            placeholders = ",".join(["%s"] * len(columns))
            col_names = ",".join(f'"{c}"' for c in columns)
            sql = f'INSERT INTO bronze."{table_name}" ({col_names}) VALUES ({placeholders})'
            extras.execute_batch(cur, sql, tuples, page_size=1000)
        conn.commit()
        return len(df)
    finally:
        conn.close()


def run(config_path: str) -> dict[str, Any]:
    """Execute the DB fetch workflow and return a status dict."""
    with open(config_path) as fh:
        payload = json.load(fh)

    cfg = payload.get("config", {})
    source_id = payload.get("sourceId", 0)

    db_type = cfg.get("dbType", "POSTGRESQL").upper()
    sql_query = (cfg.get("sqlQuery") or "").strip()

    print(f"[DB_FETCHER] Connecting to {db_type} at {cfg.get('host')}:{cfg.get('port')}...")

    ext_engine = create_engine(build_connection_url(cfg))
    gaung_engine = get_gaung_engine()
    ensure_layer_schema(gaung_engine, "bronze")

    if sql_query:
        # ── Query mode ──
        print(f"[DB_FETCHER] Running query: {sql_query[:200]}{'...' if len(sql_query) > 200 else ''}")
        with ext_engine.connect() as conn:
            result = conn.execute(text(sql_query))
            rows = result.fetchall()
            columns = list(result.keys())
        df = pd.DataFrame(rows, columns=columns)
        print(f"[DB_FETCHER] Query returned {len(df)} rows, {len(df.columns)} columns")

        table_name = f"ext_db_{source_id}".lower().replace("-", "_")
        row_count = write_to_bronze(df, table_name)

        return {
            "status": "SUCCESS",
            "rows": row_count,
            "columns": list(df.columns),
            "column_count": len(df.columns),
            "bronze_table": table_name,
            "query": sql_query[:500],
        }
    else:
        # ── Discovery mode ──
        print("[DB_FETCHER] No SQL query provided — discovering tables...")
        tables = discover_tables(ext_engine)

        # Store discovery results as a metadata table
        rows_data = []
        for t in tables:
            rows_data.append({
                "table_name": t["table_name"],
                "column_count": str(t["column_count"]),
                "columns_json": json.dumps(t["columns"]),
                "row_count_estimate": str(t.get("row_count_estimate", -1)),
            })

        df = pd.DataFrame(rows_data)
        table_name = f"ext_db_{source_id}_schema".lower().replace("-", "_")
        write_to_bronze(df, table_name)

        print(f"[DB_FETCHER] Discovered {len(tables)} tables")
        return {
            "status": "SUCCESS",
            "rows": len(tables),
            "columns": ["table_name", "column_count", "columns_json", "row_count_estimate"],
            "column_count": 4,
            "bronze_table": table_name,
            "tables_discovered": [t["table_name"] for t in tables],
            "mode": "discovery",
        }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <config.json>", file=sys.stderr)
        sys.exit(1)

    try:
        result = run(sys.argv[1])
        print(json.dumps(result, indent=2, default=str))
    except Exception as exc:
        print(json.dumps({"status": "FAILED", "error": str(exc)}, indent=2))
        sys.exit(1)
