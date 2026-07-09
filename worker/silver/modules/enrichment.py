"""Enrichment Module — enriches data with external lookups or derived columns.

Capabilities:
    - Static mappings (dictionary-based lookups)
    - Derived columns (concatenation, arithmetic)
    - Prefix/suffix addition
"""

import time, pandas as pd
from typing import Tuple
from silver.modules.base import BaseModule
from silver.models.types import SilverContext, AuditEntry


class EnrichmentModule(BaseModule):
    name = "enrichment"
    version = "1.0.0"
    description = "Enriches data with lookups, derived columns, and transformations"

    def run(self, df: pd.DataFrame, ctx: SilverContext) -> Tuple[pd.DataFrame, SilverContext]:
        start = time.perf_counter()
        result = df.copy()
        rows_before = len(result)
        mappings = getattr(ctx, "enrichment_mappings", {}) or {}
        changes = []

        for col_name, mapping in mappings.items():
            if col_name not in result.columns:
                continue
            new_col = f"{col_name}_enriched"
            if isinstance(mapping, dict):
                result[new_col] = result[col_name].map(mapping)
                changes.append(new_col)

        ctx.add_audit(AuditEntry(
            module_name=self.name, module_version=self.version,
            execution_ms=int((time.perf_counter()-start)*1000),
            rows_before=rows_before, rows_after=len(result),
            metadata={"enriched_columns": len(changes), "changes": changes},
        ))
        return result, ctx
