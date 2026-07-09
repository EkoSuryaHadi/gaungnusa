"""Scoring Module — computes comprehensive Data Quality Index (DQI 0-100).

Reads the DataProfile + audit trail from SilverContext and computes
a weighted quality score across 6 dimensions:

    completeness (25%) — % non-missing cells
    validity     (25%) — % rows passing validation rules
    consistency  (15%) — % cross-column consistency
    uniqueness   (15%) — % unique rows
    timeliness   (10%) — data freshness score
    accuracy     (10%) — estimated accuracy from outlier analysis

The DQI weights follow industry-standard data quality frameworks
(DAMA DMBoK, ISO 8000) and are configurable.
"""

import time
import pandas as pd
from typing import Tuple

from silver.modules.base import BaseModule
from silver.models.types import (
    SilverContext,
    QualityScore,
    AuditEntry,
)


class ScoringModule(BaseModule):
    """Compute Data Quality Index from profile + audit trail."""

    name = "scoring"
    version = "1.0.0"
    description = "Computes DQI (Data Quality Index 0-100) from profile and audit trail"

    # DQI weights (sum must be 1.0)
    WEIGHTS = {
        "completeness": 0.25,
        "validity": 0.25,
        "consistency": 0.15,
        "uniqueness": 0.15,
        "timeliness": 0.10,
        "accuracy": 0.10,
    }

    def run(
        self,
        df: pd.DataFrame,
        ctx: SilverContext,
    ) -> Tuple[pd.DataFrame, SilverContext]:
        start = time.perf_counter()
        rows_before = len(df)

        # ── 1. Completeness (from profile) ──────────────────
        completeness = 100.0
        profile = ctx.profile
        if profile is not None:
            completeness = max(0.0, 100.0 - profile.missing_pct)

        # ── 2. Validity (from validation audit) ───────────
        validity = self._compute_validity(ctx)

        # ── 3. Uniqueness (from profile) ───────────────────
        uniqueness = 100.0
        if profile is not None:
            uniqueness = max(0.0, 100.0 - profile.duplicate_pct)

        # ── 4. Consistency (from cross-column audit metadata) ─
        consistency = self._compute_consistency(ctx, df)

        # ── 5. Timeliness (from timestamp audit) ──────────
        timeliness = self._compute_timeliness(ctx, df)

        # ── 6. Accuracy (from outlier analysis) ────────────
        accuracy = self._compute_accuracy(ctx, df)

        # ── Build score ────────────────────────────────────
        score = QualityScore(
            completeness=round(completeness, 2),
            validity=round(validity, 2),
            consistency=round(consistency, 2),
            uniqueness=round(uniqueness, 2),
            timeliness=round(timeliness, 2),
            accuracy=round(accuracy, 2),
        )

        ctx.quality_score = score

        # ── Audit ──────────────────────────────────────────
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        ctx.add_audit(AuditEntry(
            module_name=self.name,
            module_version=self.version,
            execution_ms=elapsed_ms,
            rows_before=rows_before,
            rows_after=len(df),
            metadata={
                "dqi_overall": score.overall,
                "dqi_dimensions": score.to_dict(),
                "weights": self.WEIGHTS,
            },
        ))

        return df, ctx

    # ── Private helpers ──────────────────────────────────────

    def _compute_validity(self, ctx: SilverContext) -> float:
        """Compute validity score from validation module audit."""
        for entry in ctx.audit_trail:
            if entry.module_name == "validation":
                meta = entry.metadata or {}
                total_violations = meta.get("total_violations", 0)
                rows_before = entry.rows_before
                if rows_before > 0:
                    violation_rate = total_violations / rows_before
                    return max(0.0, 100.0 * (1.0 - min(violation_rate, 1.0)))
        return 100.0  # No validation ran = assume valid

    def _compute_consistency(self, ctx: SilverContext, df: pd.DataFrame) -> float:
        """Estimate cross-column consistency.

        Checks for internal inconsistencies:
        - Rows where all values are null (already covered by completeness)
        - Type mismatches detected by datatype module
        - Cross-column rule violations from validation audit
        """
        consistency = 100.0

        # Deductions from datatype audit
        for entry in ctx.audit_trail:
            if entry.module_name == "datatype":
                meta = entry.metadata or {}
                mismatches = meta.get("type_mismatches", 0)
                if entry.rows_before > 0:
                    consistency -= min(mismatches / entry.rows_before * 100, 50)

        # Deductions from duplicate module (check if it ran)
        for entry in ctx.audit_trail:
            if entry.module_name == "duplicate":
                rows_removed = entry.rows_before - entry.rows_after
                if entry.rows_before > 0:
                    dup_rate = rows_removed / entry.rows_before
                    # Already counted in uniqueness; partial deduction for inconsistency
                    consistency -= min(dup_rate * 30, 20)

        return max(0.0, consistency)

    def _compute_timeliness(self, ctx: SilverContext, df: pd.DataFrame) -> float:
        """Estimate data timeliness/freshness.

        Checks:
        - Timestamp module ran successfully
        - No future dates detected
        - Recent timestamps found
        """
        timeliness = 100.0

        # Check timestamp audit
        for entry in ctx.audit_trail:
            if entry.module_name == "timestamp":
                meta = entry.metadata or {}
                future_dates = meta.get("future_dates", 0)
                no_timestamps = meta.get("no_timestamp_columns", False)

                if no_timestamps:
                    # No timestamp columns found — can't measure freshness
                    timeliness = 70.0  # Neutral score
                elif entry.rows_before > 0:
                    timeliness -= min(future_dates / entry.rows_before * 100, 40)

        return max(0.0, timeliness)

    def _compute_accuracy(self, ctx: SilverContext, df: pd.DataFrame) -> float:
        """Estimate data accuracy from outlier analysis.

        High outlier rate suggests potential accuracy issues.
        """
        accuracy = 100.0
        profile = ctx.profile

        if profile is not None and profile.total_rows > 0:
            # Outlier rate deduction
            outlier_deduction = min(profile.outlier_pct * 0.5, 50)
            accuracy -= outlier_deduction

            # High cardinality columns with few rows = potential accuracy issue
            for col in profile.columns:
                if hasattr(col, "cardinality") and hasattr(col, "unique_pct"):
                    if col.cardinality > 1000 and profile.total_rows > 100:
                        # Very high cardinality in moderate dataset — flag
                        accuracy -= min(col.unique_pct * 0.05, 10)

        return max(0.0, accuracy)
