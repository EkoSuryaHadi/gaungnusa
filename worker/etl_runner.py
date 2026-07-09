#!/usr/bin/python3
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
    """Load CSV or Excel file from uploads directory."""
    if not source.get("filePath"):
        raise ValueError("No filePath in source config")

    file_path = Path(os.getcwd()) / "uploads" / source["filePath"]
    if not file_path.exists():
        raise FileNotFoundError(f"Source file not found: {file_path}")

    ext = file_path.suffix.lower()
    print(f"[SOURCE] Loading {file_path.name} ({source.get('fileSize', '?')} bytes)")

    if ext in (".xlsx", ".xls"):
        df = pd.read_excel(file_path)
    else:
        df = pd.read_csv(file_path)

    print(f"[SOURCE] Loaded {len(df)} rows, {len(df.columns)} columns")
    return df


def table_exists(layer: str, table_name: str) -> bool:
    """Check if a lakehouse table exists in the database."""
    engine = get_engine()
    with engine.connect() as conn:
        result = conn.execute(text(
            "SELECT EXISTS (SELECT 1 FROM information_schema.tables "
            "WHERE table_schema = :schema AND table_name = :table)"
        ), {"schema": layer, "table": table_name})
        return result.scalar()


def load_lakehouse_source(source: dict) -> pd.DataFrame:
    """Load data from an existing lakehouse table (bronze/silver/gold).

    Falls back to file-based ingest if the table doesn't exist yet.
    """
    table_name = source.get("sourceTable", "")
    source_layer = source.get("sourceLayer", "BRONZE").lower()

    if not table_name:
        raise ValueError("No sourceTable in lakehouse source config")

    engine = get_engine()
    full_table = f'{source_layer}."{table_name}"'

    # Check if table exists — give clear error instead of raw SQL crash
    if not table_exists(source_layer, table_name):
        raise RuntimeError(
            f"Bronze table '{full_table}' does not exist yet. "
            f"The upload/ingest may still be running or may have failed. "
            f"Please wait for Bronze ingest to complete, then retry Quick Process."
        )

    print(f"[SOURCE] Loading lakehouse table: {full_table}")
    with engine.connect() as conn:
        result = conn.execute(text(f"SELECT * FROM {full_table}"))
        rows = result.fetchall()
        columns = list(result.keys())
        df = pd.DataFrame(rows, columns=columns)
    print(f"[SOURCE] Loaded {len(df)} rows, {len(df.columns)} columns from {source_layer}")
    return df


