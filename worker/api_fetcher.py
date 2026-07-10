#!/usr/bin/env python3
"""
Gaung API Fetcher — fetches data from REST API endpoints and stores to bronze layer.

Usage:
    python3 api_fetcher.py '<source_config_json>'

source_config_json format (from DataSource.config):
{
    "url": "https://api.example.com/v1/data",
    "method": "GET",
    "headers": {"Accept": "application/json"},
    "auth": {
        "type": "bearer",         // none | bearer | basic | apikey
        "token": "sk-...",        // for bearer
        "username": "user",       // for basic
        "password": "pass",       // for basic
        "keyName": "X-API-Key",   // for apikey
        "keyValue": "abc123",     // for apikey
        "placement": "header"     // header | query
    }
}

Environment variables expected:
    DATABASE_URL — PostgreSQL connection string
"""

import json
import sys
import os
from datetime import datetime, timezone
from urllib.parse import urlencode, urlparse, urlunparse, parse_qs

import requests
import pandas as pd
import psycopg2
import psycopg2.extras
from psycopg2 import sql as pg_sql


# ============================================================
# Helpers
# ============================================================


def get_db_conn():
    """Create a psycopg2 connection from DATABASE_URL."""
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        raise RuntimeError("DATABASE_URL not set")
    return psycopg2.connect(db_url)


def ensure_schema(conn, schema: str):
    """Create schema if it doesn't exist.
    
    Uses psycopg2.sql.Identifier to safely quote the schema name,
    preventing SQL injection if the schema name is ever dynamic.
    """
    with conn.cursor() as cur:
        cur.execute(
            pg_sql.SQL("CREATE SCHEMA IF NOT EXISTS {}").format(
                pg_sql.Identifier(schema)
            )
        )
    conn.commit()


def prepare_request(config: dict) -> tuple[str, str, dict, dict]:
    """
    Prepare the HTTP request from source config.
    Returns: (url, method, headers, auth_params)
    """
    url = config.get("url", "").strip()
    method = config.get("method", "GET").upper()
    headers = config.get("headers", {}) or {}

    if not url:
        raise ValueError("No URL in config")

    auth = config.get("auth", {}) or {}
    auth_type = auth.get("type", "none").lower()

    auth_params = {}

    if auth_type == "bearer":
        token = auth.get("token", "")
        if token:
            headers["Authorization"] = f"Bearer {token}"
        auth_params["type"] = "bearer"

    elif auth_type == "basic":
        username = auth.get("username", "")
        password = auth.get("password", "")
        if username or password:
            auth_params["type"] = "basic"
            auth_params["username"] = username
            auth_params["password"] = password

    elif auth_type == "apikey":
        key_name = auth.get("keyName", "X-API-Key")
        key_value = auth.get("keyValue", "")
        placement = auth.get("placement", "header")
        if key_name and key_value:
            if placement == "query":
                # Append to URL query string
                parsed = urlparse(url)
                query = parse_qs(parsed.query)
                query[key_name] = [key_value]
                new_query = urlencode(query, doseq=True)
                url = urlunparse(parsed._replace(query=new_query))
            else:
                headers[key_name] = key_value

    return url, method, headers, auth_params


def fetch_data(url: str, method: str, headers: dict, auth_params: dict) -> tuple[list, int]:
    """
    Make the HTTP request and return (records, row_count).
    Supports JSON array, JSON object (wrapped in list), and CSV.
    """
    print(f"[FETCH] {method} {url}")
    if headers:
        safe_headers = {k: (v[:8] + "..." if k.lower() == "authorization" else v) for k, v in headers.items()}
        print(f"[FETCH] Headers: {safe_headers}")

    kwargs: dict = {"headers": headers, "timeout": 60}

    if auth_params.get("type") == "basic":
        kwargs["auth"] = (auth_params["username"], auth_params["password"])

    try:
        if method == "GET":
            resp = requests.get(url, **kwargs)
        elif method == "POST":
            resp = requests.post(url, **kwargs)
        else:
            raise ValueError(f"Unsupported HTTP method: {method}")
    except requests.exceptions.Timeout:
        raise RuntimeError(f"Request timed out after 60s: {url}")
    except requests.exceptions.ConnectionError as e:
        raise RuntimeError(f"Connection failed: {e}")
    except requests.exceptions.RequestException as e:
        raise RuntimeError(f"Request failed: {e}")

    print(f"[FETCH] Status: {resp.status_code}")
    if resp.status_code >= 400:
        raise RuntimeError(f"HTTP {resp.status_code}: {resp.text[:500]}")

    content_type = resp.headers.get("Content-Type", "").lower()

    # Try to parse as JSON
    if "application/json" in content_type or resp.text.strip().startswith(("{", "[")):
        try:
            data = resp.json()
        except json.JSONDecodeError as e:
            raise RuntimeError(f"Failed to parse JSON response: {e}")

        if isinstance(data, list):
            records = data
        elif isinstance(data, dict):
            # Wrap single object
            records = [data]
        else:
            raise RuntimeError(f"Unexpected JSON type: {type(data).__name__}")

        print(f"[FETCH] Parsed {len(records)} JSON record(s)")
        return records, len(records)

    # Try to parse as CSV
    if "text/csv" in content_type or resp.text.strip().startswith(tuple("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ\"'0123456789")):
        import io
        try:
            df = pd.read_csv(io.StringIO(resp.text))
            records = df.to_dict(orient="records")
            # Convert numpy types to native Python
            records = [{k: (v.item() if hasattr(v, "item") else v) for k, v in r.items()} for r in records]
            print(f"[FETCH] Parsed {len(records)} CSV record(s)")
            return records, len(records)
        except Exception as e:
            raise RuntimeError(f"Failed to parse CSV response: {e}")

    raise RuntimeError(f"Unsupported content type: {content_type}")


