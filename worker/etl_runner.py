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
import re as _re
import sys
import os
from pathlib import Path
from datetime import datetime, timezone

import pandas as pd
from sqlalchemy import create_engine, text

# ============================================================
# Helpers
# ============================================================

# Allowed schema names for lakehouse layers
_VALID_LAYERS = {"bronze", "silver", "gold"}


def sanitize_identifier(name: str) -> str:
    """Sanitize a SQL identifier (table/schema name) to prevent SQL injection.
    
    Only allows alphanumeric characters, underscores, hyphens, and dots.
    Double-quotes internal double-quotes for safe quoting.
    """
    if not name:
        raise ValueError("Identifier cannot be empty")
    # Remove or escape dangerous characters
    sanitized = _re.sub(r'[^\w\-.]', '_', name)
    # Escape double quotes for PostgreSQL quoted identifiers
    sanitized = sanitized.replace('"', '""')
    return sanitized


def sanitize_layer(layer: str) -> str:
    """Validate and return a safe layer/schema name."""
    layer = layer.lower().strip()
    if layer not in _VALID_LAYERS:
        raise ValueError(f"Invalid layer '{layer}'. Must be one of: {_VALID_LAYERS}")
    return layer


def get_engine():
    """Create SQLAlchemy engine from DATABASE_URL env var."""
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        raise RuntimeError("DATABASE_URL not set")
    return create_engine(db_url)


def to_numeric_clean(series: pd.Series) -> pd.Series:
    """Clean currency symbols, common units/suffixes, and handle both English and Indonesian number formats."""
    import re
    def clean_val(val):
        if pd.isna(val):
            return val
        s = str(val).strip()
        if not s:
            return None
            
        # Check for accounting negative format: (123.45) -> -123.45
        is_negative = False
        if s.startswith('(') and s.endswith(')'):
            is_negative = True
            s = s[1:-1].strip()
            
        # Remove common currency symbols: IDR, Rp, $, etc.
        s = re.sub(r'^(?:IDR|Rp|USD|EUR|SGD|\$)\s*', '', s, flags=re.IGNORECASE)
        s = re.sub(r'\s*(?:IDR|Rp|USD|EUR|SGD|\$)$', '', s, flags=re.IGNORECASE).strip()
        
        # Remove common units/suffixes: %, kg, gram, g, pcs, box, unit, hpa, mbar, °c, c, ton, meter, m, cm, mm, inch
        s = re.sub(r'\s*(?:%|kg|gram|g|pcs|box|unit|hpa|mbar|°c|c|°e|e|°w|w|°n|n|°s|s|ton|meter|m|cm|mm|inch)\.?$', '', s, flags=re.IGNORECASE).strip()

        # If it has both dot and comma
        if '.' in s and ',' in s:
            if s.rfind('.') < s.rfind(','):
                # Indonesian style: 1.234,56 -> 1234.56
                s = s.replace('.', '').replace(',', '.')
            else:
                # English style: 1,234.56 -> 1234.56
                s = s.replace(',', '')
        elif ',' in s:
            if s.count(',') > 1:
                # Multiple commas: thousands separators
                s = s.replace(',', '')
            else:
                # Single comma
                parts = s.split(',')
                if len(parts) == 2 and len(parts[1]) == 3:
                    s = s.replace(',', '')
                else:
                    s = s.replace(',', '.')
        elif '.' in s:
            if s.count('.') > 1:
                # Multiple dots: thousands separators
                s = s.replace('.', '')
        
        if is_negative:
            s = '-' + s
        
        try:
            return float(s)
        except ValueError:
            return val
            
    return series.apply(clean_val)


