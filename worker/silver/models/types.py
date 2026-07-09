"""Silver data models — type definitions for the data quality engine.

These dataclasses are the shared vocabulary of the entire Silver system.
Every module reads/writes to these structures via the SilverContext.
"""

from dataclasses import dataclass, field
from typing import Optional, Any
from datetime import datetime


# ─────────────────────────────────────────────────────────────
# Data Profile
# ─────────────────────────────────────────────────────────────

@dataclass
class ColumnStat:
    """Statistics for a single column."""
    name: str
    dtype: str
    count: int
    missing_count: int = 0
    missing_pct: float = 0.0
    unique_count: int = 0
    unique_pct: float = 0.0
    min_val: Any = None
    max_val: Any = None
    mean_val: Optional[float] = None
    std_val: Optional[float] = None
    outlier_count: int = 0
    outlier_pct: float = 0.0
    is_numeric: bool = False
    is_datetime: bool = False
    is_categorical: bool = False
    is_boolean: bool = False
    cardinality: int = 0
    sample_values: list = field(default_factory=list)


@dataclass
class DataProfile:
    """Complete data profile for a DataFrame."""
    total_rows: int = 0
    total_columns: int = 0
    total_cells: int = 0
    missing_cells: int = 0
    missing_pct: float = 0.0
    duplicate_rows: int = 0
    duplicate_pct: float = 0.0
    total_outliers: int = 0
    outlier_pct: float = 0.0
    memory_bytes: int = 0
    memory_mb: float = 0.0
    columns: list = field(default_factory=list)  # list[ColumnStat]
    dtypes_summary: dict = field(default_factory=dict)
    profiling_ms: int = 0
    profiled_at: Optional[datetime] = None

    def to_dict(self) -> dict:
        return {
            "total_rows": self.total_rows,
            "total_columns": self.total_columns,
            "total_cells": self.total_cells,
            "missing_cells": self.missing_cells,
            "missing_pct": round(self.missing_pct, 2),
            "duplicate_rows": self.duplicate_rows,
            "duplicate_pct": round(self.duplicate_pct, 2),
            "total_outliers": self.total_outliers,
            "outlier_pct": round(self.outlier_pct, 2),
            "memory_mb": round(self.memory_mb, 2),
            "dtypes_summary": self.dtypes_summary,
            "profiling_ms": self.profiling_ms,
            "columns": [
                {
                    "name": c.name,
                    "dtype": c.dtype,
                    "count": c.count,
                    "missing_pct": round(c.missing_pct, 2),
                    "unique_pct": round(c.unique_pct, 2),
                    "outlier_pct": round(c.outlier_pct, 2),
                    "is_numeric": c.is_numeric,
                    "is_datetime": c.is_datetime,
                    "is_categorical": c.is_categorical,
                }
                for c in self.columns
            ],
        }


# ─────────────────────────────────────────────────────────────
# Quality Score
# ─────────────────────────────────────────────────────────────

@dataclass
class QualityScore:
    """Quality metrics for a dataset (0.0 - 100.0)."""
    completeness: float = 100.0   # % non-missing cells
    validity: float = 100.0       # % passing validation rules
    consistency: float = 100.0    # % cross-column consistency
    uniqueness: float = 100.0     # % unique rows
    timeliness: float = 100.0     # % data freshness
    accuracy: float = 100.0       # estimated accuracy (heuristic)

    @property
    def overall(self) -> float:
        """Weighted average of all dimensions."""
        weights = {
            "completeness": 0.25,
            "validity": 0.25,
            "consistency": 0.15,
            "uniqueness": 0.15,
            "timeliness": 0.10,
            "accuracy": 0.10,
        }
        score = (
            self.completeness * weights["completeness"]
            + self.validity * weights["validity"]
            + self.consistency * weights["consistency"]
            + self.uniqueness * weights["uniqueness"]
            + self.timeliness * weights["timeliness"]
            + self.accuracy * weights["accuracy"]
        )
        return round(score, 2)

    def to_dict(self) -> dict:
        return {
            "completeness": self.completeness,
            "validity": self.validity,
            "consistency": self.consistency,
            "uniqueness": self.uniqueness,
            "timeliness": self.timeliness,
            "accuracy": self.accuracy,
            "overall": self.overall,
        }


# ─────────────────────────────────────────────────────────────
# Audit Entry
# ─────────────────────────────────────────────────────────────