def store_to_bronze(conn, source_id: int, records: list, source_name: str) -> tuple[str, int]:
    """
    Store records to a bronze table named api_{sourceId}_{timestamp}.
    Returns (table_name, row_count).
    """
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    table_name = f"api_{source_id}_{timestamp}"

    if not records:
        print("[STORE] No records to store")
        return table_name, 0

    # Collect all keys from all records
    all_keys = []
    seen = set()
    for record in records:
        for key in record:
            if key not in seen:
                all_keys.append(key)
                seen.add(key)

    # Sanitize column names
    safe_columns = [k.replace('"', '""') for k in all_keys]
    pg_columns = []
    for col in all_keys:
        safe = "".join(c if c.isalnum() or c == "_" else "_" for c in col).lower().strip("_")
        if not safe or safe[0].isdigit():
            safe = f"col_{safe}" if safe else "col"
        pg_columns.append(safe)

    ensure_schema(conn, "bronze")

    full_table = f'bronze."{table_name}"'

    # Create table
    col_defs = [f'"{c}" TEXT' for c in pg_columns]
    col_defs.append('"_fetched_at" TIMESTAMPTZ DEFAULT NOW()')

    with conn.cursor() as cur:
        cur.execute(f"CREATE TABLE IF NOT EXISTS {full_table} ({', '.join(col_defs)})")

        # Insert records
        for record in records:
            values = []
            for key in all_keys:
                val = record.get(key)
                if val is None:
                    values.append(None)
                elif isinstance(val, (dict, list)):
                    values.append(json.dumps(val, ensure_ascii=False))
                else:
                    values.append(str(val))

            placeholders = ", ".join(["%s"] * len(values))
            col_names = ", ".join(f'"{c}"' for c in pg_columns)
            cur.execute(
                f"INSERT INTO {full_table} ({col_names}) VALUES ({placeholders})",
                values,
            )

    conn.commit()
    print(f"[STORE] Inserted {len(records)} rows into {full_table}")
    return table_name, len(records)


def update_source_metadata(conn, source_id: int, row_count: int):
    """Update the DataSource lastSyncAt, rowsCount, and status."""
    now = datetime.now(timezone.utc)
    with conn.cursor() as cur:
        cur.execute(
            """UPDATE "DataSource"
               SET "lastSyncAt" = %s,
                   "rowsCount" = COALESCE("rowsCount", 0) + %s,
                   "status" = 'ACTIVE'
               WHERE id = %s""",
            (now, row_count, source_id),
        )
    conn.commit()
    print(f"[META] Updated source {source_id}: lastSyncAt={now.isoformat()}, +{row_count} rows")


# ============================================================
# Main
# ============================================================


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 api_fetcher.py '<source_config_json>' [source_id] [source_name]", file=sys.stderr)
        sys.exit(1)

    # Parse config
    config_raw = sys.argv[1]
    try:
        config = json.loads(config_raw)
    except json.JSONDecodeError as e:
        print(f"ERROR: Invalid JSON config: {e}", file=sys.stderr)
        sys.exit(1)

    source_id = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    source_name = sys.argv[3] if len(sys.argv) > 3 else "API Source"

    print(f"[START] Fetching data for source #{source_id} ({source_name})")

    try:
        # 1. Prepare request
        url, method, headers, auth_params = prepare_request(config)

        # 2. Fetch data
        records, row_count = fetch_data(url, method, headers, auth_params)

        if row_count == 0:
            print("[RESULT] status=success rows=0")
            sys.exit(0)

        # 3. Store to bronze
        conn = get_db_conn()
        try:
            table_name, stored_count = store_to_bronze(conn, source_id, records, source_name)

            # 4. Update source metadata if source_id provided
            if source_id > 0:
                update_source_metadata(conn, source_id, stored_count)
        finally:
            conn.close()

        print(f"[RESULT] status=success rows={stored_count} table={table_name}")
        sys.exit(0)

    except Exception as e:
        print(f"[ERROR] {e}", file=sys.stderr)
        # Update source status to ERROR if source_id is provided
        if source_id > 0:
            try:
                conn = get_db_conn()
                with conn.cursor() as cur:
                    cur.execute(
                        """UPDATE "DataSource" SET "status" = 'ERROR' WHERE id = %s""",
                        (source_id,),
                    )
                conn.commit()
                conn.close()
            except Exception:
                pass
        sys.exit(1)


if __name__ == "__main__":
    main()