def step_clean(df: pd.DataFrame, config: dict) -> pd.DataFrame:
    """Clean data: strip whitespace, deduplicate, fill nulls, normalize case."""
    result = df.copy()
    rows_before = len(result)

    if config.get("stripWhitespace"):
        for col in result.select_dtypes(include=["object", "string"]).columns:
            result[col] = result[col].str.strip()
        print("[CLEAN] Stripped whitespace")

    # Normalize text case (title, upper, lower)
    normalize_case = config.get("normalizeCase")
    if normalize_case:
        text_cols = result.select_dtypes(include=["object", "string"]).columns
        if normalize_case == "title":
            for col in text_cols:
                result[col] = result[col].str.title()
        elif normalize_case == "upper":
            for col in text_cols:
                result[col] = result[col].str.upper()
        elif normalize_case == "lower":
            for col in text_cols:
                result[col] = result[col].str.lower()
        print(f"[CLEAN] Normalized case → {normalize_case}")

    if config.get("deduplicate"):
        result = result.drop_duplicates()
        removed = rows_before - len(result)
        if removed > 0:
            print(f"[CLEAN] Removed {removed} duplicate rows")

    fill_nulls = config.get("fillNulls")
    # Parse string-encoded JSON (from frontend, stored as JSON-in-JSON)
    if isinstance(fill_nulls, str) and fill_nulls.strip().startswith('{'):
        try:
            fill_nulls = json.loads(fill_nulls)
        except (json.JSONDecodeError, ValueError):
            pass
    if fill_nulls:
        # Support two formats:
        # 1. Boolean + fillNullsValue (frontend): fill ALL object columns
        # 2. Dict (legacy): {"column": "value", ...} — fill specific columns
        # Template support: values can reference other columns like "REVIEW_{SAP_DocNo}"
        import re
        def resolve_template(val: str, row: pd.Series) -> str:
            """Replace {col_name} with actual row value."""
            def replacer(m):
                col = m.group(1)
                return str(row[col]) if col in row.index else m.group(0)
            return re.sub(r'\{(\w+)\}', replacer, val)
        
        if isinstance(fill_nulls, bool):
            fill_val = str(config.get("fillNullsValue", ""))
            has_template = '{' in fill_val
            for col in result.select_dtypes(include=["object", "string"]).columns:
                null_mask = result[col].isna()
                null_count = null_mask.sum()
                if null_count > 0:
                    if has_template:
                        # Per-row template resolution
                        result.loc[null_mask, col] = result.loc[null_mask].apply(
                            lambda row: resolve_template(fill_val, row), axis=1
                        )
                    else:
                        result[col] = result[col].fillna(fill_val)
                    print(f"[CLEAN] Filled {null_count} nulls in '{col}' with '{fill_val}'")
        elif isinstance(fill_nulls, dict):
            for col, val in fill_nulls.items():
                if col in result.columns:
                    val_str = str(val)
                    null_mask = result[col].isna()
                    null_count = null_mask.sum()
                    if null_count > 0:
                        if '{' in val_str:
                            result.loc[null_mask, col] = result.loc[null_mask].apply(
                                lambda row: resolve_template(val_str, row), axis=1
                            )
                        else:
                            result[col] = result[col].fillna(val_str)
                        print(f"[CLEAN] Filled {null_count} nulls in '{col}' with '{val_str}'")

    # Complementary fill: for paired columns like debit/credit,
    # if one has value and the other is null → set null to 0
    # Usage: complementaryFill: [["Debit (IDR)", "Credit (IDR)"]]
    #     or complementaryFill: true (auto-detect debit/credit pairs by name)
    complementary = config.get("complementaryFill")
    if complementary:
        pairs = []
        if complementary is True:
            # Auto-detect: find column pairs matching debit/credit patterns
            cols_lower = [(c, c.lower()) for c in result.columns]
            debit_cols = [c for c, cl in cols_lower if any(kw in cl for kw in ("debit", "amount_out", "pengeluaran", "keluar"))]
            credit_cols = [c for c, cl in cols_lower if any(kw in cl for kw in ("credit", "kredit", "amount_in", "pemasukan", "masuk"))]
            for d, c in zip(debit_cols, credit_cols):
                pairs.append([d, c])
        else:
            pairs = complementary

        for a, b in pairs:
            if a in result.columns and b in result.columns:
                # A has value, B is null → B = "0" (string, for pandas 3.x compat)
                mask_a = result[a].notna() & result[b].isna()
                if mask_a.sum() > 0:
                    result.loc[mask_a, b] = "0"
                    print(f"[CLEAN] Complementary fill: {mask_a.sum()} rows — '{a}' exists, '{b}' → 0")

                # B has value, A is null → A = "0" (string, for pandas 3.x compat)
                mask_b = result[b].notna() & result[a].isna()
                if mask_b.sum() > 0:
                    result.loc[mask_b, a] = "0"
                    print(f"[CLEAN] Complementary fill: {mask_b.sum()} rows — '{b}' exists, '{a}' → 0")

    return result


