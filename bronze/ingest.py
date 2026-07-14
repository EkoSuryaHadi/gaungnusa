"""
Gaung V3 — Bronze Layer Ingest Engine
Reads CSV → Converts to Parquet → Uploads to MinIO → Creates Iceberg-compatible table in DuckDB
"""
import os
import io
import json
import time
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import pandas as pd
import duckdb
from minio import Minio

# ─── Config ────────────────────────────────────────────────
MINIO_HOST = os.environ.get("GAUNG_MINIO_HOST", "localhost:9000")
MINIO_ACCESS = os.environ.get("GAUNG_MINIO_ACCESS", "gaung")
MINIO_SECRET = os.environ.get("GAUNG_MINIO_SECRET", "gaung-minio-2026")
DUCKDB_PATH = os.environ.get("GAUNG_DUCKDB_PATH", "/home/ubuntu/gaung_v3/gaung.db")
MINIO_SECURE = False  # local dev, set True for production


def get_minio_client() -> Minio:
    return Minio(MINIO_HOST, access_key=MINIO_ACCESS, secret_key=MINIO_SECRET, secure=MINIO_SECURE)


def get_duckdb() -> duckdb.DuckDBPyConnection:
    con = duckdb.connect(DUCKDB_PATH)
    # Enable Iceberg extension queries via DuckDB
    con.execute("INSTALL httpfs; LOAD httpfs;")
    con.execute("INSTALL parquet; LOAD parquet;")
    return con


def ingest_csv_to_bronze(
    csv_path: str,
    source_name: str,
    tenant_id: int,
    source_id: int,
    delimiter: str = ",",
    encoding: str = "utf-8",
) -> dict:
    """
    Phase 2: CSV → Parquet → MinIO → DuckDB Iceberg table
    
    Returns metadata dict with:
      - parquet_path: S3 path in MinIO
      - row_count: number of rows ingested
      - columns: list of column names
      - file_size_bytes: size of parquet file
      - iceberg_table: DuckDB table reference
    """
    minio = get_minio_client()
    con = get_duckdb()
    
    # 1. Read CSV as Pandas
    df = pd.read_csv(csv_path, delimiter=delimiter, encoding=encoding)
    row_count = len(df)
    columns = list(df.columns)
    
    # 2. Generate unique Parquet filename (immutable — no overwrite)
    now_utc = datetime.now(timezone.utc)
    timestamp = now_utc.strftime("%Y%m%d_%H%M%S")
    timestamp_iso = now_utc.strftime("%Y-%m-%d %H:%M:%S")
    content_hash = hashlib.sha256(df.to_csv(index=False).encode()).hexdigest()[:12]
    parquet_filename = f"{source_name}_{tenant_id}_{timestamp}_{content_hash}.parquet"
    s3_prefix = f"{source_name}/{tenant_id}"
    s3_path = f"{s3_prefix}/{parquet_filename}"
    
    # 3. Convert to Parquet in memory, then upload to MinIO
    parquet_buffer = io.BytesIO()
    df.to_parquet(parquet_buffer, engine="pyarrow", compression="snappy", index=False)
    parquet_buffer.seek(0)
    file_size = parquet_buffer.getbuffer().nbytes
    
    minio.put_object(
        bucket_name="bronze",
        object_name=s3_path,
        data=parquet_buffer,
        length=file_size,
        content_type="application/octet-stream",
    )
    
    # 4. Register Parquet in DuckDB via S3 protocol (MinIO-compatible)
    table_name = f"bronze_{source_name}_{tenant_id}"
    
    # Set S3 credentials for DuckDB
    con.execute(f"""
        SET s3_endpoint='{MINIO_HOST}';
        SET s3_access_key_id='{MINIO_ACCESS}';
        SET s3_secret_access_key='{MINIO_SECRET}';
        SET s3_use_ssl=false;
        SET s3_url_style='path';
    """)
    
    s3_path_full = f"s3://bronze/{s3_path}"
    
    con.execute(f"""
        CREATE OR REPLACE VIEW "{table_name}_latest" AS
        SELECT *, '{parquet_filename}' AS _source_file, '{timestamp_iso}' AS _ingested_at
        FROM read_parquet('{s3_path_full}')
    """)
    
    # 5. Create metadata table tracking all ingestions
    con.execute("""
        CREATE TABLE IF NOT EXISTS _bronze_manifest (
            source_name VARCHAR,
            tenant_id INTEGER,
            parquet_path VARCHAR,
            row_count INTEGER,
            columns VARCHAR,
            file_size_bytes BIGINT,
            content_hash VARCHAR,
            ingested_at TIMESTAMP,
            PRIMARY KEY (source_name, tenant_id, content_hash)
        )
    """)
    
    con.execute(f"""
        INSERT INTO _bronze_manifest VALUES (
            '{source_name}', {tenant_id}, '{s3_path}',
            {row_count}, '{json.dumps(columns)}', {file_size},
            '{content_hash}', '{timestamp_iso}'
        )
        ON CONFLICT (source_name, tenant_id, content_hash) DO NOTHING
    """)
    
    con.close()
    
    # Track lineage event
    try:
        from lineage.tracker import track_bronze_ingest
        run_id = hashlib.md5(f"{source_name}|{content_hash}|{timestamp}".encode()).hexdigest()[:8]
        track_bronze_ingest(run_id, source_name, s3_path, columns)
    except ImportError:
        pass
    
    result = {
        "parquet_path": s3_path,
        "parquet_url": f"s3://bronze/{s3_path}",
        "row_count": row_count,
        "columns": columns,
        "file_size_bytes": file_size,
        "compression": "snappy",
        "source_name": source_name,
        "tenant_id": tenant_id,
        "content_hash": content_hash,
        "table_view": table_name + "_latest",
    }
    
    print(f"✅ Bronze ingest: {csv_path} → {s3_path} ({row_count} rows, {file_size} bytes)")
    return result


