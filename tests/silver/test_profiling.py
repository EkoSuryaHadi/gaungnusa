"""Tests for profiling module."""

import pytest
import sys
import pandas as pd
import numpy as np

sys.path.insert(0, "worker")

from silver.modules.profiling import ProfilingModule
from silver.models.types import SilverContext
from silver.engine.module_loader import discover_modules, get_module_instance, get_available_modules


# ── Test Data ────────────────────────────────────────────────

@pytest.fixture
def sample_df():
    np.random.seed(42)
    df = pd.DataFrame({
        "id": range(1, 101),
        "name": ["Item_" + str(i) for i in range(1, 101)],
        "price": np.random.uniform(10, 500, 100),
        "qty": np.random.randint(1, 50, 100),
        "category": np.random.choice(["A", "B", "C"], 100),
        "date": pd.date_range("2026-01-01", periods=100, freq="D"),
    })
    # Add nulls
    df.loc[0, "price"] = np.nan
    df.loc[5, "qty"] = np.nan
    df.loc[10, "category"] = np.nan
    return df


@pytest.fixture
def empty_df():
    return pd.DataFrame()


@pytest.fixture
def single_col_df():
    return pd.DataFrame({"x": [1, 2, 3]})


# ── Tests ────────────────────────────────────────────────────

class TestProfilingModule:
    def test_interface(self):
        mod = ProfilingModule()
        assert mod.name == "profiling"
        assert mod.version == "1.0.0"
        assert "comprehensive" in mod.description.lower()

    def test_basic_profile(self, sample_df):
        mod = ProfilingModule()
        ctx = SilverContext()
        result_df, result_ctx = mod.run(sample_df, ctx)

        # Data unchanged
        assert len(result_df) == 100
        assert list(result_df.columns) == list(sample_df.columns)

        # Profile populated
        p = result_ctx.profile
        assert p is not None
        assert p.total_rows == 100
        assert p.total_columns == 6
        assert p.total_cells == 600
        assert p.missing_cells == 3
        assert p.missing_pct == 0.5  # 3/600 = 0.5%

    def test_null_detection(self, sample_df):
        mod = ProfilingModule()
        ctx = SilverContext()
        _, result_ctx = mod.run(sample_df, ctx)
        p = result_ctx.profile
        # price has 1 null, qty has 1 null, category has 1 null
        price_stat = [c for c in p.columns if c.name == "price"][0]
        assert price_stat.missing_count == 1

    def test_numeric_detection(self, sample_df):
        mod = ProfilingModule()
        ctx = SilverContext()
        _, result_ctx = mod.run(sample_df, ctx)
        p = result_ctx.profile

        price_stat = [c for c in p.columns if c.name == "price"][0]
        assert price_stat.is_numeric is True
        assert price_stat.min_val is not None
        assert price_stat.max_val is not None

    def test_string_detection(self, sample_df):
        mod = ProfilingModule()
        ctx = SilverContext()
        _, result_ctx = mod.run(sample_df, ctx)
        p = result_ctx.profile

        name_stat = [c for c in p.columns if c.name == "name"][0]
        assert name_stat.is_numeric is False

    def test_empty_dataframe(self, empty_df):
        mod = ProfilingModule()
        ctx = SilverContext()
        result_df, result_ctx = mod.run(empty_df, ctx)

        p = result_ctx.profile
        assert p.total_rows == 0
        assert p.total_columns == 0
        # Should not crash

    def test_audit_trail(self, sample_df):
        mod = ProfilingModule()
        ctx = SilverContext()
        _, result_ctx = mod.run(sample_df, ctx)

        assert len(result_ctx.audit_trail) == 1
        entry = result_ctx.audit_trail[0]
        assert entry.module_name == "profiling"
        assert entry.rows_before == 100
        assert entry.rows_after == 100  # profiling doesn't modify data
        assert entry.execution_ms > 0

    def test_dtypes_summary(self, sample_df):
        mod = ProfilingModule()
        ctx = SilverContext()
        _, result_ctx = mod.run(sample_df, ctx)
        p = result_ctx.profile

        # 3 numeric (id, price, qty), 1 datetime (date), 2 string (name, category)
        summary = p.dtypes_summary
        assert summary["numeric"] == 3
        assert summary["datetime"] == 1
        assert summary["string"] == 2

    def test_to_dict(self, sample_df):
        mod = ProfilingModule()
        ctx = SilverContext()
        _, result_ctx = mod.run(sample_df, ctx)

        d = result_ctx.profile.to_dict()
        assert d["total_rows"] == 100
        assert d["total_columns"] == 6
        assert "columns" in d
        assert len(d["columns"]) == 6

    def test_context_not_mutated(self, sample_df):
        """Context should accumulate, not replace."""
        mod = ProfilingModule()
        ctx = SilverContext()
        ctx.add_warning("pre-existing warning")

        _, result_ctx = mod.run(sample_df, ctx)
        # Pre-existing warning should still be there
        assert "pre-existing warning" in result_ctx.warnings


# ── Module Discovery Test ────────────────────────────────────

class TestModuleDiscovery:
    def test_profiling_discovered(self):
        """Profiling module should be auto-discovered."""
        modules = get_available_modules()
        assert "profiling" in modules

    def test_get_instance(self):
        mod = get_module_instance("profiling")
        assert mod is not None
        assert isinstance(mod, ProfilingModule)

    def test_discover_returns_dict(self):
        registry = discover_modules()
        assert isinstance(registry, dict)
        assert "profiling" in registry
