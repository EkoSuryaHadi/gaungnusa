"""Outlier Module — detects and handles statistical outliers.

Methods:
    - IQR: Interquartile Range (Q1 - 1.5*IQR, Q3 + 1.5*IQR)
    - Z-score: Standard deviations from mean (default: 3σ)

Modes:
    - flag: adds _outlier_count column
    - drop: removes rows with outliers
    - clip: caps values at boundaries
"""

import time, pandas as pd, numpy as np
from typing import Tuple
from silver.modules.base import BaseModule
from silver.models.types import SilverContext, AuditEntry


class OutlierModule(BaseModule):
    name = "outlier"
    version = "1.0.0"
    description = "Detects and handles outliers using IQR or Z-score methods"

    def run(self, df: pd.DataFrame, ctx: SilverContext) -> Tuple[pd.DataFrame, SilverContext]:
        start = time.perf_counter()
        result = df.copy()
        rows_before = len(result)
        method = getattr(ctx, "outlier_method", "iqr")
        mode = getattr(ctx, "outlier_mode", "flag")
        threshold = getattr(ctx, "outlier_threshold", 3.0 if method == "zscore" else 1.5)

        numeric_cols = [
            c for c in df.columns
            if pd.api.types.is_numeric_dtype(df[c]) and not pd.api.types.is_bool_dtype(df[c])
        ]
        outlier_mask = pd.Series(False, index=df.index)
        details = {}

        for col in numeric_cols:
            vals = df[col].dropna()
            if len(vals) < 4:
                continue
            if method == "iqr":
                q1, q3 = vals.quantile(0.25), vals.quantile(0.75)
                iqr = q3 - q1
                if iqr == 0:
                    continue
                lower, upper = q1 - threshold * iqr, q3 + threshold * iqr
                mask = (df[col] < lower) | (df[col] > upper)
            else:
                mean, std = vals.mean(), vals.std()
                if std == 0:
                    continue
                mask = (df[col] - mean).abs() > threshold * std

            outlier_mask |= mask
            details[col] = int(mask.sum())

        total = int(outlier_mask.sum())
        if total == 0:
            return result, ctx

        if mode == "drop":
            result = result[~outlier_mask]
        elif mode == "clip":
            for col in numeric_cols:
                if col in details:
                    vals = df[col].dropna()
                    q1, q3 = vals.quantile(0.25), vals.quantile(0.75)
                    iqr = q3 - q1
                    lower, upper = q1 - threshold * iqr, q3 + threshold * iqr
                    result[col] = result[col].clip(lower, upper)
        else:
            result["_outlier_count"] = outlier_mask.fillna(False).astype(int)

        ctx.add_audit(AuditEntry(
            module_name=self.name, module_version=self.version,
            execution_ms=int((time.perf_counter()-start)*1000),
            rows_before=rows_before, rows_after=len(result),
            metadata={"method": method, "mode": mode, "total_outliers": total, "details": details},
        ))
        return result, ctx