def get_bronze_data(source_name: str, tenant_id: int, version: Optional[str] = None) -> pd.DataFrame:
    """Query Bronze data with optional time-travel (Iceberg snapshot)"""
    con = get_duckdb()
    
    # Set S3 credentials
    con.execute(f"""
        SET s3_endpoint='{MINIO_HOST}';
        SET s3_access_key_id='{MINIO_ACCESS}';
        SET s3_secret_access_key='{MINIO_SECRET}';
        SET s3_use_ssl=false;
        SET s3_url_style='path';
    """)
    
    if version:
        # Time travel: get specific version
        query = f"""
            SELECT parquet_path FROM _bronze_manifest
            WHERE source_name = '{source_name}'
              AND tenant_id = {tenant_id}
              AND ingested_at <= '{version}'
            ORDER BY ingested_at DESC LIMIT 1
        """
        result = con.execute(query).fetchone()
        if result:
            parquet_path = result[0]
            s3_full = f"s3://bronze/{parquet_path}"
            df = con.execute(f"SELECT * FROM read_parquet('{s3_full}')").fetchdf()
            return df
    
    # Default: latest version
    table_view = f"bronze_{source_name}_{tenant_id}_latest"
    df = con.execute(f"SELECT * FROM \"{table_view}\"").fetchdf()
    con.close()
    return df


def list_bronze_versions(source_name: str, tenant_id: int) -> list[dict]:
    """List all versions of a bronze dataset"""
    con = get_duckdb()
    query = f"""
        SELECT parquet_path, row_count, file_size_bytes, content_hash, ingested_at
        FROM _bronze_manifest
        WHERE source_name = '{source_name}' AND tenant_id = {tenant_id}
        ORDER BY ingested_at DESC
    """
    results = con.execute(query).fetchall()
    con.close()
    return [dict(zip(["path", "rows", "size", "hash", "ingested_at"], r)) for r in results]
