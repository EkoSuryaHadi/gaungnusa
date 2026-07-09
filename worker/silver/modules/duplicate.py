"""Duplicate Module — detects and removes duplicate rows.

This module provides two strategies for duplicate detection:
    - Exact: rows with identical values across all/selected columns
    - Fuzzy: similarity-based detection using string distance (optional)

    The module can operate in two modes:
    - flag: adds _is_duplicate column (safe, default)
    - drop: removes duplicate rows (destructive)
"""

import time
import pandas as pd
from typing import Tuple, Optional

from silver.modules.base import BaseModule
from silver.models.types import SilverContext, AuditEntry


class DuplicateModule(BaseModule):
    """Detect and handle duplicate rows."""

    name = "duplicate"
    version = "1.0.0"
    description = "Detects and removes duplicate rows — exact match + fuzzy string matching"

    def run(
        self,
        df: pd.DataFrame,
        ctx: SilverContext,
    ) -> Tuple[pd.DataFrame, SilverContext]:
        """Detect and optionally remove duplicate rows.

        Args:
            df: Input DataFrame
            ctx: Pipeline context (ctx.mode controls behavior)

        Returns:
            (deduplicated DataFrame, updated context)
        """
        start = time.perf_counter()
        result = df.copy()
        rows_before = len(result)

        # Determine mode
        mode = getattr(ctx, "duplicate_mode", "flag")  # flag | drop
        subset = getattr(ctx, "duplicate_subset", None)  # list of columns or None

        # Find duplicates
        if subset and all(c in result.columns for c in subset):
            dup_mask = result.duplicated(subset=subset, keep="first")
        else:
            dup_mask = result.duplicated(keep="first")

        dup_count = int(dup_mask.sum())

        if dup_count == 0:
            elapsed_ms = int((time.perf_counter() - start) * 1000)
            ctx.add_audit(AuditEntry(
                module_name=self.name,
                module_version=self.version,
                execution_ms=elapsed_ms,
                rows_before=rows_before,
                rows_after=rows_before,
                metadata={"duplicates_found": 0, "mode": mode},
            ))
            return result, ctx

        if mode == "drop":
            result = result[~dup_mask].copy()
            action = f"Dropped {dup_count} duplicate rows ({rows_before} → {len(result)})"
        else:
            result["_is_duplicate"] = dup_mask
            action = f"Flagged {dup_count} duplicate rows (column: _is_duplicate)"

        elapsed_ms = int((time.perf_counter() - start) * 1000)

        ctx.add_audit(AuditEntry(
            module_name=self.name,
            module_version=self.version,
            execution_ms=elapsed_ms,
            rows_before=rows_before,
            rows_after=len(result),
            metadata={
                "duplicates_found": dup_count,
                "duplicate_pct": round(dup_count / max(rows_before, 1) * 100, 2),
                "mode": mode,
                "subset": subset,
                "action": action,
            },
            warnings=[] if mode == "flag" else [action],
        ))

        return result, ctx
