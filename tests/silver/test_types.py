"""Tests for Silver data types (models/types.py)."""

import pytest
from datetime import datetime

# Add worker to path for imports
import sys
sys.path.insert(0, "worker")

from silver.models.types import (
    DataProfile,
    ColumnStat,
    QualityScore,
    AuditEntry,
    Recommendation,
    Explanation,
    SilverContext,
)


class TestDataProfile:
    def test_defaults(self):
        p = DataProfile()
        assert p.total_rows == 0
        assert p.total_columns == 0
        assert p.columns == []

    def test_to_dict(self):
        p = DataProfile(total_rows=100, total_columns=5, missing_cells=10)
        d = p.to_dict()
        assert d["total_rows"] == 100
        assert d["total_columns"] == 5
        assert d["missing_cells"] == 10
        assert d["missing_pct"] == 0.0  # not auto-calculated

    def test_column_stat(self):
        c = ColumnStat(
            name="temperature",
            dtype="float64",
            count=1000,
            missing_count=50,
            unique_count=900,
            outlier_count=20,
            is_numeric=True,  # set explicitly by profiling module
        )
        assert c.name == "temperature"
        assert c.missing_pct == 0.0  # not auto-calculated
        assert c.is_numeric is True


class TestQualityScore:
    def test_perfect_score(self):
        q = QualityScore()
        assert q.completeness == 100.0
        assert q.overall == 100.0

    def test_partial_score(self):
        q = QualityScore(
            completeness=80.0,
            validity=90.0,
            consistency=100.0,
            uniqueness=100.0,
            timeliness=100.0,
            accuracy=100.0,
        )
        assert 90.0 < q.overall < 95.0  # weighted

    def test_to_dict(self):
        q = QualityScore(completeness=95.0)
        d = q.to_dict()
        assert "completeness" in d
        assert "overall" in d


class TestAuditEntry:
    def test_basic(self):
        a = AuditEntry(
            module_name="duplicate",
            rows_before=100,
            rows_after=95,
        )
        assert a.module_name == "duplicate"
        assert a.rows_modified == 5
        assert a.timestamp is not None

    def test_to_dict(self):
        a = AuditEntry(module_name="test", rows_before=10, rows_after=9)
        d = a.to_dict()
        assert d["module"] == "test"
        assert d["rows_modified"] == 1


class TestSilverContext:
    def test_initial(self):
        ctx = SilverContext(tenant_id=1, pipeline_id=2)
        assert ctx.tenant_id == 1
        assert ctx.pipeline_id == 2
        assert ctx.audit_trail == []

    def test_add_audit(self):
        ctx = SilverContext()
        ctx.add_audit(AuditEntry(module_name="profiling", rows_before=0, rows_after=0))
        assert len(ctx.audit_trail) == 1

    def test_add_warning(self):
        ctx = SilverContext()
        ctx.add_warning("test warning")
        assert ctx.warnings == ["test warning"]

    def test_add_recommendation(self):
        ctx = SilverContext()
        rec = Recommendation(title="Test", description="desc")
        ctx.add_recommendation(rec)
        assert len(ctx.recommendations) == 1

    def test_add_explanation(self):
        ctx = SilverContext()
        exp = Explanation(
            column="temp", row_index=5, rule_name="range",
            actual_value=200, expected_value="-40 to 125",
            message="Out of range"
        )
        ctx.add_explanation(exp)
        assert len(ctx.explanations) == 1
        assert ctx.explanations[0].actual_value == 200

    def test_to_dict(self):
        ctx = SilverContext(tenant_id=1, dataset_class="iot")
        ctx.add_audit(AuditEntry(module_name="test", rows_before=10, rows_after=9))
        ctx.add_recommendation(Recommendation(title="R1"))
        d = ctx.to_dict()
        assert d["tenant_id"] == 1
        assert d["dataset_class"] == "iot"
        assert len(d["audit_trail"]) == 1
        assert len(d["recommendations"]) == 1