def step_validate(df: pd.DataFrame, config: dict) -> pd.DataFrame:
    """Validate data: NOT_NULL, COMPARE, NUMBER range, DATE format, UNIQUE, REGEX, ENUM.
    
    Rules format (from frontend string or JSON array):
      NOT_NULL:Bank_Ref
      COMPARE:SAP_Amount,Bank_Amount,0
      NUMBER:Amount,min=0
      DATE:Transaction_Date,format=YYYY-MM-DD
      UNIQUE:Transaction_ID
      REGEX:Code,pattern=^[A-Z]{3}-\\d+$
      ENUM:Status,values=ACTIVE,INACTIVE,PENDING
    
    Mode: "flag" (default) — adds _validation_issues column
          "drop" — removes failing rows
    
    Supports legacy dict format: [{"column":"x","type":"number","min":0}]
    """
    result = df.copy()
    rules_raw = config.get("validationRules") or config.get("rules", [])
    
    # Parse rules string (frontend format: "NOT_NULL:col\\nCOMPARE:col1,col2,tolerance")
    parsed_rules = []
    if isinstance(rules_raw, str) and rules_raw.strip():
        for line in rules_raw.strip().split("\n"):
            line = line.strip()
            if not line or ":" not in line:
                continue
            rule_type, params = line.split(":", 1)
            rule_parts = [p.strip() for p in params.split(",")]
            
            if rule_type.upper() == "NOT_NULL" and rule_parts:
                parsed_rules.append({"type": "NOT_NULL", "column": rule_parts[0]})
            elif rule_type.upper() == "COMPARE" and len(rule_parts) >= 2:
                parsed_rules.append({"type": "COMPARE", "col1": rule_parts[0], "col2": rule_parts[1], "tolerance": float(rule_parts[2]) if len(rule_parts) > 2 else 0})
            elif rule_type.upper() == "NUMBER" and rule_parts:
                r = {"type": "NUMBER", "column": rule_parts[0]}
                for p in rule_parts[1:]:
                    if "=" in p:
                        k, v = p.split("=")
                        r[k.strip()] = float(v.strip())
                parsed_rules.append(r)
            elif rule_type.upper() == "DATE" and rule_parts:
                parsed_rules.append({"type": "DATE", "column": rule_parts[0], "format": rule_parts[1] if len(rule_parts) > 1 else None})
            elif rule_type.upper() == "UNIQUE" and params.strip():
                parsed_rules.append({"type": "UNIQUE", "column": params.strip()})
            elif rule_type.upper() == "REGEX" and "," in params:
                col, rest = params.split(",", 1)
                pattern = ""
                if "pattern=" in rest:
                    pattern = rest.split("pattern=", 1)[1].strip()
                parsed_rules.append({"type": "REGEX", "column": col.strip(), "pattern": pattern})
            elif rule_type.upper() == "ENUM" and "," in params:
                col, rest = params.split(",", 1)
                values_str = ""
                if "values=" in rest:
                    values_str = rest.split("values=", 1)[1].strip()
                values = [v.strip() for v in values_str.split(",") if v.strip()]
                parsed_rules.append({"type": "ENUM", "column": col.strip(), "values": values})
    elif isinstance(rules_raw, list):
        parsed_rules = rules_raw
    
    mode = config.get("validationMode", "flag")
    issues = pd.Series([[] for _ in range(len(result))], index=result.index)
    drop_mask = pd.Series(False, index=result.index)
    
    for rule in parsed_rules:
        rule_type = rule.get("type", "").upper()
        
        if rule_type == "NOT_NULL":
            col = rule.get("column", "")
            if col in result.columns:
                null_mask = result[col].isna() | (result[col].astype(str).str.strip() == "")
                count = null_mask.sum()
                if count > 0:
                    if mode == "drop":
                        drop_mask |= null_mask
                    else:
                        for idx in result[null_mask].index:
                            issues[idx].append(f"Missing {col}")
                    print(f"[VALIDATE] {count} rows with missing '{col}' {'dropped' if mode=='drop' else 'flagged'}")
        
        elif rule_type == "COMPARE":
            col1 = rule.get("col1", "")
            col2 = rule.get("col2", "")
            tol = rule.get("tolerance", 0)
            if col1 in result.columns and col2 in result.columns:
                # Convert to numeric
                a = pd.to_numeric(result[col1], errors="coerce")
                b = pd.to_numeric(result[col2], errors="coerce")
                diff = (a - b).abs()
                mismatch = diff > tol
                count = mismatch.sum()
                if count > 0:
                    if mode == "drop":
                        drop_mask |= mismatch
                    else:
                        for idx in result[mismatch].index:
                            d = diff[idx]
                            issues[idx].append(f"Mismatch {col1} vs {col2} (diff={d:,.0f})")
                    print(f"[VALIDATE] {count} rows with {col1} ≠ {col2} {'dropped' if mode=='drop' else 'flagged'}")
        
        elif rule_type == "NUMBER":
            col = rule.get("column", "")
            if col in result.columns:
                result[col] = pd.to_numeric(result[col], errors="coerce")
                min_val = rule.get("min")
                max_val = rule.get("max")
                if min_val is not None:
                    mask = result[col] < min_val
                    if mask.sum():
                        drop_mask |= mask
                        print(f"[VALIDATE] Dropped {mask.sum()} rows where {col} < {min_val}")
                if max_val is not None:
                    mask = result[col] > max_val
                    if mask.sum():
                        drop_mask |= mask
                        print(f"[VALIDATE] Dropped {mask.sum()} rows where {col} > {max_val}")
        
        elif rule_type == "DATE":
            col = rule.get("column", "")
            if col in result.columns:
                result[col] = pd.to_datetime(result[col], errors="coerce")
                nulls = result[col].isna().sum()
                if nulls:
                    print(f"[VALIDATE] {nulls} rows with invalid date in '{col}'")

        elif rule_type == "UNIQUE":
            col = rule.get("column", "")
            if col in result.columns:
                dup_mask = result[col].duplicated(keep=False)
                count = dup_mask.sum()
                if count > 0:
                    if mode == "drop":
                        drop_mask |= result[col].duplicated(keep="first")
                    else:
                        for idx in result[dup_mask].index:
                            issues[idx].append(f"Duplicate {col}: '{result.at[idx, col]}'")
                    print(f"[VALIDATE] {count} duplicate rows in '{col}' {'dropped' if mode=='drop' else 'flagged'}")

        elif rule_type == "REGEX":
            col = rule.get("column", "")
            pattern = rule.get("pattern", "")
            if col in result.columns:
                import re
                try:
                    regex = re.compile(pattern)
                    str_col = result[col].astype(str)
                    invalid_mask = ~str_col.apply(lambda x: bool(regex.match(str(x))))
                except re.error as e:
                    print(f"[VALIDATE] Invalid regex pattern '{pattern}': {e}, flagging all rows")
                    invalid_mask = pd.Series(True, index=result.index)

                count = invalid_mask.sum()
                if count > 0:
                    if mode == "drop":
                        drop_mask |= invalid_mask
                    else:
                        for idx in result[invalid_mask].index:
                            issues[idx].append(f"Regex mismatch {col} (pattern: {pattern})")
                    print(f"[VALIDATE] {count} rows failed regex '{pattern}' on '{col}' {'dropped' if mode=='drop' else 'flagged'}")

        elif rule_type == "ENUM":
            col = rule.get("column", "")
            values = rule.get("values", [])
            if col in result.columns and values:
                allowed = [v.strip().upper() for v in values]
                str_col = result[col].astype(str).str.upper()
                invalid_mask = ~str_col.isin(allowed)
                # Treat NaN as invalid too
                nan_mask = result[col].isna()
                invalid_mask = invalid_mask | nan_mask
                count = invalid_mask.sum()
                if count > 0:
                    if mode == "drop":
                        drop_mask |= invalid_mask
                    else:
                        for idx in result[invalid_mask].index:
                            issues[idx].append(f"Invalid enum {col}: '{result.at[idx, col]}' (allowed: {', '.join(values)})")
                    print(f"[VALIDATE] {count} rows with invalid enum in '{col}' {'dropped' if mode=='drop' else 'flagged'}")

    # Apply mode
    if mode == "drop":
        result = result[~drop_mask]
        print(f"[VALIDATE] {drop_mask.sum()} total rows removed, {len(result)} remaining")
    else:
        # Add issues column
        result["_validation_issues"] = issues.apply(lambda x: "; ".join(x) if x else "PASS")
        passed = (result["_validation_issues"] == "PASS").sum()
        failed = len(result) - passed
        print(f"[VALIDATE] {passed} rows PASS, {failed} rows with issues (flagged in _validation_issues)")
    
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


