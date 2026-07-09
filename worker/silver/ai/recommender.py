"""Recommendation Engine — generates action items from profile + audit data.

Analyzes DataProfile, classification, and audit trail to produce prioritized
recommendations for improving data quality.

Priority levels:
    CRITICAL — data integrity at risk (validation failures >20%)
    HIGH — significant quality issues (missing >30%, duplicates >20%)
    MEDIUM — moderate issues (outliers >10%, low completeness)
    LOW — minor improvements (formatting, enrichment opportunities)
    INFO — informational (profiling stats, pipeline performance)
"""

import pandas as pd
from typing import List, Optional

from silver.models.types import SilverContext, Recommendation, DataProfile


class Recommender:
    """Generates prioritized recommendations from pipeline state."""

    # Thresholds for each priority
    MISSING_CRITICAL = 30.0
    DUPLICATE_CRITICAL = 20.0
    VALIDITY_HIGH = 20.0
    OUTLIER_MEDIUM = 10.0
    CARDINALITY_LOW = 0.1

    def generate(
        self,
        df: pd.DataFrame,
        ctx: SilverContext,
    ) -> List[Recommendation]:
        """Generate recommendations from the current pipeline state.

        Args:
            df: Current DataFrame
            ctx: Silver context with profile + classification + audit

        Returns:
            List of prioritized recommendations
        """
        recommendations: List[Recommendation] = []

        profile = ctx.profile
        if profile is None:
            if len(df.columns) == 0:
                return []
            # No profile — recommend profiling first
            recommendations.append(Recommendation(
                priority="HIGH",
                category="pipeline",
                title="Run data profiling first",
                description="No profile found. Profiling must run before recommendations.",
                confidence=1.0,
            ))
            return recommendations

        # ── Missing values ──────────────────────────────────
        self._check_missing(profile, recommendations)

        # ── Duplicates ─────────────────────────────────────
        self._check_duplicates(profile, recommendations)

        # ── Validation issues ──────────────────────────────
        self._check_validation(ctx, recommendations)

        # ── Outliers ───────────────────────────────────────
        self._check_outliers(profile, recommendations)

        # ── High cardinality columns ───────────────────────
        self._check_cardinality(profile, recommendations)

        # ── Domain-specific recommendations ────────────────
        if ctx.dataset_class:
            self._domain_recommendations(ctx.dataset_class, profile, recommendations)

        # ── Pipeline health ────────────────────────────────
        self._pipeline_health(ctx, recommendations)

        # Sort by priority
        return sorted(recommendations, key=self._priority_rank)

    # ── Checkers ───────────────────────────────────────

    def _check_missing(self, profile: DataProfile, recs: List[Recommendation]):
        missing = profile.missing_pct
        if missing > self.MISSING_CRITICAL:
            recs.append(Recommendation(
                priority="CRITICAL",
                category="cleaning",
                title=f"Handle {missing:.1f}% missing values",
                description="Use MissingValue module (mean/median/mode fill or drop) to clean.",
                affected_columns=self._columns_with_missing(profile),
                confidence=min(1.0, missing / 50),
            ))
        elif missing > 10:
            recs.append(Recommendation(
                priority="MEDIUM",
                category="cleaning",
                title=f"Consider handling {missing:.1f}% missing values",
                description="Most columns have moderate missing rates. Imputation recommended.",
                affected_columns=self._columns_with_missing(profile),
                confidence=min(1.0, missing / 30),
            ))

    def _check_duplicates(self, profile: DataProfile, recs: List[Recommendation]):
        dup = profile.duplicate_pct
        if dup > self.DUPLICATE_CRITICAL:
            recs.append(Recommendation(
                priority="CRITICAL",
                category="cleaning",
                title=f"Remove {dup:.1f}% duplicate rows",
                description="Use Duplicate module with drop mode to deduplicate.",
                confidence=min(1.0, dup / 30),
            ))
        elif dup > 5:
            recs.append(Recommendation(
                priority="MEDIUM",
                category="cleaning",
                title=f"Flag {dup:.1f}% duplicate rows for review",
                description="Use Duplicate module with flag mode to inspect duplicates.",
                confidence=min(1.0, dup / 20),
            ))

    def _check_validation(self, ctx: SilverContext, recs: List[Recommendation]):
        for entry in ctx.audit_trail:
            if entry.module_name == "validation":
                meta = entry.metadata or {}
                violations = meta.get("total_violations", 0)
                rows = entry.rows_before
                if rows > 0:
                    rate = violations / rows * 100
                    if rate > self.VALIDITY_HIGH:
                        recs.append(Recommendation(
                            priority="HIGH",
                            category="validation",
                            title=f"Fix {violations} validation violations ({rate:.1f}%)",
                            description="Review flagged rows. Check domain rules in YAML config.",
                            affected_columns=list(meta.get("details", {}).keys()),
                            confidence=min(1.0, rate / 40),
                        ))
                    elif rate > 5:
                        recs.append(Recommendation(
                            priority="MEDIUM",
                            category="validation",
                            title=f"Review {violations} validation violations ({rate:.1f}%)",
                            description="Some values outside expected ranges. Verify source data.",
                            affected_columns=list(meta.get("details", {}).keys()),
                            confidence=min(1.0, rate / 20),
                        ))

    def _check_outliers(self, profile: DataProfile, recs: List[Recommendation]):
        if profile.outlier_pct > self.OUTLIER_MEDIUM:
            outlier_cols = [
                c.name for c in profile.columns
                if hasattr(c, "outlier_pct") and c.outlier_pct > 0
            ]
            recs.append(Recommendation(
                priority="MEDIUM",
                category="cleaning",
                title=f"Investigate {profile.outlier_pct:.1f}% outliers",
                description="Use Outlier module (IQR/Z-score) to flag or clip extremes.",
                affected_columns=outlier_cols,
                confidence=min(1.0, profile.outlier_pct / 20),
            ))

    def _check_cardinality(self, profile: DataProfile, recs: List[Recommendation]):
        high_card = [
            c.name for c in profile.columns
            if hasattr(c, "unique_pct") and c.unique_pct > 90
            and hasattr(c, "cardinality") and c.cardinality > 100
        ]
        if high_card and profile.total_rows > 100:
            recs.append(Recommendation(
                priority="INFO",
                category="monitoring",
                title=f"High-cardinality columns detected: {', '.join(high_card[:3])}",
                description="These may be identifiers or free-text. Review for categorical grouping.",
                affected_columns=high_card,
                confidence=0.7,
            ))

    def _domain_recommendations(
        self, domain: str, profile: DataProfile, recs: List[Recommendation]
    ):
        if domain == "iot":
            recs.append(Recommendation(
                priority="LOW",
                category="enrichment",
                title="Consider adding location/device metadata enrichment",
                description="IoT data often benefits from geolocation or device catalog lookups.",
                confidence=0.6,
            ))
        elif domain == "finance":
            recs.append(Recommendation(
                priority="LOW",
                category="validation",
                title="Apply financial validation rules",
                description="Finance domain: check debit/credit balance, tax compliance, reconciliation.",
                confidence=0.8,
            ))
        elif domain == "sales":
            recs.append(Recommendation(
                priority="INFO",
                category="monitoring",
                title="Track sales KPIs (revenue, conversion, AOV)",
                description="Consider building Gold aggregations for sales dashboards.",
                confidence=0.7,
            ))
        elif domain == "hr":
            recs.append(Recommendation(
                priority="LOW",
                category="validation",
                title="Apply HR compliance checks",
                description="Verify salary ranges, attendance patterns, and leave balances.",
                confidence=0.7,
            ))
        elif domain == "erp":
            recs.append(Recommendation(
                priority="LOW",
                category="enrichment",
                title="Cross-reference inventory with supplier catalogs",
                description="ERP data gains value from supplier and product master enrichment.",
                confidence=0.6,
            ))

    def _pipeline_health(self, ctx: SilverContext, recs: List[Recommendation]):
        total_time = sum(e.execution_ms for e in ctx.audit_trail)
        module_count = len(ctx.audit_trail)

        if total_time > 5000 and module_count > 3:
            recs.append(Recommendation(
                priority="INFO",
                category="monitoring",
                title=f"Pipeline took {total_time}ms across {module_count} modules",
                description="Consider sampling for large datasets or parallelizing independent modules.",
                confidence=0.5,
            ))

    # ── Helpers ────────────────────────────────────────

    def _priority_rank(self, rec: Recommendation) -> int:
        order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3, "INFO": 4}
        return order.get(rec.priority, 5)

    def _columns_with_missing(self, profile: DataProfile) -> List[str]:
        return [
            c.name for c in profile.columns
            if hasattr(c, "missing_pct") and c.missing_pct > 0
        ]


__all__ = ["Recommender"]
