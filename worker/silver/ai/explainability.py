"""Explainability — per-row, per-column violation explanations.

For each validation violation, generates human-readable Explanation objects
answering: which rule was violated, what was the actual value, what was expected,
and a confidence score.

Designed to be called after validation module runs. Generates Explanation[]
from validation audit metadata + the violated DataFrame.
"""

import pandas as pd
from typing import List, Optional

from silver.models.types import SilverContext, Explanation


class Explainer:
    """Generates per-row explanations for validation violations."""

    def explain(
        self,
        df: pd.DataFrame,
        ctx: SilverContext,
        max_explanations: int = 50,
    ) -> List[Explanation]:
        """Generate explanations for all validation violations.

        Args:
            df: DataFrame after validation (may contain _violation columns)
            ctx: Silver context with loaded_rules and audit trail
            max_explanations: Cap on total explanations (prevents huge outputs)

        Returns:
            List of Explanation objects, one per violation row×column
        """
        explanations: List[Explanation] = []

        rules = ctx.loaded_rules or {}
        if not rules:
            return explanations

        # Find validation audit to understand context
        validation_ran = any(
            e.module_name == "validation" for e in ctx.audit_trail
        )

        for col_name, rule in rules.items():
            if col_name not in df.columns:
                continue

            col = df[col_name]

            if isinstance(rule, dict):
                # ── Range rules ────────────────────────
                if "min" in rule:
                    mask = col < rule["min"]
                    explanations.extend(
                        self._build_range_explanations(
                            col, mask, col_name, "below", rule["min"],
                            max_explanations - len(explanations),
                        )
                    )

                if "max" in rule:
                    mask = col > rule["max"]
                    explanations.extend(
                        self._build_range_explanations(
                            col, mask, col_name, "above", rule["max"],
                            max_explanations - len(explanations),
                        )
                    )

                # ── Enum rules ────────────────────────
                if "values" in rule and len(explanations) < max_explanations:
                    allowed = [str(v).upper() for v in rule["values"]]
                    mask = ~col.astype(str).str.upper().isin(allowed)
                    explanations.extend(
                        self._build_enum_explanations(
                            col, mask, col_name, rule["values"],
                            max_explanations - len(explanations),
                        )
                    )

                # ── Pattern rules ─────────────────────
                if "pattern" in rule and len(explanations) < max_explanations:
                    import re
                    try:
                        pat = re.compile(rule["pattern"])
                        mask = ~col.astype(str).apply(
                            lambda x: bool(pat.match(str(x))) if pd.notna(x) else False
                        )
                        explanations.extend(
                            self._build_pattern_explanations(
                                col, mask, col_name, rule["pattern"],
                                max_explanations - len(explanations),
                            )
                        )
                    except re.error:
                        pass

                # ── Unique rules ──────────────────────
                if rule.get("unique") and len(explanations) < max_explanations:
                    mask = col.duplicated(keep=False)
                    explanations.extend(
                        self._build_unique_explanations(
                            col, mask, col_name,
                            max_explanations - len(explanations),
                        )
                    )

            if len(explanations) >= max_explanations:
                break

        return explanations[:max_explanations]

    # ── Private builders ─────────────────────────────────

    def _build_range_explanations(
        self, col: pd.Series, mask: pd.Series, col_name: str,
        direction: str, threshold, max_n: int,
    ) -> List[Explanation]:
        explanations = []
        violated_indices = mask[mask].index[:max_n]
        for idx in violated_indices:
            actual = col.loc[idx]
            explanations.append(Explanation(
                column=col_name,
                row_index=int(idx),
                rule_name=f"{direction}_{threshold}",
                actual_value=actual,
                expected_value=f"{'≥' if direction == 'above' else '≤'} {threshold}",
                message=f"Value {actual} is {direction} threshold {threshold}",
                confidence=0.95,
            ))
        return explanations

    def _build_enum_explanations(
        self, col: pd.Series, mask: pd.Series, col_name: str,
        allowed_values: list, max_n: int,
    ) -> List[Explanation]:
        explanations = []
        violated_indices = mask[mask].index[:max_n]
        for idx in violated_indices:
            actual = col.loc[idx]
            allowed_str = ", ".join(str(v) for v in allowed_values[:5])
            if len(allowed_values) > 5:
                allowed_str += f"... (+{len(allowed_values) - 5} more)"
            explanations.append(Explanation(
                column=col_name,
                row_index=int(idx),
                rule_name="enum",
                actual_value=actual,
                expected_value=allowed_str,
                message=f"Value '{actual}' not in allowed set",
                confidence=1.0,
            ))
        return explanations

    def _build_pattern_explanations(
        self, col: pd.Series, mask: pd.Series, col_name: str,
        pattern: str, max_n: int,
    ) -> List[Explanation]:
        explanations = []
        violated_indices = mask[mask].index[:max_n]
        for idx in violated_indices:
            actual = col.loc[idx]
            explanations.append(Explanation(
                column=col_name,
                row_index=int(idx),
                rule_name="pattern",
                actual_value=actual,
                expected_value=f"matches /{pattern}/",
                message=f"'{actual}' does not match pattern /{pattern}/",
                confidence=1.0,
            ))
        return explanations

    def _build_unique_explanations(
        self, col: pd.Series, mask: pd.Series, col_name: str, max_n: int,
    ) -> List[Explanation]:
        explanations = []
        violated_indices = mask[mask].index[:max_n]
        for idx in violated_indices:
            actual = col.loc[idx]
            explanations.append(Explanation(
                column=col_name,
                row_index=int(idx),
                rule_name="unique",
                actual_value=actual,
                expected_value="unique value",
                message=f"Duplicate value '{actual}' found",
                confidence=1.0,
            ))
        return explanations


def generate_explanations(df: pd.DataFrame, ctx: SilverContext, max_n: int = 50) -> List[Explanation]:
    """Convenience function: generate and store explanations in context."""
    explainer = Explainer()
    explanations = explainer.explain(df, ctx, max_n)
    for exp in explanations:
        ctx.add_explanation(exp)
    return explanations


__all__ = ["Explainer", "generate_explanations"]