FUNC_MAP = {
    "SUM": "sum",
    "AVG": "mean",
    "AVERAGE": "mean",
    "COUNT": "count",
    "MIN": "min",
    "MAX": "max",
}

def _parse_aggregations(config: dict) -> dict:
    """
    Parse aggregations from config.  Supports two formats:

    Format A — dict (legacy / programmatic):
        {"total_amount": "Amount SUM", "tx_count": "* COUNT"}

    Format B — multi-line string (frontend):
        "total_amount = SUM(Amount)\\ntransaction_count = COUNT(*)\\navg_amount = AVG(Amount)"
    """
    raw = config.get("aggregations", {})

    if isinstance(raw, dict) and raw:
        return raw

    if isinstance(raw, str) and raw.strip():
        parsed = {}
        for line in raw.strip().split("\n"):
            line = line.strip()
            if not line or "=" not in line:
                continue
            out_col, expr = line.split("=", 1)
            out_col = out_col.strip()
            expr = expr.strip()
            # expr looks like "SUM(Amount)" or "COUNT(*)"
            if "(" in expr and expr.endswith(")"):
                func_name, col_part = expr[:-1].split("(", 1)
                func_name = func_name.strip().upper()
                inp_col = col_part.strip()
                # Map to internal format "inp_col FUNC" or "* FUNC"
                parsed[out_col] = f"{inp_col} {func_name}"
            else:
                parsed[out_col] = expr
        return parsed

    return {}


