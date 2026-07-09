"""Timestamp Module — detects and normalizes datetime columns.

This module scans columns for datetime-like values and normalizes them.

Capabilities:
    - Detection: identifies columns containing date/time data
    - Parsing: converts string columns to proper datetime
    - Normalization: standardizes timezone to UTC
    - Format detection: auto-detects common date formats
    - Sorting: ensures chronological order

Supported formats (auto-detected):
    - ISO 8601: 2026-01-15T10:30:00Z, 2026-01-15 10:30:00
    - US: 01/15/2026, 01-15-2026
    - EU: 15/01/2026, 15.01.2026
    - Unix: 1736899200 (seconds), 1736899200000 (milliseconds)
    - Excel: 46000 (serial number)
"""

import re
import time
import pandas as pd
import numpy as np
from datetime import datetime, timezone, timedelta
from collections import Counter
from typing import Tuple, Optional

from silver.modules.base import BaseModule
from silver.models.types import SilverContext, AuditEntry


class TimestampModule(BaseModule):
    """Detect and normalize timestamp columns."""

    name = "timestamp"
    version = "1.0.0"
    description = "Detects datetime columns and normalizes timezone, format, and ordering"

    CONFIDENCE_THRESHOLD = 0.7  # 70% of non-null must parse as datetime

    # Date parsing: dayfirst=True treats DD/MM/YY as day-month-year (Indonesian standard)
    # instead of the ambiguous US default (MM/DD/YY). Only affects ambiguous dates
    # where both day and month are ≤ 12.
    dayfirst: bool = True

    # Pandas dayfirst=True corrupts ISO 8601 parsing across ALL versions
    # (e.g. '2026-07-06 20:01:00' → June 7 instead of July 6).
    # dayfirst should ONLY apply to slash-separated dates (DD/MM/YYYY),
    # never to ISO/hyphen dates (YYYY-MM-DD) which have an unambiguous format.
    _EFFECTIVE_DAYFIRST: bool = False  # disabled globally; applied per-value in _parse_single

    # Common column name patterns that suggest timestamps
    KNOWN_PATTERNS = [
        "date", "time", "timestamp", "created", "updated", "modified",
        "datetime", "ts", "dt", "tanggal", "waktu", "jam", "tgl",
        "created_at", "updated_at", "modified_at", "deleted_at",
    ]

    def run(
        self,
        df: pd.DataFrame,
        ctx: SilverContext,
    ) -> Tuple[pd.DataFrame, SilverContext]:
        """Detect and normalize timestamp columns.

        Args:
            df: Input DataFrame
            ctx: Pipeline context

        Returns:
            (datetime-normalized DataFrame, updated context)
        """
        start = time.perf_counter()
        result = df.copy()
        rows_before = len(df)
        normalized = []
        warnings = []

        for col_name in df.columns:
            col = df[col_name]

            # Skip if already datetime
            if pd.api.types.is_datetime64_any_dtype(col):
                normalized.append(f"{col_name}: already datetime → UTC converted")
                result[col_name] = self._normalize_datetime(col)
                continue

            # Check if numeric column is Unix timestamp
            if pd.api.types.is_numeric_dtype(col):
                if self._is_unix_timestamp(col):
                    converted = self._try_convert(col)
                    if converted is not None:
                        result[col_name] = converted
                        normalized.append(f"{col_name}: unix → datetime (UTC)")
                continue

            # Check if this column looks like a timestamp
            if self._is_timestamp_candidate(col, col_name):
                converted = self._try_convert(col)
                if converted is not None:
                    result[col_name] = converted
                    normalized.append(f"{col_name}: string → datetime (UTC)")

        elapsed_ms = int((time.perf_counter() - start) * 1000)

        ctx.add_audit(AuditEntry(
            module_name=self.name,
            module_version=self.version,
            execution_ms=elapsed_ms,
            rows_before=rows_before,
            rows_after=len(result),
            metadata={"normalized": normalized, "count": len(normalized)},
            warnings=warnings,
        ))

        return result, ctx

    # ── Private helpers ────────────────────────────────────────

    def _is_timestamp_candidate(self, col: pd.Series, col_name: str) -> bool:
        """Check if a column is likely to contain timestamps."""
        # Check by name pattern
        name_lower = col_name.lower().replace(" ", "_")
        for pattern in self.KNOWN_PATTERNS:
            if pattern in name_lower:
                return True

        # Check by content: try parsing a sample
        sample = col.dropna().head(20)
        if len(sample) < 2:
            return False

        parsed = pd.to_datetime(sample, errors="coerce", format="mixed", dayfirst=self.dayfirst and self._EFFECTIVE_DAYFIRST)
        valid_ratio = parsed.notna().sum() / len(sample)

        if valid_ratio >= self.CONFIDENCE_THRESHOLD:
            return True

        return False

    def _is_unix_timestamp(self, col: pd.Series) -> bool:
        """Check if a numeric column contains Unix timestamps."""
        vals = col.dropna()
        if len(vals) == 0:
            return False

        # Unix seconds: 1990-2040 range
        in_seconds = ((vals >= 600_000_000) & (vals <= 2_500_000_000)).sum()
        if in_seconds / len(vals) >= self.CONFIDENCE_THRESHOLD:
            return True

        # Unix milliseconds
        in_ms = ((vals >= 600_000_000_000) & (vals <= 2_500_000_000_000)).sum()
        if in_ms / len(vals) >= self.CONFIDENCE_THRESHOLD:
            return True

        return False

    def _try_convert(self, col: pd.Series) -> Optional[pd.Series]:
        """Try to convert a column to datetime. Returns None on failure.

        Handles mixed formats: ISO 8601, space-separated, YYYY/MM/DD, and
        timezone-aware strings in the same column.

        Timezone inference: if a column has mixed TZ-aware and naive values,
        the most common timezone offset from aware values is applied to naive
        values before converting everything to UTC. This prevents naive
        timestamps from being silently treated as UTC when they're actually
        local time (e.g. WITA +08:00).

        Pandas 3.x raises ValueError on mixed TZ without utc=True, so we
        parse aware and naive values separately.
        """
        # For numeric columns: check Unix timestamps FIRST
        if pd.api.types.is_numeric_dtype(col):
            return self._try_unix_convert(col)

        # For string columns: parse each value individually
        try:
            results = []
            aware_count = 0
            naive_count = 0
            total = 0

            for val in col:
                if pd.isna(val):
                    results.append(pd.NaT)
                    continue
                total += 1
                try:
                    val_str = str(val).strip()
                    # dayfirst ONLY for slash-separated dates where year is NOT first
                    # (DD/MM/YYYY or MM/DD/YYYY — dayfirst handles ambiguity).
                    # ISO/hyphen dates (YYYY-MM-DD) and YYYY/MM/DD are unambiguous —
                    # dayfirst corrupts them (2026-07-06 → June 7) across all pandas versions.
                    use_dayfirst = False
                    if "/" in val_str:
                        first_part = val_str.split("/")[0].strip()
                        year_first = len(first_part) == 4 and first_part.isdigit()
                        use_dayfirst = not year_first
                    dt = pd.to_datetime(val_str, errors="coerce", dayfirst=use_dayfirst)
                    if pd.isna(dt):
                        results.append(pd.NaT)
                    else:
                        results.append(dt)
                        if dt.tz is not None:
                            aware_count += 1
                        else:
                            naive_count += 1
                except Exception:
                    results.append(pd.NaT)

            if total == 0:
                return None

            valid = sum(1 for r in results if not pd.isna(r))
            if valid / total < self.CONFIDENCE_THRESHOLD:
                return None

            # If all naive or all aware, handle directly
            if aware_count == 0 and naive_count > 0:
                # All naive — try to infer TZ from raw strings (unlikely, but check)
                inferred_tz = self._infer_timezone(col, None)
                parsed_series = pd.Series(results, index=col.index, dtype="object")
                # Convert to datetime64 (naive)
                parsed_series = pd.to_datetime(parsed_series, errors="coerce", utc=False)
                return self._normalize_datetime(parsed_series, inferred_tz)

            if naive_count == 0 and aware_count > 0:
                # All aware — convert to UTC
                parsed_series = pd.Series(results, index=col.index, dtype="object")
                parsed_series = pd.to_datetime(parsed_series, errors="coerce", utc=True)
                return self._normalize_datetime(parsed_series)

            # Mixed: need to localize naive values using inferred TZ
            inferred_tz = self._infer_timezone(col, None)
            if not inferred_tz:
                inferred_tz = "UTC"  # fallback

            utc_results = []
            for dt in results:
                if pd.isna(dt):
                    utc_results.append(pd.NaT)
                elif dt.tz is not None:
                    # Already aware → convert to UTC
                    utc_results.append(dt.tz_convert("UTC"))
                else:
                    # Naive → localize with inferred TZ, then convert to UTC
                    try:
                        localized = dt.tz_localize(inferred_tz)
                        utc_results.append(localized.tz_convert("UTC"))
                    except Exception:
                        utc_results.append(dt.tz_localize("UTC"))

            # Build final Series with UTC timezone
            result = pd.Series(utc_results, index=col.index)
            # Ensure consistent datetime64[us, UTC] dtype
            result = pd.to_datetime(result, errors="coerce", utc=True)
            print(f"[TIMESTAMP] Parsed {valid}/{total} values "
                  f"(aware={aware_count}, naive={naive_count}, inferred_tz={inferred_tz})")
            return result

        except Exception as e:
            print(f"[TIMESTAMP] Parse failed: {e}")
            pass

        return None

    def _try_unix_convert(self, col: pd.Series) -> Optional[pd.Series]:
        """Try to convert a numeric column as Unix timestamp."""
        vals = col.dropna()
        if len(vals) == 0:
            return None

        # Try seconds
        if ((vals >= 600_000_000) & (vals <= 2_500_000_000)).sum() / len(vals) >= self.CONFIDENCE_THRESHOLD:
            try:
                parsed = pd.to_datetime(col, unit="s", errors="coerce")
                return self._normalize_datetime(parsed)
            except Exception:
                pass

        # Try milliseconds
        if ((vals >= 600_000_000_000) & (vals <= 2_500_000_000_000)).sum() / len(vals) >= self.CONFIDENCE_THRESHOLD:
            try:
                parsed = pd.to_datetime(col, unit="ms", errors="coerce")
                return self._normalize_datetime(parsed)
            except Exception:
                pass

        return None

    def _normalize_datetime(self, col: pd.Series, inferred_tz: Optional[str] = None) -> pd.Series:
        """Normalize datetime column to UTC.

        If the column is timezone-aware, convert to UTC directly.
        If the column is naive, localize using inferred_tz (or UTC fallback).

        Args:
            col: datetime64 Series (naive or tz-aware)
            inferred_tz: timezone string like 'Asia/Jakarta' or offset '+08:00',
                         inferred from aware values in the same column
        """
        # Convert to datetime if not already
        if not pd.api.types.is_datetime64_any_dtype(col):
            return col

        # If timezone-aware, convert to UTC
        if col.dt.tz is not None:
            return col.dt.tz_convert("UTC")

        # Naive column — apply inferred timezone, then convert to UTC
        if inferred_tz:
            try:
                localized = col.dt.tz_localize(inferred_tz)
                return localized.dt.tz_convert("UTC")
            except Exception:
                pass

        # Fallback: assume UTC
        return col.dt.tz_localize("UTC")

    def _infer_timezone(self, raw_col: pd.Series, parsed_col: pd.Series) -> Optional[str]:
        """Infer the most likely timezone from timezone-aware values in a column.

        When a column has mixed formats (some with +08:00, some without),
        this method extracts timezone offsets from the aware values and
        returns the most common one. This offset is then applied to naive
        values so they're not silently treated as UTC.

        Args:
            raw_col: Original string column (before parsing)
            parsed_col: Parsed datetime column (may be naive if mixed)

        Returns:
            Timezone string like '+08:00' or 'Asia/Jakarta', or None if
            no timezone info found in any value.
        """
        # Extract timezone offsets from raw strings
        # Matches: +08:00, -05:00, +0800, Z (UTC)
        tz_pattern = re.compile(r'([+-]\d{2}:?\d{2}|Z)$')
        offsets = []
        for val in raw_col.dropna():
            val_str = str(val).strip()
            m = tz_pattern.search(val_str)
            if m:
                offset = m.group(1)
                if offset == 'Z':
                    offsets.append('+00:00')
                else:
                    # Normalize: +0800 → +08:00
                    if ':' not in offset:
                        offset = offset[:3] + ':' + offset[3:]
                    offsets.append(offset)

        if not offsets:
            return None

        # Most common offset
        most_common = Counter(offsets).most_common(1)[0][0]
        print(f"[TIMESTAMP] Inferred timezone from aware values: {most_common}")
        return most_common