def infer_and_clean_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Automatically infer types for object/string columns and clean/cast them.
    
    Tolerates diverse source formats (like dates, numbers with units) and heals them.
    """
    import re
    result = df.copy()
    
    # We only process 'object' and 'string' columns
    obj_cols = result.select_dtypes(include=["object", "string"]).columns
    
    for col in obj_cols:
        # Exclude metadata columns
        if col.startswith("_"):
            continue
            
        non_null_series = result[col].dropna()
        # Strip string values for better checking
        non_null_series = non_null_series.astype(str).str.strip()
        # Filter out empty and null-like strings ("null", "none", "nan", "")
        non_null_series = non_null_series[~non_null_series.str.lower().isin(["", "null", "none", "nan"])]
        
        n_total = len(non_null_series)
        if n_total == 0:
            # Schema Hardening: if the column is entirely null, try to infer its type from the name
            col_lower = str(col).lower()
            if any(x in col_lower for x in ["debit", "debet", "credit", "kredit", "balance", "saldo", "amount", "total", "nominal", "gaji", "price", "harga"]):
                result[col] = pd.to_numeric(result[col], errors="coerce")
                print(f"[SCHEMA-HARDEN] Hardened empty column '{col}' to NUMERIC")
            elif any(x in col_lower for x in ["date", "time", "timestamp", "tanggal"]):
                result[col] = pd.to_datetime(result[col], errors="coerce")
                print(f"[SCHEMA-HARDEN] Hardened empty column '{col}' to DATE/TIMESTAMP")
            continue
            
        # 1. Try Numeric detection & cleaning
        cleaned_numeric = to_numeric_clean(non_null_series)
        numeric_converted = pd.to_numeric(cleaned_numeric, errors="coerce")
        n_valid_numeric = numeric_converted.notna().sum()
        
        if n_total > 0 and (n_valid_numeric / n_total) >= 0.85:
            # More than 85% of values can be numeric. Clean and cast the entire column!
            col_lower = col.lower()
            is_debit_credit = any(k in col_lower for k in ["debit", "debet", "credit", "kredit"])
            
            raw_cleaned = to_numeric_clean(result[col])
            if is_debit_credit:
                result[col] = pd.to_numeric(raw_cleaned, errors="coerce").fillna(0.0)
            else:
                result[col] = pd.to_numeric(raw_cleaned, errors="coerce")
                
            print(f"[AUTO-INFER] Converted column '{col}' to NUMERIC")
            continue
            
        # 2. Try Date detection & cleaning
        date_pattern = re.compile(r'[-/.]|[a-zA-Z]{3,}', re.IGNORECASE)
        
        # Check a sample of values to see if they fit the pattern
        sample_vals = non_null_series.head(50)
        pattern_matches = sample_vals.apply(lambda x: bool(date_pattern.search(x) and len(x) >= 5 and not x.isdigit()))
        
        if len(sample_vals) > 0 and (pattern_matches.sum() / len(sample_vals)) >= 0.80:
            # Try parsing the sample element-by-element to handle mixed date formats correctly
            parsed_sample = sample_vals.apply(lambda x: pd.to_datetime(x, errors="coerce", dayfirst=True))
            n_valid_dates = parsed_sample.notna().sum()
            
            if n_valid_dates / len(sample_vals) >= 0.85:
                # More than 85% of sample values can be parsed as dates. Cast the entire column!
                def parse_date_element(x):
                    if pd.isna(x) or str(x).strip() == "" or str(x).strip().lower() == "null":
                        return pd.NaT
                    try:
                        dt = pd.to_datetime(x, dayfirst=True)
                        if dt.tzinfo is not None:
                            import datetime
                            local_tz = datetime.datetime.now().astimezone().tzinfo
                            dt = dt.tz_convert(local_tz).tz_localize(None)
                        return dt
                    except Exception:
                        return pd.NaT
                        
                result[col] = result[col].apply(parse_date_element)
                print(f"[AUTO-INFER] Converted column '{col}' to DATE/TIMESTAMP")
                continue
                
    return result


def translate_format(fmt: str) -> str:
    """Translate user-friendly date format to Python strftime format (case-insensitive for tokens)."""
    if not fmt:
        return None
    fmt = fmt.strip().strip('"').strip("'")
    
    t = fmt
    import re
    # Year: YYYY -> %Y, YY -> %y
    t = re.sub(r'yyyy', '%Y', t, flags=re.IGNORECASE)
    t = re.sub(r'\byy\b', '%y', t, flags=re.IGNORECASE)
    t = t.replace('YY', '%y').replace('yy', '%y')
    
    # Day: DD -> %d, dd -> %d
    t = re.sub(r'dd', '%d', t, flags=re.IGNORECASE)
    
    # Month vs Minute:
    # If there is no HH/hh in the format, 'mm' is treated as month.
    has_time = 'hh' in t.lower() or 'ss' in t.lower()
    if not has_time:
        t = re.sub(r'mm', '%m', t, flags=re.IGNORECASE)
    else:
        # Case-sensitive replace: MM for month, mm for minute
        t = t.replace('MM', '%m')
        t = t.replace('mm', '%M')
        
    # Hour: HH -> %H, hh -> %H
    t = re.sub(r'hh', '%H', t, flags=re.IGNORECASE)
    return t


def find_column_robust(df: pd.DataFrame, col_name: str) -> str | None:
    """Find column name in DataFrame with case-insensitive and underscore/space-insensitive matching."""
    if not col_name:
        return None
    if col_name in df.columns:
        return col_name
    
    # Normalize input: lowercase, replace underscores with spaces, strip spaces
    norm_input = col_name.lower().replace("_", " ").replace(" ", "").strip()
    
    for col in df.columns:
        norm_col = str(col).lower().replace("_", " ").replace(" ", "").strip()
        if norm_col == norm_input:
            return col
            
    # Substring fallback (e.g. "Debit" matches "Debit (IDR)")
    for col in df.columns:
        col_str = str(col).lower()
        if norm_input in col_str or col_str in norm_input:
            return col
            
    return None



def load_source(source: dict) -> pd.DataFrame:
    """Load CSV or Excel file from uploads directory with delimiter and encoding fallback detection."""
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
        # CSV automatic delimiter detection and encoding fallback
        try:
            df = pd.read_csv(file_path, sep=None, engine='python', encoding='utf-8')
        except Exception:
            try:
                df = pd.read_csv(file_path, sep=None, engine='python', encoding='latin1')
            except Exception as e:
                # Last resort fallback: standard comma delimiter
                print(f"[SOURCE] Automatic parsing failed ({e}), falling back to standard encoding & separator")
                df = pd.read_csv(file_path, encoding='utf-8', errors='ignore')

    print(f"[SOURCE] Loaded {len(df)} rows, {len(df.columns)} columns")
    return df



def load_lakehouse_source(source: dict) -> pd.DataFrame:
    """Load data from an existing lakehouse table (bronze/silver/gold).
    
    Uses chunked reading via pandas read_sql to avoid loading entire tables
    into memory at once (prevents OOM for large tables).
    """
    table_name = source.get("sourceTable", "")
    source_layer = sanitize_layer(source.get("sourceLayer", "BRONZE"))

    if not table_name:
        raise ValueError("No sourceTable in lakehouse source config")

    safe_table = sanitize_identifier(table_name)
    engine = get_engine()
    full_table = f'{source_layer}."{safe_table}"'

    print(f"[SOURCE] Loading lakehouse table: {full_table}")

    # Use chunked reading to prevent OOM on large tables
    CHUNK_SIZE = 50_000
    chunks = []
    query = text(f'SELECT * FROM {full_table}')
    
    with engine.connect() as conn:
        for chunk in pd.read_sql(query, conn, chunksize=CHUNK_SIZE):
            chunks.append(chunk)
            print(f"[SOURCE] ... loaded chunk: {len(chunk)} rows")

    if not chunks:
        # Empty table — get columns from metadata
        with engine.connect() as conn:
            result = conn.execute(query)
            columns = list(result.keys())
        df = pd.DataFrame(columns=columns)
    else:
        df = pd.concat(chunks, ignore_index=True)

    print(f"[SOURCE] Loaded {len(df)} rows, {len(df.columns)} columns from {source_layer}")
    return df


def step_clean(df: pd.DataFrame, config: dict) -> pd.DataFrame:
    """Clean data: strip whitespace, deduplicate, fill nulls."""
    result = df.copy()
    rows_before = len(result)

    if config.get("stripWhitespace"):
        for col in result.select_dtypes(include=["object", "string"]).columns:
            result[col] = result[col].str.strip()
        print("[CLEAN] Stripped whitespace")

    # Run automatic type inference & auto-healing by default
    if config.get("autoTypeInference", True):
        result = infer_and_clean_columns(result)

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
                r = {"type": "DATE", "column": rule_parts[0], "format": None, "locale": None}
                for p in rule_parts[1:]:
                    if p.startswith("format="):
                        r["format"] = p.split("format=", 1)[1]
                    elif p.startswith("locale="):
                        r["locale"] = p.split("locale=", 1)[1]
                    elif "=" not in p:
                        r["format"] = p
                parsed_rules.append(r)
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
            elif rule_type.upper() == "OUTLIER" and rule_parts:
                r = {"type": "OUTLIER", "column": rule_parts[0], "method": "iqr", "threshold": 3.0}
                for p in rule_parts[1:]:
                    if "=" in p:
                        k, v = p.split("=")
                        k = k.strip().lower()
                        if k == "method":
                            r["method"] = v.strip().lower()
                        elif k == "threshold":
                            r["threshold"] = float(v.strip())
                parsed_rules.append(r)
    elif isinstance(rules_raw, list):
        parsed_rules = rules_raw
    
    mode = config.get("validationMode", "flag")
    if config.get("_source_category") == "Keuangan / Finance":
        print("[VALIDATE] Financial dataset detected: forcing 'flag' mode (no rows dropped for audit integrity)")
        mode = "flag"
    issues = pd.Series([[] for _ in range(len(result))], index=result.index)
    drop_mask = pd.Series(False, index=result.index)
    
    for rule in parsed_rules:
        rule_type = rule.get("type", "").upper()
        
        if rule_type == "NOT_NULL":
            col = find_column_robust(result, rule.get("column", ""))
            if col:
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
            col1 = find_column_robust(result, rule.get("col1", ""))
            col2 = find_column_robust(result, rule.get("col2", ""))
            tol = rule.get("tolerance", 0)
            if col1 and col2:
                # Convert to numeric safely using clean_numeric helper and fill null with 0
                a = pd.to_numeric(to_numeric_clean(result[col1]), errors="coerce").fillna(0.0)
                b = pd.to_numeric(to_numeric_clean(result[col2]), errors="coerce").fillna(0.0)
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
            col = find_column_robust(result, rule.get("column", ""))
            if col:
                was_not_null = df[col].notna() & (df[col].astype(str).str.strip() != "")
                cleaned_nums = to_numeric_clean(result[col])
                
                # Heuristic: for debit/credit columns, fill null/NaN with 0.0
                col_lower = col.lower()
                is_debit_credit = any(k in col_lower for k in ["debit", "debet", "credit", "kredit"])
                if is_debit_credit:
                    result[col] = pd.to_numeric(cleaned_nums, errors="coerce").fillna(0.0)
                else:
                    result[col] = pd.to_numeric(cleaned_nums, errors="coerce")
                    
                invalid_mask = was_not_null & result[col].isna()
                count = invalid_mask.sum()
                if count > 0:
                    if mode == "drop":
                        drop_mask |= invalid_mask
                    else:
                        for idx in result[invalid_mask].index:
                            issues[idx].append(f"Invalid number in {col}")
                    print(f"[VALIDATE] {count} rows with invalid number in '{col}' {'dropped' if mode=='drop' else 'flagged'}")

                min_val = rule.get("min")
                max_val = rule.get("max")
                if min_val is not None:
                    mask = result[col] < min_val
                    if mask.sum():
                        if mode == "drop":
                            drop_mask |= mask
                        else:
                            for idx in result[mask].index:
                                issues[idx].append(f"{col} < {min_val}")
                        print(f"[VALIDATE] {mask.sum()} rows where {col} < {min_val} {'dropped' if mode=='drop' else 'flagged'}")
                if max_val is not None:
                    mask = result[col] > max_val
                    if mask.sum():
                        if mode == "drop":
                            drop_mask |= mask
                        else:
                            for idx in result[mask].index:
                                issues[idx].append(f"{col} > {max_val}")
                        print(f"[VALIDATE] {mask.sum()} rows where {col} > {max_val} {'dropped' if mode=='drop' else 'flagged'}")
        
        elif rule_type == "DATE":
            col = find_column_robust(result, rule.get("column", ""))
            if col:
                import datetime
                was_not_null = df[col].notna() & (df[col].astype(str).str.strip() != "")
                
                fmt_str = rule.get("format")
                py_format = None
                if fmt_str:
                    if "format=" in fmt_str:
                        fmt_str = fmt_str.split("format=", 1)[1]
                    py_format = translate_format(fmt_str)

                locale = rule.get("locale")
                day_first = True
                if locale == "US":
                    day_first = False

                def parse_date_element(x):
                    if pd.isna(x) or str(x).strip() == "" or str(x).strip().lower() == "null":
                        return pd.NaT
                    try:
                        if py_format:
                            dt = pd.to_datetime(x, format=py_format)
                        else:
                            dt = pd.to_datetime(x, dayfirst=day_first)
                            
                        if dt.tzinfo is not None:
                            local_tz = datetime.datetime.now().astimezone().tzinfo
                            dt = dt.tz_convert(local_tz).tz_localize(None)
                        return dt
                    except Exception:
                        return pd.NaT

                result[col] = result[col].apply(parse_date_element)
                invalid_mask = was_not_null & result[col].isna()
                count = invalid_mask.sum()
                if count > 0:
                    if mode == "drop":
                        drop_mask |= invalid_mask
                    else:
                        for idx in result[invalid_mask].index:
                            issues[idx].append(f"Invalid date format in {col}")
                    print(f"[VALIDATE] {count} rows with invalid date in '{col}' {'dropped' if mode=='drop' else 'flagged'}")

        elif rule_type == "UNIQUE":
            col = find_column_robust(result, rule.get("column", ""))
            if col:
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
            col = find_column_robust(result, rule.get("column", ""))
            pattern = rule.get("pattern", "")
            if col:
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
            col = find_column_robust(result, rule.get("column", ""))
            values = rule.get("values", [])
            if col and values:
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

        elif rule_type == "OUTLIER":
            col = find_column_robust(result, rule.get("column", ""))
            if col:
                raw_series = result[col]
                if not pd.api.types.is_numeric_dtype(raw_series):
                    raw_series = pd.to_numeric(to_numeric_clean(raw_series), errors="coerce")
                
                non_null_vals = raw_series.dropna()
                
                if len(non_null_vals) >= 15:
                    method = rule.get("method", "iqr")
                    threshold = rule.get("threshold", 3.0)
                    
                    outlier_mask = pd.Series(False, index=result.index)
                    
                    if method == "zscore":
                        mean = non_null_vals.mean()
                        std = non_null_vals.std()
                        if std > 0:
                            z_scores = (raw_series - mean).abs() / std
                            outlier_mask = z_scores > threshold
                    else: # iqr
                        q1 = non_null_vals.quantile(0.25)
                        q3 = non_null_vals.quantile(0.75)
                        iqr = q3 - q1
                        if iqr > 0:
                            lower_bound = q1 - 1.5 * iqr
                            upper_bound = q3 + 1.5 * iqr
                            outlier_mask = (raw_series < lower_bound) | (raw_series > upper_bound)
                    
                    outlier_mask = outlier_mask.fillna(False)
                    count = outlier_mask.sum()
                    if count > 0:
                        if mode == "drop":
                            drop_mask |= outlier_mask
                        else:
                            for idx in result[outlier_mask].index:
                                val = result.at[idx, col]
                                issues[idx].append(f"Outlier {col}: '{val}'")
                        print(f"[VALIDATE] {count} rows flagged as outliers in '{col}' using {method.upper()} method")


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
    schema = sanitize_layer(layer)
    with engine.connect() as conn:
        conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {schema}"))
        conn.commit()
    print(f"[DB] Ensured schema '{schema}' exists")


def write_output(df: pd.DataFrame, config: dict, pipeline_context: dict | None = None):
    """Write DataFrame to PostgreSQL lakehouse layer using psycopg2 directly.
    
    Improvements:
    - Transactional: writes to temp table, then renames/merges atomically
    - Backup: for 'overwrite', renames old table to {table}__bak_{timestamp}
    - SQL injection safe: all identifiers sanitized
    - Data lineage: auto-adds _etl_timestamp and _pipeline_run_id columns
    - Incremental Load: supports 'overwrite', 'append', and 'upsert' modes
    """
    import psycopg2
    import psycopg2.extras as extras
    import math

    # Extract layer and table name with robust fallbacks
    step_cfg = config.get("config", {}) if isinstance(config.get("config"), dict) else {}
    layer = sanitize_layer(
        config.get("outputLayer") or step_cfg.get("outputLayer") or step_cfg.get("layer") or "SILVER"
    )
    table = sanitize_identifier(
        config.get("outputTable") or step_cfg.get("outputTable") or step_cfg.get("tableName") or "output"
    ).lower()
    
    write_mode = (config.get("writeMode") or step_cfg.get("writeMode") or "overwrite").lower().strip()
    primary_key_raw = config.get("primaryKey") or step_cfg.get("primaryKey") or ""
    
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        raise RuntimeError("DATABASE_URL not set")

    # Add data lineage columns
    df_out = df.copy()
    now_ts = datetime.now(timezone.utc)
    df_out["_etl_timestamp"] = now_ts
    if pipeline_context:
        df_out["_pipeline_run_id"] = pipeline_context.get("run_id", 0)
        df_out["_source_pipeline_id"] = pipeline_context.get("pipeline_id", 0)

    # Sanitize and parse primary key columns
    pk_cols = []
    if primary_key_raw:
        if isinstance(primary_key_raw, list):
            pk_cols = [sanitize_identifier(str(k)).lower() for k in primary_key_raw if k]
        else:
            pk_cols = [sanitize_identifier(k.strip()).lower() for k in str(primary_key_raw).split(",") if k.strip()]

    conn = psycopg2.connect(db_url)
    try:
        # Use autocommit only for schema creation
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute(f"CREATE SCHEMA IF NOT EXISTS {layer}")
        cur.close()

        # Switch to transactional mode for the actual data write
        conn.autocommit = False
        cur = conn.cursor()

        full_table = f'{layer}."{table}"'
        temp_table_name = f"{table}__tmp_{int(now_ts.timestamp())}"
        temp_full_table = f'{layer}."{temp_table_name}"'
        backup_table_name = f"{table}__bak_{now_ts.strftime('%Y%m%d%H%M%S')}"
        backup_full_table = f'{layer}."{backup_table_name}"'

        # Check if original table exists
        cur.execute(
            "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = %s AND table_name = %s)",
            (layer, table)
        )
        table_exists = cur.fetchone()[0]

        # Determine column types from pandas dtypes with schema hardening overrides
        col_defs = []
        col_type_map = {}
        for col in df_out.columns:
            dtype = str(df_out[col].dtype)
            col_lower = str(col).lower()
            
            if "int" in dtype:
                pg_type = "BIGINT"
            elif "float" in dtype:
                pg_type = "DOUBLE PRECISION"
            elif "datetime" in dtype:
                pg_type = "TIMESTAMP"
            else:
                # Schema hardening: force TEXT/object columns to correct PostgreSQL type if their names match patterns
                if any(x in col_lower for x in ["debit", "debet", "credit", "kredit", "balance", "saldo", "amount", "total", "nominal", "gaji", "price", "harga"]):
                    pg_type = "DOUBLE PRECISION"
                    # Clean and convert the column values in df_out to numeric safely
                    raw_cleaned = to_numeric_clean(df_out[col])
                    df_out[col] = pd.to_numeric(raw_cleaned, errors="coerce")
                elif any(x in col_lower for x in ["date", "time", "timestamp", "tanggal"]):
                    pg_type = "TIMESTAMP"
                    # Clean and convert the column values in df_out to datetime safely
                    def parse_date_element(x):
                        if pd.isna(x) or str(x).strip() == "" or str(x).strip().lower() == "null":
                            return pd.NaT
                        try:
                            return pd.to_datetime(x, dayfirst=True)
                        except Exception:
                            return pd.NaT
                    df_out[col] = df_out[col].apply(parse_date_element)
                else:
                    pg_type = "TEXT"
            
            sanitized_col_name = sanitize_identifier(str(col))
            col_type_map[sanitized_col_name] = pg_type
            col_defs.append(f'"{sanitized_col_name}" {pg_type}')

        # Perform Schema Evolution for append/upsert if original table exists
        if table_exists and write_mode != "overwrite":
            cur.execute(
                "SELECT column_name FROM information_schema.columns WHERE table_schema = %s AND table_name = %s",
                (layer, table)
            )
            existing_cols = {row[0].lower() for row in cur.fetchall()}
            for col_name_sanitized, pg_type in col_type_map.items():
                if col_name_sanitized.lower() not in existing_cols:
                    alter_sql = f'ALTER TABLE {full_table} ADD COLUMN "{col_name_sanitized}" {pg_type}'
                    print(f"[SCHEMA-EVOLUTION] Adding missing column '{col_name_sanitized}' ({pg_type}) to {full_table}")
                    cur.execute(alter_sql)

        # 1. Create target/temp table if needed
        if write_mode == "overwrite" or not table_exists:
            # For overwrite or new table, create a clean table
            cur.execute(f"DROP TABLE IF EXISTS {temp_full_table}")
            
            # If upsert mode on a new table, define the Primary Key constraint
            if write_mode == "upsert" and pk_cols:
                # Filter out any primary key columns that don't exist in the data
                valid_pk_cols = [f'"{k}"' for k in pk_cols if k in [c.lower() for c in df_out.columns]]
                if valid_pk_cols:
                    create_sql = f"CREATE TABLE {temp_full_table} ({', '.join(col_defs)}, PRIMARY KEY ({', '.join(valid_pk_cols)}))"
                else:
                    create_sql = f"CREATE TABLE {temp_full_table} ({', '.join(col_defs)})"
            else:
                create_sql = f"CREATE TABLE {temp_full_table} ({', '.join(col_defs)})"
                
            cur.execute(create_sql)
        else:
            # Table exists and we are in append/upsert mode: create temp staging table without constraints
            cur.execute(f"DROP TABLE IF EXISTS {temp_full_table}")
            create_sql = f"CREATE TABLE {temp_full_table} ({', '.join(col_defs)})"
            cur.execute(create_sql)


        # 2. Insert data into temp table in batches
        columns = [f'"{sanitize_identifier(str(c))}"' for c in df_out.columns]
        placeholders = ",".join(["%s"] * len(columns))
        insert_sql = f"INSERT INTO {temp_full_table} ({', '.join(columns)}) VALUES ({placeholders})"

        def sanitize_val(val):
            if pd.isna(val):
                return None
            if isinstance(val, float) and math.isnan(val):
                return None
            if isinstance(val, pd.Timestamp):
                return val.to_pydatetime()
            return val

        rows = []
        for row in df_out.itertuples(index=False, name=None):
            rows.append(tuple(sanitize_val(x) for x in row))

        extras.execute_batch(cur, insert_sql, rows, page_size=1000)

        # 3. Apply changes from temp table to target table based on write_mode
        if write_mode == "overwrite":
            if table_exists:
                # Rename old table to backup
                cur.execute(f"ALTER TABLE {full_table} RENAME TO \"{backup_table_name}\"")
                print(f"[OUTPUT] Backed up existing table to {backup_full_table}")

            # Rename temp table to final
            cur.execute(f"ALTER TABLE {temp_full_table} RENAME TO \"{table}\"")

            # Cleanup old backups (keep last 3, drop anything older)
            cur.execute(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = %s AND table_name LIKE %s "
                "ORDER BY table_name DESC",
                (layer, f"{table}__bak_%")
            )
            old_backups = [row[0] for row in cur.fetchall()]
            for old_bak in old_backups[3:]:
                try:
                    cur.execute(f'DROP TABLE IF EXISTS {layer}."{sanitize_identifier(old_bak)}"')
                    print(f"[OUTPUT] Cleaned up old backup: {old_bak}")
                except Exception:
                    pass  # Non-critical

        elif write_mode == "append":
            if not table_exists:
                # Temp table is the new table, just rename it
                cur.execute(f"ALTER TABLE {temp_full_table} RENAME TO \"{table}\"")
            else:
                # Append rows from temp table to target table
                cols_str = ", ".join(columns)
                cur.execute(f"INSERT INTO {full_table} ({cols_str}) SELECT {cols_str} FROM {temp_full_table}")
                cur.execute(f"DROP TABLE IF EXISTS {temp_full_table}")

        elif write_mode == "upsert":
            if not table_exists:
                # Temp table has the PK constraint and is the new table, just rename it
                cur.execute(f"ALTER TABLE {temp_full_table} RENAME TO \"{table}\"")
            else:
                # Upsert using ON CONFLICT DO UPDATE
                # Find matching primary key columns in the target table columns
                valid_pk_cols = [k for k in pk_cols if k in [c.lower() for c in df_out.columns]]
                
                if not valid_pk_cols:
                    # Fallback to append if no primary key columns match
                    print("[OUTPUT] WARNING: Upsert requested but no valid primary key columns found. Falling back to append.")
                    cols_str = ", ".join(columns)
                    cur.execute(f"INSERT INTO {full_table} ({cols_str}) SELECT {cols_str} FROM {temp_full_table}")
                else:
                    # Construct ON CONFLICT clause
                    conflict_target = ", ".join([f'"{k}"' for k in valid_pk_cols])
                    
                    # Update all columns except the primary keys
                    update_cols = [c for c in df_out.columns if sanitize_identifier(str(c)).lower() not in valid_pk_cols]
                    update_clause = ", ".join([f'"{sanitize_identifier(str(c))}" = EXCLUDED."{sanitize_identifier(str(c))}"' for c in update_cols])
                    
                    cols_str = ", ".join(columns)
                    if update_clause:
                        upsert_sql = f"""
                            INSERT INTO {full_table} ({cols_str}) 
                            SELECT {cols_str} FROM {temp_full_table}
                            ON CONFLICT ({conflict_target}) 
                            DO UPDATE SET {update_clause}
                        """
                    else:
                        # Nothing to update if all columns are primary keys
                        upsert_sql = f"""
                            INSERT INTO {full_table} ({cols_str}) 
                            SELECT {cols_str} FROM {temp_full_table}
                            ON CONFLICT ({conflict_target}) 
                            DO NOTHING
                        """
                    cur.execute(upsert_sql)
                
                cur.execute(f"DROP TABLE IF EXISTS {temp_full_table}")

        conn.commit()
        cur.close()
        print(f"[OUTPUT] Wrote {len(df)} rows to {full_table} (mode={write_mode})")
        return len(df)

    except Exception as e:
        conn.rollback()
        print(f"[OUTPUT] ERROR: Transaction rolled back: {e}")
        raise
    finally:
        conn.close()


def ingest_csv_to_bronze(file_path: str, source_id: int, file_size: int | None = None) -> tuple[str, int, list[dict]]:
    """Ingest a CSV/Excel file into the Bronze layer.
    
    This ensures all data sources go through Bronze first, maintaining
    lakehouse architecture consistency.
    
    Returns: (bronze_table_name, row_count, column_metadata)
    """
    import psycopg2
    import psycopg2.extras as extras

    source = {"filePath": file_path, "fileSize": file_size}
    df = load_source(source)
    
    if df.empty:
        print("[BRONZE] No data to ingest")
        return "", 0, []

    # Generate bronze table name
    table_name = f"csv_{source_id}"
    
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        raise RuntimeError("DATABASE_URL not set")

    conn = psycopg2.connect(db_url)
    try:
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute("CREATE SCHEMA IF NOT EXISTS bronze")

        full_table = f'bronze."{table_name}"'
        
        # All columns stored as TEXT in bronze (raw layer)
        col_defs = [f'"{sanitize_identifier(str(col))}" TEXT' for col in df.columns]
        col_defs.append('"_ingested_at" TIMESTAMPTZ DEFAULT NOW()')
        col_defs.append(f'"_source_id" INTEGER DEFAULT {int(source_id)}')
        
        # Truncate if exists, create if not
        cur.execute(f"DROP TABLE IF EXISTS {full_table}")
        cur.execute(f"CREATE TABLE {full_table} ({', '.join(col_defs)})")

        # Insert all rows as text
        columns = [f'"{sanitize_identifier(str(c))}"' for c in df.columns]
        placeholders = ",".join(["%s"] * len(columns))
        insert_sql = f"INSERT INTO {full_table} ({', '.join(columns)}) VALUES ({placeholders})"

        rows = []
        for row in df.itertuples(index=False, name=None):
            vals = []
            for v in row:
                if pd.isna(v):
                    vals.append(None)
                else:
                    vals.append(str(v))
            rows.append(tuple(vals))

        extras.execute_batch(cur, insert_sql, rows, page_size=1000)
        cur.close()
    finally:
        conn.close()

    column_metadata = [{"name": str(col), "type": "TEXT"} for col in df.columns]
    print(f"[BRONZE] Ingested {len(df)} rows to bronze.\"{table_name}\"")
    return table_name, len(df), column_metadata


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
    """Execute pipeline steps sequentially.
    
    Improvements:
    - Step-level error handling with detailed context
    - Pipeline context passed for data lineage tracking
    - WS error reporting per step
    """
    with open(config_path) as f:
        pipeline = json.load(f)

    run_id = pipeline.get("runId", 0)
    pipeline_id = pipeline.get("pipelineId", 0)

    # Pipeline context for data lineage
    pipeline_context = {
        "run_id": run_id,
        "pipeline_id": pipeline_id,
    }

    # Import WS reporter lazily (optional)
    try:
        from ws_reporter import report as ws_report
    except ImportError:
        ws_report = None

    print(f"=== Gaung ETL Worker ===")
    print(f"Pipeline: {pipeline_id}, Run: {run_id}")

    source_data = pipeline.get("source", {})
    steps = sorted(pipeline.get("steps", []), key=lambda s: s["order"])

    df: pd.DataFrame | None = None
    rows_output = 0
    column_metadata: list[dict] = []
    outputs: list[dict] = []  # metadata for each OUTPUT step
    step_errors: list[dict] = []  # track per-step errors

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

        try:
            if step_type == "SOURCE":
                df = step_source(None, config, source_data)

            elif step_type == "OUTPUT":
                if df is None:
                    print("[OUTPUT] No data to write, skipping")
                    continue
                # Collect column metadata BEFORE lineage columns are added
                cols = [{"name": str(col), "type": dtype_to_sql(df[col].dtype)} for col in df.columns]
                layer = sanitize_layer(step.get("outputLayer") or config.get("outputLayer") or "SILVER")
                table = sanitize_identifier(
                    step.get("outputTable") or config.get("outputTable") or "output"
                ).lower()
                nrows = write_output(df, step, pipeline_context)
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
                    if step_type == "VALIDATE":
                        config = config.copy()
                        config["_source_category"] = source_data.get("category")
                    df = handler(df, config)
                else:
                    print(f"[{step_type}] Unknown step type, skipping")

        except Exception as e:
            error_msg = f"Step {i+1}/{total_steps} ({step_type}) failed: {e}"
            print(f"[ERROR] {error_msg}")
            step_errors.append({
                "step": i + 1,
                "type": step_type,
                "error": str(e),
            })
            # Report error via WebSocket
            if ws_report:
                try:
                    ws_report(run_id, "step_error", {
                        "step": i + 1,
                        "total": total_steps,
                        "type": step_type,
                        "error": str(e),
                    })
                except Exception:
                    pass
            # For SOURCE and OUTPUT errors, abort the pipeline
            if step_type in ("SOURCE", "OUTPUT"):
                raise RuntimeError(error_msg) from e
            # For transformation step errors, log and continue with previous df
            print(f"[{step_type}] Continuing pipeline with data from previous step...")

    # Report completion via WebSocket
    if ws_report:
        try:
            ws_report(run_id, "complete", {
                "rows": rows_output,
                "outputs": outputs,
                "progress": 100,
                "errors": step_errors,
            })
        except Exception:
            pass

    result = {"rows": rows_output, "columns": column_metadata, "outputs": outputs}
    if step_errors:
        result["step_errors"] = step_errors
    print(f"\n=== Pipeline Complete === rows={rows_output}" + 
          (f" (with {len(step_errors)} step error(s))" if step_errors else ""))
    return result


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 etl_runner.py <config.json>")
        sys.exit(1)

    config_path = sys.argv[1]
    result = run_pipeline(config_path)
    print(json.dumps(result))