def step_aggregate(df: pd.DataFrame, config: dict) -> pd.DataFrame:
    """Aggregate: GROUP BY with aggregations."""
    group_by = config.get("groupBy", [])
    if isinstance(group_by, str):
        group_by = [g.strip() for g in group_by.split(",") if g.strip()]

    aggs = _parse_aggregations(config)

    if not aggs:
        return df

    # Build a temporary count column for COUNT(*)
    count_star_col = None
    agg_funcs: list[tuple] = []  # (pandas_func, column, output_name)

    for out_col, expr in aggs.items():
        parts = expr.split()
        if len(parts) < 2:
            continue
        inp_col = parts[0].strip('"')  # strip quotes from config
        func = parts[1].upper()
        pandas_func = FUNC_MAP.get(func)
        if not pandas_func:
            print(f"[AGGREGATE] Unknown function '{func}', skipping")
            continue

        if inp_col == "*" and func == "COUNT":
            # COUNT(*) — count rows per group
            if count_star_col is None:
                count_star_col = "_count_star_"
                # Use any column for counting; create a dedicated column
                df[count_star_col] = 1
            agg_funcs.append(("count_star", count_star_col, out_col))
        elif inp_col in df.columns:
            agg_funcs.append((pandas_func, inp_col, out_col))
        else:
            print(f"[AGGREGATE] Column '{inp_col}' not found, skipping")

    if not agg_funcs:
        return df

    # Build pandas agg dict
    pandas_agg = {}
    for func, col, out_col in agg_funcs:
        if func == "count_star":
            pandas_agg[out_col] = pd.NamedAgg(column=col, aggfunc="sum")
        else:
            pandas_agg[out_col] = pd.NamedAgg(column=col, aggfunc=func)

    if group_by:
        # Validate group-by columns
        valid_groups = [g for g in group_by if g in df.columns]
        if not valid_groups:
            print(f"[AGGREGATE] No valid group-by columns found in data")
            return df
        result = df.groupby(valid_groups, as_index=False).agg(**pandas_agg)
    else:
        result = df.agg(**pandas_agg)
        result = pd.DataFrame([result])

    # Drop the temporary count column
    if count_star_col and count_star_col in df.columns:
        df.drop(columns=[count_star_col], inplace=True)

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
    #
    # WARNING: datetime columns MUST use TIMESTAMPTZ, never TIMESTAMP.
    # TIMESTAMP (without timezone) silently drops timezone information,
    # corrupting all datetime data. This was the root cause of a
    # critical bug on 2026-07-07 where +08:00 timestamps appeared
    # as UTC because timezone info was discarded during INSERT.
    # Tests in tests/silver/test_tz_safeguard.py verify this.
    col_defs = []
    for col in df.columns:
        dtype = str(df[col].dtype).lower()
        if "int" in dtype:
            pg_type = "BIGINT"
        elif "float" in dtype:
            pg_type = "DOUBLE PRECISION"
        elif "datetime" in dtype:
            pg_type = "TIMESTAMPTZ"
            # Guard: if we ever change this back to TIMESTAMP,
            # timezone-aware data will be silently corrupted.
            if hasattr(df[col].dtype, "tz") and df[col].dtype.tz is not None:
                print(f"[OUTPUT]  ✓ Column '{col}' is timezone-aware ({df[col].dtype.tz}) → TIMESTAMPTZ")
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

    # Convert pandas/numpy types to native Python types (psycopg2 requires native types)
    import numpy as np

    def _to_native(v):
        if pd.isna(v):
            return None
        if isinstance(v, (np.integer,)):
            return int(v)
        if isinstance(v, (np.floating,)):
            return float(v)
        if isinstance(v, (np.bool_,)):
            return bool(v)
        return v

    rows = [tuple(_to_native(v) for v in row) for row in df.itertuples(index=False, name=None)]
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


