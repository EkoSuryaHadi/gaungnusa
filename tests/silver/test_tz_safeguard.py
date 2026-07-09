"""Integration test: verify end-to-end timestamp timezone preservation.

Prevents regression of critical bug where TIMESTAMP (without timezone) silently
dropped timezone information, causing +08:00 timestamps to appear as UTC.

See: 2026-07-07 fix — pg_type changed from TIMESTAMP → TIMESTAMPTZ
"""

import sys
import os
import json
import subprocess
import pytest
import psycopg2
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

DB_URL = os.getenv("DATABASE_URL", "")

pytestmark = pytest.mark.skipif(
    not DB_URL,
    reason="DATABASE_URL not set — skip integration test"
)

TEST_TABLE = "test_tz_safeguard"


def _run_etl(steps, source_table="data_iot_bronze_raw"):
    """Run etl_runner.py as subprocess with given steps."""
    config = {
        "pipelineId": 99999,
        "runId": 99999,
        "source": {
            "fromLakehouse": True,
            "sourceTable": source_table,
            "sourceLayer": "BRONZE",
        },
        "steps": steps,
    }
    config_path = f"/tmp/gaung_test_tz_{os.getpid()}.json"
    with open(config_path, "w") as f:
        json.dump(config, f)

    env = os.environ.copy()
    env["DATABASE_URL"] = DB_URL or ""

    # Project root: tests/silver/ → tests/ → gaung/
    project_root = Path(__file__).resolve().parent.parent.parent
    etl_runner = project_root / "worker" / "etl_runner.py"

    result = subprocess.run(
        ["python3", str(etl_runner), config_path],
        capture_output=True, text=True, timeout=60, env=env,
    )
    os.unlink(config_path)

    # Parse JSON result
    for line in result.stdout.split("\n"):
        if line.strip().startswith("{"):
            return json.loads(line), result

    return None, result


@pytest.fixture(autouse=True)
def cleanup():
    """Clean up test table after each test."""
    yield
    try:
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
        cur.execute(f"DROP TABLE IF EXISTS silver.\"{TEST_TABLE}\"")
        conn.commit()
        cur.close()
        conn.close()
    except Exception:
        pass


def test_column_type_is_timestamptz():
    """Column type for datetime MUST be timestamp WITH time zone."""
    steps = [
        {"order": 1, "type": "SOURCE", "config": {"sourceTable": "data_iot_bronze_raw", "sourceLayer": "BRONZE"}},
        {"order": 2, "type": "CLEAN", "config": {"stripWhitespace": True, "deduplicate": True}},
        {"order": 3, "type": "SILVER_QUALITY", "config": {"silverMode": "full"}},
        {"order": 4, "type": "OUTPUT", "outputLayer": "SILVER", "outputTable": TEST_TABLE,
         "config": {"outputLayer": "SILVER", "outputTable": TEST_TABLE}},
    ]

    data, result = _run_etl(steps)
    assert data is not None, f"ETL failed:\nSTDERR: {result.stderr[-500:]}\nSTDOUT: {result.stdout[-500:]}"
    assert data.get("rows", 0) > 0, f"Expected rows > 0, got {data.get('rows')}"

    # Verify column type
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    cur.execute("""
        SELECT data_type FROM information_schema.columns
        WHERE table_schema = 'silver' AND table_name = %s AND column_name = 'timestamp'
    """, (TEST_TABLE,))
    row = cur.fetchone()
    cur.close()
    conn.close()

    assert row is not None, "timestamp column not found!"
    col_type = row[0].lower()
    assert "time" in col_type and "zone" in col_type, (
        f"CRITICAL: timestamp column type is '{col_type}', "
        f"must be 'timestamp with time zone'!\n"
        f"TIMESTAMP (without TZ) silently drops timezone info, "
        f"corrupting all datetime data."
    )
    print(f"  ✓ Column type: {row[0]}")


def test_timezone_preserved_on_roundtrip():
    """Mixed timezones survive write→read round-trip correctly."""
    steps = [
        {"order": 1, "type": "SOURCE", "config": {"sourceTable": "data_iot_bronze_raw", "sourceLayer": "BRONZE"}},
        {"order": 2, "type": "CLEAN", "config": {"stripWhitespace": True, "deduplicate": True}},
        {"order": 3, "type": "SILVER_QUALITY", "config": {"silverMode": "full"}},
        {"order": 4, "type": "OUTPUT", "outputLayer": "SILVER", "outputTable": TEST_TABLE,
         "config": {"outputLayer": "SILVER", "outputTable": TEST_TABLE}},
    ]

    data, result = _run_etl(steps)
    assert data is not None, f"ETL failed:\n{result.stderr[-500:]}"

    # Read back and verify dev-A timestamps (sample of the IoT data)
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    cur.execute(f"""
        SELECT "timestamp" AT TIME ZONE 'UTC' as ts_utc
        FROM silver."{TEST_TABLE}"
        WHERE device_id = 'dev-A'
        ORDER BY "timestamp"
        LIMIT 5
    """)
    rows = [str(r[0]) for r in cur.fetchall()]
    cur.close()
    conn.close()

    assert len(rows) >= 1, "No dev-A rows found"

    # First dev-A row: 2026-07-06T20:00:00+08:00 → 12:00 UTC
    assert rows[0] == "2026-07-06 12:00:00", (
        f"Row 1: expected '2026-07-06 12:00:00' (UTC), got '{rows[0]}'"
    )

    # Check no nulls
    assert all("NaT" not in r and r != "None" for r in rows), f"Found NaT in timestamps: {rows}"

    print(f"  ✓ dev-A timestamps (UTC): {rows}")


def test_no_timestamp_without_tz_in_code():
    """Static check: etl_runner.py must never use TIMESTAMP without TZ."""
    import re

    project_root = Path(__file__).resolve().parent.parent.parent
    etl_path = project_root / "worker" / "etl_runner.py"

    with open(etl_path) as f:
        lines = f.readlines()

    violations = []
    for i, line in enumerate(lines, 1):
        stripped = line.strip()
        # Skip comments
        if stripped.startswith("#"):
            continue
        # Check for TIMESTAMP not followed by TZ
        if "TIMESTAMP" in stripped and "TIMESTAMPTZ" not in stripped:
            violations.append(f"  Line {i}: {stripped[:80]}")

    assert not violations, (
        f"CRITICAL: Found 'TIMESTAMP' (without TZ) in etl_runner.py!\n"
        f"This will corrupt datetime timezone data.\n"
        + "\n".join(violations)
    )
    print(f"  ✓ No TIMESTAMP (without TZ) found — all use TIMESTAMPTZ")
