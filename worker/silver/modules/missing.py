"""Missing Module — detects and handles missing values.

Strategies:
    - drop: remove rows with any/all nulls
    - fill_static: fill with constant value
    - fill_mean: fill with column mean (numeric)
    - fill_median: fill with column median (numeric)
    - fill_mode: fill with most frequent value
    - fill_forward: forward-fill (last valid observation)
    - fill_interpolate: linear interpolation
"""

import time, pandas as pd, numpy as np
from typing import Tuple
from silver.modules.base import BaseModule
from silver.models.types import SilverContext, AuditEntry


class MissingModule(BaseModule):
    name = "missing"
    version = "1.0.0"
    description = "Detects and handles missing values — drop, fill (mean/median/mode/forward/interpolate)"

    def run(self, df: pd.DataFrame, ctx: SilverContext) -> Tuple[pd.DataFrame, SilverContext]:
        start = time.perf_counter()
        result = df.copy()
        rows_before = len(result)
        strategy = getattr(ctx, "missing_strategy", None) or getattr(self, "strategy", "flag")
        fill_value = getattr(ctx, "missing_fill_value", None)
        columns = getattr(ctx, "missing_columns", None)

        total_missing_before = int(df.isna().sum().sum())
        if total_missing_before == 0:
            return result, ctx

        targets = columns if columns else list(df.columns[df.isna().any()])

        if strategy == "drop":
            result = result.dropna(subset=targets)
            action = f"Dropped {rows_before - len(result)} rows with nulls"
        elif strategy == "fill_static" and fill_value is not None:
            for col in targets:
                if col in result.columns:
                    result[col] = result[col].fillna(fill_value)
            action = f"Filled nulls with '{fill_value}'"
        elif strategy == "fill_mean":
            for col in targets:
                if col in result.columns and pd.api.types.is_numeric_dtype(result[col]):
                    result[col] = result[col].fillna(result[col].mean())
            action = "Filled nulls with column mean"
        elif strategy == "fill_median":
            for col in targets:
                if col in result.columns and pd.api.types.is_numeric_dtype(result[col]):
                    result[col] = result[col].fillna(result[col].median())
            action = "Filled nulls with column median"
        elif strategy == "fill_mode":
            for col in targets:
                if col in result.columns:
                    mode_val = result[col].mode()
                    if len(mode_val) > 0:
                        result[col] = result[col].fillna(mode_val[0])
            action = "Filled nulls with column mode"
        elif strategy == "fill_forward":
            for col in targets:
                if col in result.columns:
                    result[col] = result[col].ffill()
            action = "Forward-filled nulls"
        elif strategy == "fill_interpolate":
            for col in targets:
                if col in result.columns and pd.api.types.is_numeric_dtype(result[col]):
                    # Group by device_id if present to avoid cross-device interpolation
                    if "device_id" in result.columns:
                        result[col] = result.groupby("device_id")[col].transform(lambda x: x.interpolate())
                    else:
                        result[col] = result[col].interpolate()
            action = "Interpolated nulls"
        else:
            # Flag mode
            result["_missing_count"] = df.isna().sum(axis=1)
            action = f"Flagged {total_missing_before} missing cells"

        remaining = int(result.isna().sum().sum())
        ctx.add_audit(AuditEntry(
            module_name=self.name, module_version=self.version,
            execution_ms=int((time.perf_counter()-start)*1000),
            rows_before=rows_before, rows_after=len(result),
            metadata={"strategy": strategy, "missing_before": total_missing_before,
                      "missing_after": remaining, "columns": targets, "action": action},
        ))
        return result, ctx