# ============================================================
# Silver AI Quality Engine step
# ============================================================

def step_silver(df: pd.DataFrame, config: dict) -> pd.DataFrame:
    """Run the Silver AI Data Quality Engine on the DataFrame.

    Delegates to silver.engine.orchestrator.SilverOrchestrator.
    This is the bridge between the legacy ETL runner and the
    new modular Silver engine.

    Config keys (from pipeline step):
        mode: "quick" | "full" (default) | "deep" | "custom"
        domain: "iot" | "finance" | "sales" | "erp" | "hr" | null (auto)
        modules: ["profiling", "validation", "scoring"]  (custom mode)
        validation_mode: "flag" (default) | "drop"
    """
    print("[SILVER] Starting AI Data Quality Engine...")

    try:
        from silver.engine.orchestrator import SilverOrchestrator
    except ImportError as e:
        print(f"[SILVER] Engine not available: {e}, falling back to legacy validate")
        return step_validate(df, config)

    orch = SilverOrchestrator()

    # Merge pipeline-level config with step config
    silver_config = {
        "mode": config.get("silverMode", "full"),
        "domain": config.get("silverDomain"),
        "modules": config.get("silverModules"),
        "validation_mode": config.get("validationMode", "flag"),
        "tenant_id": config.get("tenantId"),
        "pipeline_id": config.get("pipelineId"),
        "run_id": config.get("runId"),
    }

    # If legacy config has validationRules but no silver config,
    # auto-detect and upgrade to Silver
    if not silver_config["domain"] and config.get("validationRules"):
        silver_config["mode"] = "custom"
        silver_config["modules"] = ["profiling", "datatype", "validation", "scoring"]

    df, ctx = orch.run(df, silver_config)

    # Print quality score summary
    if ctx.quality_score:
        print(f"[SILVER] DQI Overall: {ctx.quality_score.overall}/100")
        print(f"  Completeness: {ctx.quality_score.completeness}%")
        print(f"  Validity:     {ctx.quality_score.validity}%")
        print(f"  Uniqueness:   {ctx.quality_score.uniqueness}%")

    if ctx.recommendations:
        print(f"[SILVER] {len(ctx.recommendations)} recommendations generated")

    if ctx.warnings:
        print(f"[SILVER] {len(ctx.warnings)} warnings")
        for w in ctx.warnings[:3]:
            print(f"  ⚠ {w}")

    # Attach Silver quality data to df for extraction in run_pipeline
    df.attrs["_silver_quality"] = ctx.quality_score.to_dict() if ctx.quality_score else None
    df.attrs["_silver_audit"] = [a.to_dict() for a in ctx.audit_trail[-5:]]  # last 5 entries

    return df


# ============================================================
# Step handlers registry
# ============================================================

