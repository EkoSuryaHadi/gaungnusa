"""Profiling Module — generates comprehensive DataProfile from a DataFrame.

This is the first module in the Silver pipeline. It analyzes the raw data
and produces a DataProfile object that subsequent modules use for decision-making.

The profile includes:
    - Global stats: rows, columns, cells, memory
    - Per-column stats: dtype, nulls, uniques, min/max/mean/std
    - Type detection: numeric, datetime, categorical, boolean
    - Outlier detection: basic IQR-based outlier counting
    - Cardinality analysis: high-cardinality column detection

Performance:
    - O(n) where n = number of cells
    - Memory: copies column stats, not the data
    - For datasets > 100K rows, uses sampling for outlier detection
"""

import time
import pandas as pd
import numpy as np
from datetime import datetime
from typing import Tuple

from silver.modules.base import BaseModule
from silver.models.types import (
    SilverContext,
    DataProfile,
    ColumnStat,
    AuditEntry,
)


class ProfilingModule(BaseModule):
    """Generate a comprehensive data profile from an input DataFrame."""

    name = "profiling"
    version = "1.0.0"
    description = "Generates comprehensive data profile — rows, columns, types, nulls, uniques, outliers, memory"

    # Configuration
    OUTLIER_SAMPLE_THRESHOLD = 100_000  # Use sampling above this row count
    HIGH_CARDINALITY_THRESHOLD = 0.9    # >90% unique = high cardinality

    def run(
        self,
        df: pd.DataFrame,
        ctx: SilverContext,
    ) -> Tuple[pd.DataFrame, SilverContext]:
        """Profile the DataFrame and attach results to context.

        Args:
            df: Raw input DataFrame (unchanged)
            ctx: Pipeline context to update

        Returns:
            (unchanged df, updated ctx with profile)
        """
        start = time.perf_counter()
        rows_before = len(df)

        # ── Global stats ──────────────────────────────────────
        total_rows = len(df)
        total_columns = len(df.columns)
        total_cells = total_rows * total_columns
        memory_bytes = df.memory_usage(deep=True).sum()
        memory_mb = round(memory_bytes / (1024 * 1024), 2)

        # ── Missing cells ─────────────────────────────────────
        missing_cells = int(df.isna().sum().sum())
        missing_pct = round(missing_cells / total_cells * 100, 2) if total_cells > 0 else 0.0

        # ── Duplicate rows ──────────────────────────────────────
        duplicate_rows = int(df.duplicated().sum())
        duplicate_pct = round(duplicate_rows / total_rows * 100, 2) if total_rows > 0 else 0.0

        # ── Per-column stats ──────────────────────────────────
        column_stats = []
        total_outliers = 0

        for col_name in df.columns:
            col = df[col_name]
            stat = self._profile_column(col, col_name, total_rows)
            column_stats.append(stat)
            total_outliers += stat.outlier_count

        outlier_pct = round(total_outliers / total_cells * 100, 2) if total_cells > 0 else 0.0

        # ── Dtype summary ─────────────────────────────────────
        dtypes_summary = self._summarize_dtypes(df)

        # ── Build profile ─────────────────────────────────────
        elapsed_ms = int((time.perf_counter() - start) * 1000)

        profile = DataProfile(
            total_rows=total_rows,
            total_columns=total_columns,
            total_cells=total_cells,
            missing_cells=missing_cells,
            missing_pct=missing_pct,
            duplicate_rows=duplicate_rows,
            duplicate_pct=duplicate_pct,
            total_outliers=total_outliers,
            outlier_pct=outlier_pct,
            memory_bytes=memory_bytes,
            memory_mb=memory_mb,
            columns=column_stats,
            dtypes_summary=dtypes_summary,
            profiling_ms=elapsed_ms,
            profiled_at=datetime.utcnow(),
        )

        ctx.profile = profile

        # ── Audit ─────────────────────────────────────────────
        ctx.add_audit(AuditEntry(
            module_name=self.name,
            module_version=self.version,
            execution_ms=elapsed_ms,
            rows_before=rows_before,
            rows_after=rows_before,
            metadata={
                "columns": total_columns,
                "missing_pct": missing_pct,
                "duplicate_pct": duplicate_pct,
                "memory_mb": memory_mb,
            },
        ))

        return df, ctx

    # ── Private helpers ────────────────────────────────────────

    def _profile_column(self, col: pd.Series, name: str, total_rows: int) -> ColumnStat:
        """Profile a single column and return ColumnStat."""
        dtype_str = str(col.dtype)
        count = int(col.count())

        # Missing
        missing_count = int(col.isna().sum())
        missing_pct = round(missing_count / total_rows * 100, 2) if total_rows > 0 else 0.0

        # Unique
        unique_count = int(col.nunique())
        unique_pct = round(unique_count / total_rows * 100, 2) if total_rows > 0 else 0.0

        # Type detection
        is_numeric = pd.api.types.is_numeric_dtype(col)
        is_datetime = pd.api.types.is_datetime64_any_dtype(col)
        is_boolean = pd.api.types.is_bool_dtype(col)

        # Categorical detection (string/object with low cardinality)
        is_categorical = (
            not is_numeric
            and not is_datetime
            and not is_boolean
            and unique_count < total_rows * 0.5
        )

        # Cardinality
        cardinality = unique_count

        # Min/Max/Mean/Std (numeric only)
        min_val, max_val, mean_val, std_val = None, None, None, None
        if is_numeric and count > 0:
            try:
                min_val = float(col.min())
                max_val = float(col.max())
                mean_val = float(col.mean())
                std_val = float(col.std()) if count > 1 else 0.0
            except (TypeError, ValueError):
                pass

        # Outlier detection (IQR-based, numeric only)
        outlier_count = 0
        if is_numeric and count > 0:
            outlier_count = self._detect_outliers(col, count, total_rows)

        # Sample values (first 3 non-null)
        sample_vals = col.dropna().head(3).tolist()

        return ColumnStat(
            name=name,
            dtype=dtype_str,
            count=count,
            missing_count=missing_count,
            missing_pct=missing_pct,
            unique_count=unique_count,
            unique_pct=unique_pct,
            min_val=min_val,
            max_val=max_val,
            mean_val=mean_val,
            std_val=std_val,
            outlier_count=outlier_count,
            outlier_pct=round(outlier_count / total_rows * 100, 2) if total_rows > 0 else 0.0,
            is_numeric=is_numeric,
            is_datetime=is_datetime,
            is_categorical=is_categorical,
            is_boolean=is_boolean,
            cardinality=cardinality,
            sample_values=sample_vals,
        )

    def _detect_outliers(self, col: pd.Series, count: int, total_rows: int) -> int:
        """Detect outliers using IQR method with optional sampling."""
        if count == 0:
            return 0

        # Use sampling for large datasets
        if total_rows > self.OUTLIER_SAMPLE_THRESHOLD:
            sample = col.dropna().sample(
                n=min(self.OUTLIER_SAMPLE_THRESHOLD, count),
                random_state=42,
            )
        else:
            sample = col.dropna()

        if len(sample) < 4:
            return 0

        try:
            q1 = sample.quantile(0.25)
            q3 = sample.quantile(0.75)
            iqr = q3 - q1

            if iqr == 0:
                return 0

            lower = q1 - 1.5 * iqr
            upper = q3 + 1.5 * iqr

            outlier_mask = (col < lower) | (col > upper)
            return int(outlier_mask.sum())
        except (TypeError, ValueError):
            return 0

    def _summarize_dtypes(self, df: pd.DataFrame) -> dict:
        """Summarize column dtypes into categories."""
        summary = {"numeric": 0, "datetime": 0, "boolean": 0, "string": 0, "other": 0}
        for col in df.columns:
            dtype = df[col].dtype
            if pd.api.types.is_numeric_dtype(dtype):
                summary["numeric"] += 1
            elif pd.api.types.is_datetime64_any_dtype(dtype):
                summary["datetime"] += 1
            elif pd.api.types.is_bool_dtype(dtype):
                summary["boolean"] += 1
            elif dtype == object or pd.api.types.is_string_dtype(dtype):
                summary["string"] += 1
            else:
                summary["other"] += 1
        return summary
