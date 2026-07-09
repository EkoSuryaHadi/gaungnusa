"""Tests for missing, outlier, validation, enrichment modules."""

import pytest, sys, pandas as pd, numpy as np
sys.path.insert(0, "worker")
from silver.modules.missing import MissingModule
from silver.modules.outlier import OutlierModule
from silver.modules.validation import ValidationModule
from silver.modules.enrichment import EnrichmentModule
from silver.models.types import SilverContext
from silver.engine.module_loader import get_available_modules


class TestMissingModule:
    def test_flag(self):
        df = pd.DataFrame({"a": [1, None, 3], "b": ["x", "y", None]})
        ctx = SilverContext()
        r, c = MissingModule().run(df, ctx)
        assert "_missing_count" in r.columns
        assert r["_missing_count"].sum() == 2

    def test_drop(self):
        df = pd.DataFrame({"a": [1, None, 3]})
        ctx = SilverContext()
        ctx.missing_strategy = "drop"
        r, _ = MissingModule().run(df, ctx)
        assert len(r) == 2

    def test_fill_mean(self):
        df = pd.DataFrame({"a": [1.0, None, 3.0]})
        ctx = SilverContext()
        ctx.missing_strategy = "fill_mean"
        r, _ = MissingModule().run(df, ctx)
        assert r["a"].isna().sum() == 0
        assert r["a"].iloc[1] == 2.0

    def test_no_missing(self):
        df = pd.DataFrame({"a": [1, 2, 3]})
        ctx = SilverContext()
        r, _ = MissingModule().run(df, ctx)
        assert "_missing_count" not in r.columns


class TestOutlierModule:
    def test_iqr_flag(self):
        np.random.seed(42)
        df = pd.DataFrame({"x": [1, 2, 3, 4, 100]})  # 100 is outlier
        ctx = SilverContext()
        r, c = OutlierModule().run(df, ctx)
        assert r["_outlier_count"].sum() == 1

    def test_no_outliers(self):
        df = pd.DataFrame({"x": [1, 2, 3, 4, 5]})
        ctx = SilverContext()
        r, _ = OutlierModule().run(df, ctx)
        assert "_outlier_count" not in r.columns

    def test_drop_mode(self):
        df = pd.DataFrame({"x": [1, 2, 3, 4, 100]})
        ctx = SilverContext()
        ctx.outlier_mode = "drop"
        r, _ = OutlierModule().run(df, ctx)
        assert len(r) == 4


class TestValidationModule:
    def test_range_rule(self):
        df = pd.DataFrame({"temp": [20, 30, 200, 25]})
        ctx = SilverContext()
        ctx.loaded_rules = {"temp": {"min": 0, "max": 100}}
        r, c = ValidationModule().run(df, ctx)
        assert "_temp_violation" in r.columns
        assert c.audit_trail[0].metadata["total_violations"] == 1

    def test_no_rules(self):
        df = pd.DataFrame({"x": [1, 2, 3]})
        ctx = SilverContext()
        r, _ = ValidationModule().run(df, ctx)
        # No violations because no rules
        assert len(r) == 3

    def test_enum_rule(self):
        df = pd.DataFrame({"status": ["ACTIVE", "INACTIVE", "UNKNOWN"]})
        ctx = SilverContext()
        ctx.loaded_rules = {"status": {"values": ["ACTIVE", "INACTIVE"]}}
        r, c = ValidationModule().run(df, ctx)
        assert c.audit_trail[0].metadata["total_violations"] == 1


class TestEnrichmentModule:
    def test_mapping(self):
        df = pd.DataFrame({"dept": ["SALES", "ENG", "HR"]})
        ctx = SilverContext()
        ctx.enrichment_mappings = {"dept": {"SALES": "Sales Department", "ENG": "Engineering", "HR": "Human Resources"}}
        r, c = EnrichmentModule().run(df, ctx)
        assert "dept_enriched" in r.columns
        assert r["dept_enriched"].iloc[0] == "Sales Department"


class TestModuleDiscovery:
    def test_all_discovered(self):
        modules = get_available_modules()
        for name in ["profiling", "datatype", "timestamp", "duplicate", "missing", "outlier", "validation", "enrichment"]:
            assert name in modules, f"{name} not discovered"