STEP_HANDLERS = {
    "CLEAN":          step_clean,
    "VALIDATE":       step_validate,
    "SILVER_QUALITY": step_silver,
    "TRANSFORM":      step_transform,
    "FILTER":         step_filter,
    "CATEGORIZE":     step_categorize,
    "AGGREGATE":   step_aggregate,
    "SORT":        step_sort,
    "JOIN":        step_join,
    "OUTPUT":      lambda df, cfg, _src: write_output(df, cfg),
}



def dtype_to_sql(dtype) -> str:
    """Convert pandas dtype to SQL type name."""
    d = str(dtype).lower()
    if "int" in d:
        return "BIGINT"
    elif "float" in d:
        return "DOUBLE PRECISION"
    elif "datetime" in d:
        return "TIMESTAMPTZ"
    elif "bool" in d:
        return "BOOLEAN"
    else:
        return "VARCHAR"


def run_pipeline(config_path: str) -> dict:
    """Execute pipeline steps sequentially."""
    with open(config_path) as f:
        pipeline = json.load(f)

    run_id = pipeline.get("runId", 0)

    # Import WS reporter lazily (optional)
    try:
        from ws_reporter import report as ws_report
    except ImportError:
        ws_report = None

    print(f"=== Gaung ETL Worker ===")
    print(f"Pipeline: {pipeline.get('pipelineId')}, Run: {run_id}")

    source_data = pipeline.get("source", {})
    steps = sorted(pipeline.get("steps", []), key=lambda s: s["order"])

    df: pd.DataFrame | None = None
    rows_output = 0
    column_metadata: list[dict] = []
    outputs: list[dict] = []  # metadata for each OUTPUT step

    total_steps = len(steps)

    for i, step in enumerate(steps):
        step_type = step.get("type", "UNKNOWN")
        config = step.get("config", {})

        print(f"\n--- Step {i+1}/{total_steps}: {step_type} ---")

        # Report progress via WebSocket
        if ws_report:
            try:
                ws_report(run_id, "step_start", {
                    "step": i + 1,
                    "total": total_steps,
                    "type": step_type,
                    "progress": round((i / total_steps) * 100),
                })
            except Exception:
                pass

        if step_type == "SOURCE":
            df = step_source(None, config, source_data)

        elif step_type == "OUTPUT":
            if df is None:
                print("[OUTPUT] No data to write, skipping")
                continue
            cols = [{"name": str(col), "type": dtype_to_sql(df[col].dtype)} for col in df.columns]
            layer = (step.get("outputLayer") or config.get("outputLayer") or "SILVER").lower()
            table = (step.get("outputTable") or config.get("outputTable") or "output").lower()
            nrows = write_output(df, step)
            rows_output = nrows
            column_metadata = cols
            outputs.append({
                "layer": layer,
                "table": table,
                "rows": nrows,
                "columns": cols,
            })
            # Don't set df = None — multiple OUTPUT steps can share the pipeline,
            # and subsequent steps (AGGREGATE→OUTPUT) need the data.

        else:
            if df is None:
                print(f"[{step_type}] No data in pipeline, skipping")
                continue
            handler = STEP_HANDLERS.get(step_type)
            if handler:
                df = handler(df, config)
            else:
                print(f"[{step_type}] Unknown step type, skipping")

    # Report completion via WebSocket
    if ws_report:
        try:
            ws_report(run_id, "complete", {
                "rows": rows_output,
                "outputs": outputs,
                "progress": 100,
            })
        except Exception:
            pass

    print(f"\n=== Pipeline Complete === rows={rows_output}")

    # Extract Silver quality data from DataFrame attrs
    silver_quality = None
    silver_audit = None
    if df is not None and hasattr(df, "attrs"):
        silver_quality = df.attrs.get("_silver_quality")
        silver_audit = df.attrs.get("_silver_audit")

    return {
        "rows": rows_output,
        "columns": column_metadata,
        "outputs": outputs,
        "silverQuality": silver_quality,
        "silverAudit": silver_audit,
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 etl_runner.py <config.json>")
        sys.exit(1)

    config_path = sys.argv[1]
    result = run_pipeline(config_path)
    print(json.dumps(result))
