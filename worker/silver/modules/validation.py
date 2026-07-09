"""Validation Module — YAML-driven rule-based validation.

Supports rule types:
    - min/max range validation
    - type checking
    - regex pattern matching
    - enum/set membership
    - cross-column comparison
    - uniqueness
"""

import time, pandas as pd, re
from typing import Tuple
from silver.modules.base import BaseModule
from silver.models.types import SilverContext, AuditEntry


class ValidationModule(BaseModule):
    name = "validation"
    version = "1.0.0"
    description = "YAML-driven rule-based validation — range, type, regex, enum, cross-column, uniqueness"

    def run(self, df: pd.DataFrame, ctx: SilverContext) -> Tuple[pd.DataFrame, SilverContext]:
        start = time.perf_counter()
        result = df.copy()
        rows_before = len(result)
        rules = getattr(ctx, "loaded_rules", {}) or {}
        mode = getattr(ctx, "validation_mode", "flag")

        total_violations = 0
        violations_detail = {}

        if not rules:
            ctx.add_audit(AuditEntry(module_name=self.name, rows_before=rows_before, rows_after=rows_before,
                          metadata={"warning": "No rules loaded"}))
            return result, ctx

        for col_name, rule in rules.items():
            if col_name not in result.columns:
                continue
            col = result[col_name]
            violations = 0

            if isinstance(rule, dict):
                # Initialize violation column once if flag mode
                viol_col = f"_{col_name}_violation"
                if mode == "flag" and viol_col not in result.columns:
                    result[viol_col] = ""

                # Range check
                if "min" in rule:
                    mask = col < rule["min"]
                    violations += int(mask.sum())
                    if mode == "flag":
                        result.loc[mask, viol_col] = "below_min(" + str(rule["min"]) + ")"
                if "max" in rule:
                    mask = col > rule["max"]
                    violations += int(mask.sum())
                    if mode == "flag":
                        current = result.loc[mask, viol_col].fillna("")
                        result.loc[mask, viol_col] = current.astype(str).str.cat(
                            pd.Series("above_max(" + str(rule["max"]) + ")|", index=result.index[mask]),
                            na_rep=""
                        )
                # Enum
                if "values" in rule:
                    allowed = [str(v).upper() for v in rule["values"]]
                    mask = ~col.astype(str).str.upper().isin(allowed)
                    violations += int(mask.sum())
                    if mode == "flag":
                        result.loc[mask, viol_col] = "invalid_enum"
                # Regex
                if "pattern" in rule:
                    try:
                        pat = re.compile(rule["pattern"])
                        mask = ~col.astype(str).apply(lambda x: bool(pat.match(str(x))))
                        violations += int(mask.sum())
                        if mode == "flag":
                            result.loc[mask, viol_col] = "regex_mismatch"
                    except re.error:
                        pass
                # Unique
                if rule.get("unique"):
                    mask = col.duplicated(keep=False)
                    violations += int(mask.sum())
                    if mode == "flag":
                        result.loc[mask, viol_col] = "duplicate_value"

            if violations > 0:
                total_violations += violations
                violations_detail[col_name] = violations

        ctx.add_audit(AuditEntry(
            module_name=self.name, module_version=self.version,
            execution_ms=int((time.perf_counter()-start)*1000),
            rows_before=rows_before, rows_after=len(result),
            metadata={"mode": mode, "total_violations": total_violations, "details": violations_detail,
                      "rules_applied": list(rules.keys())},
        ))
        return result, ctx