@dataclass
class AuditEntry:
    """Structured audit record for a single module execution."""
    module_name: str
    module_version: str = "1.0.0"
    execution_ms: int = 0
    rows_before: int = 0
    rows_after: int = 0
    rows_modified: int = 0
    columns_before: int = 0
    columns_after: int = 0
    warnings: list = field(default_factory=list)
    errors: list = field(default_factory=list)
    metadata: dict = field(default_factory=dict)
    timestamp: Optional[datetime] = None

    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.utcnow()
        self.rows_modified = abs(self.rows_before - self.rows_after)

    def to_dict(self) -> dict:
        return {
            "module": self.module_name,
            "version": self.module_version,
            "execution_ms": self.execution_ms,
            "rows_before": self.rows_before,
            "rows_after": self.rows_after,
            "rows_modified": self.rows_modified,
            "columns_before": self.columns_before,
            "columns_after": self.columns_after,
            "warnings": self.warnings,
            "errors": self.errors,
            "metadata": self.metadata,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
        }


# ─────────────────────────────────────────────────────────────
# Recommendation
# ─────────────────────────────────────────────────────────────

@dataclass
class Recommendation:
    """Actionable recommendation from the AI recommender."""
    priority: str = "INFO"  # CRITICAL, HIGH, MEDIUM, LOW, INFO
    category: str = "general"  # cleaning, validation, enrichment, monitoring
    title: str = ""
    description: str = ""
    rule_name: Optional[str] = None
    affected_columns: list = field(default_factory=list)
    confidence: float = 0.0

    def to_dict(self) -> dict:
        return {
            "priority": self.priority,
            "category": self.category,
            "title": self.title,
            "description": self.description,
            "rule_name": self.rule_name,
            "affected_columns": self.affected_columns,
            "confidence": self.confidence,
        }


# ─────────────────────────────────────────────────────────────
# Explanation
# ─────────────────────────────────────────────────────────────

@dataclass
class Explanation:
    """Explain why a specific data point was flagged."""
    column: str
    row_index: int
    rule_name: str
    actual_value: Any
    expected_value: Any
    message: str = ""
    confidence: float = 0.0

    def to_dict(self) -> dict:
        return {
            "column": self.column,
            "row_index": self.row_index,
            "rule_name": self.rule_name,
            "actual_value": str(self.actual_value),
            "expected_value": str(self.expected_value),
            "message": self.message,
            "confidence": self.confidence,
        }


# ─────────────────────────────────────────────────────────────
# Silver Context (pass-through state)
# ─────────────────────────────────────────────────────────────

@dataclass
class SilverContext:
    """Central context object passed through the entire Silver pipeline.

    Every module receives this context, reads from it or writes to it,
    and passes it to the next module. This is the single source of truth
    for all pipeline state.

    Thread-safe by design — no global state, pure data object.
    """
    # Identity
    tenant_id: Optional[int] = None
    pipeline_id: Optional[int] = None
    run_id: Optional[int] = None
    mode: str = "full"  # full | quick | validate_only

    # Profiling
    profile: Optional[DataProfile] = None
    dataset_class: Optional[str] = None  # iot, finance, sales, erp, hr, general
    class_confidence: float = 0.0

    # Quality
    quality_score: Optional[QualityScore] = None

    # Audit
    audit_trail: list = field(default_factory=list)  # list[AuditEntry]
    module_timings: dict = field(default_factory=dict)

    # Warnings & Errors
    warnings: list = field(default_factory=list)
    errors: list = field(default_factory=list)

    # AI
    recommendations: list = field(default_factory=list)  # list[Recommendation]
    explanations: list = field(default_factory=list)  # list[Explanation]

    # Rules
    active_rules_file: Optional[str] = None  # path to YAML file used
    loaded_rules: dict = field(default_factory=dict)

    def add_audit(self, entry: AuditEntry) -> None:
        self.audit_trail.append(entry)

    def add_warning(self, msg: str) -> None:
        self.warnings.append(msg)

    def add_error(self, msg: str) -> None:
        self.errors.append(msg)

    def add_recommendation(self, rec: Recommendation) -> None:
        self.recommendations.append(rec)

    def add_explanation(self, exp: Explanation) -> None:
        self.explanations.append(exp)

    def to_dict(self) -> dict:
        return {
            "tenant_id": self.tenant_id,
            "pipeline_id": self.pipeline_id,
            "run_id": self.run_id,
            "mode": self.mode,
            "dataset_class": self.dataset_class,
            "class_confidence": self.class_confidence,
            "profile": self.profile.to_dict() if self.profile else None,
            "quality_score": self.quality_score.to_dict() if self.quality_score else None,
            "audit_trail": [a.to_dict() for a in self.audit_trail],
            "module_timings": self.module_timings,
            "warnings": self.warnings,
            "errors": self.errors,
            "recommendations": [r.to_dict() for r in self.recommendations],
            "explanations": [e.to_dict() for e in self.explanations],
            "active_rules_file": self.active_rules_file,
        }
