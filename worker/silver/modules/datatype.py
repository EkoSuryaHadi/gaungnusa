"""DataType Module — detects and corrects column data types.

This module scans each column and casts it to the most appropriate type:
    - Integer   → columns that look like whole numbers
    - Float     → columns that look like decimals
    - DateTime  → columns with date/time patterns
    - Boolean   → columns with true/false values
    - String    → everything else

Strategy:
    1. Try parsing as numeric first (most common in data pipelines)
    2. Try datetime second
    3. Try boolean third
    4. Fallback to string

The module is SAFE by default — it only casts when confident.
Columns that fail conversion keep their original type.
"""

import time
import pandas as pd
import numpy as np
from typing import Tuple

from silver.modules.base import BaseModule
from silver.models.types import SilverContext, AuditEntry


class DataTypeModule(BaseModule):
    """Detect and correct column data types automatically."""

    name = "datatype"
    version = "1.0.0"
    description = "Detects and casts columns to correct types — int, float, datetime, boolean, string"

    # Configuration
    CONFIDENCE_THRESHOLD = 0.8  # 80% of non-null values must match target type

    # Column name patterns that suggest timestamp — leave these to TimestampModule
    _TIMESTAMP_COLUMN_PATTERNS = [
        "date", "time", "timestamp", "created", "updated", "modified",
        "datetime", "ts", "dt", "tanggal", "waktu", "jam", "tgl",
        "created_at", "updated_at", "modified_at", "deleted_at",
    ]

    # Column name patterns that suggest scientific/sensor data — NOT financial.
    # For these columns, dots are ALWAYS decimal points, never thousand separators.
    # e.g. battery_v "3.700" = 3.7V, NOT 3700
    _SCIENTIFIC_COLUMN_PATTERNS = [
        "temp", "humidity", "vibration", "battery", "voltage", "current",
        "pressure", "ph", "flow", "speed", "rpm", "frequency", "power_factor",
        "latitude", "longitude", "altitude", "angle", "distance", "weight",
        "mass", "volume", "concentration", "density", "resistance", "capacitance",
        "signal", "rssi", "snr", "noise", "amplitude", "wavelength",
    ]

    BOOLEAN_VALUES = {
        "true": True, "false": False,
        "yes": True, "no": False,
        "y": True, "n": False,
        "1": True, "0": False,
        "on": True, "off": False,
        "active": True, "inactive": False,
    }

    def run(
        self,
        df: pd.DataFrame,
        ctx: SilverContext,
    ) -> Tuple[pd.DataFrame, SilverContext]:
        """Detect and cast column types.

        Args:
            df: Input DataFrame (may have incorrect dtypes)
            ctx: Pipeline context

        Returns:
            (type-corrected DataFrame, updated context)
        """
        start = time.perf_counter()
        result = df.copy()
        rows_before = len(df)
        changes = []

        for col_name in df.columns:
            col = df[col_name]
            new_col, detected_type = self._cast_column(col)

            if detected_type != self._current_type(col):
                result[col_name] = new_col
                changes.append(f"{col_name}: → {detected_type}")

        elapsed_ms = int((time.perf_counter() - start) * 1000)

        ctx.add_audit(AuditEntry(
            module_name=self.name,
            module_version=self.version,
            execution_ms=elapsed_ms,
            rows_before=rows_before,
            rows_after=len(result),
            metadata={"changes": changes, "count": len(changes)},
            warnings=[] if changes else ["No type changes needed"],
        ))

        return result, ctx

    # ── Private helpers ────────────────────────────────────────

    def _current_type(self, col: pd.Series) -> str:
        """Get current column type as string."""
        dtype = col.dtype
        if pd.api.types.is_integer_dtype(dtype):
            return "int"
        elif pd.api.types.is_float_dtype(dtype):
            return "float"
        elif pd.api.types.is_datetime64_any_dtype(dtype):
            return "datetime"
        elif pd.api.types.is_bool_dtype(dtype):
            return "bool"
        return "string"

    def _cast_column(self, col: pd.Series) -> Tuple[pd.Series, str]:
        """Attempt to cast a column to the most specific type.

        Priority: int → float → datetime → bool → string

        Returns:
            (cast column, detected type as string)
        """
        current = self._current_type(col)

        # Skip if already numeric/datetime/bool (already correct)
        if current in ("int", "float", "datetime", "bool"):
            return col, current

        # Only try casting for object/string columns
        non_null = col.dropna()
        if len(non_null) == 0:
            return col, current

        total = len(non_null)

        # ── Preprocess: strip formatting from numeric strings ──
        # Bank statements often have: "10,117,864" or "Rp 1.500.000" etc.
        # pd.to_numeric can't parse these; we strip commas, currency symbols,
        # and handle Indonesian thousand-separator dots.
        #
        # BUT: scientific/sensor columns (temperature, voltage, etc.) use dots
        # as decimal points, NOT thousand separators. Skip IDR heuristic for them.
        cleaned_col = col.astype(str).str.strip()

        name_lower = str(col.name).lower().replace(" ", "_")
        is_scientific = any(p in name_lower for p in self._SCIENTIFIC_COLUMN_PATTERNS)

        # Detect if values look like formatted numbers (contain commas or dots as separators)
        # Pattern: digits + commas/dots + digits
        sample_vals = cleaned_col[cleaned_col.notna()].head(20).tolist()
        has_formatting = any(
            isinstance(v, str) and ("," in v or ("." in v and v.replace(".", "").replace("-", "").isdigit()))
            for v in sample_vals
        )

        if has_formatting:
            # Remove currency prefixes (Rp, $, €, £, USD, IDR, etc.)
            cleaned_col = cleaned_col.str.replace(
                r'^(?:Rp|IDR|USD|EUR|GBP|JPY|\$|€|£|¥)\s*', '', regex=True, flags=2  # re.IGNORECASE
            )
            # Remove spaces after stripping currency
            cleaned_col = cleaned_col.str.strip()

            # Handle accounting negative notation: "(13,179,275.00)" → "-13179275.00"
            # Pattern: parentheses wrapping numeric content = negative value
            paren_mask = cleaned_col.str.match(r'^\([\d,.\)]+$')
            if paren_mask.any():
                cleaned_col[paren_mask] = (
                    '-' + cleaned_col[paren_mask].str.replace(r'[()]', '', regex=True)
                )

            # Strip common thousand-separator characters: comma, dot (ID format), space
            # But careful: "1.500" IDR style vs "1.5" decimal — we check context
            cleaned_col = cleaned_col.str.replace(r'[,\s]', '', regex=True)
            # Handle Indonesian dot-as-thousand-separator: "1.500.000" → "1500000"
            # Only strip dots if the string has multiple dots (thousand sep) or only digits around dots
            # This is tricky — let's be conservative: if after stripping commas, the value
            # looks like "1.500.000" (>=2 dots), strip all dots. If "1.5" (1 dot), keep as decimal.
            #
            # BUT skip this entirely for scientific columns (battery, voltage, temp, etc.)
            # where "3.700" = 3.7V, NOT 3700
            if not is_scientific:
                dot_count = cleaned_col.str.count(r'\.')
                mask_multi_dot = dot_count >= 2
                cleaned_col[mask_multi_dot] = cleaned_col[mask_multi_dot].str.replace('.', '', regex=False)
                # Handle single-dot IDR style: "5.000" = 5000 (dot + exactly 3 trailing digits = thousand sep)
                mask_single_dot_idr = (dot_count == 1) & cleaned_col.str.match(r'^\d+\.\d{3}$')
                cleaned_col[mask_single_dot_idr] = cleaned_col[mask_single_dot_idr].str.replace('.', '', regex=False)

        # 1. Try integer
        try:
            numeric = pd.to_numeric(cleaned_col, errors="coerce")
            integer_mask = numeric.notna() & (numeric % 1 == 0)
            if integer_mask.sum() / total >= self.CONFIDENCE_THRESHOLD:
                return numeric.astype("Int64"), "int"
        except Exception:
            pass

        # 2. Try float
        try:
            numeric = pd.to_numeric(cleaned_col, errors="coerce")
            if numeric.notna().sum() / total >= self.CONFIDENCE_THRESHOLD:
                return numeric.astype("float64"), "float"
        except Exception:
            pass

        # 3. Try datetime — but skip if column name looks like a timestamp.
        #    TimestampModule is the specialist; let it handle format diversity,
        #    timezone normalization, and mixed-format parsing.
        name_lower = col.name.lower().replace(" ", "_")
        is_timestamp_col = any(p in name_lower for p in self._TIMESTAMP_COLUMN_PATTERNS)

        if not is_timestamp_col:
            try:
                datetime_col = pd.to_datetime(col, errors="coerce", utc=True, format="mixed")
                if datetime_col.notna().sum() / total >= self.CONFIDENCE_THRESHOLD:
                    return datetime_col, "datetime"
            except Exception:
                pass

        # 4. Try boolean
        lower_vals = non_null.astype(str).str.lower().str.strip()
        bool_matches = lower_vals.isin(self.BOOLEAN_VALUES.keys())
        if bool_matches.sum() / total >= self.CONFIDENCE_THRESHOLD:
            mapped = lower_vals.map(self.BOOLEAN_VALUES)
            # Only apply if all non-null values were matched
            if mapped.notna().all():
                result = pd.Series(np.nan, index=col.index, dtype="boolean")
                result[col.notna()] = mapped.values
                return result, "bool"

        # 5. Fallback: keep as string
        return col, current
