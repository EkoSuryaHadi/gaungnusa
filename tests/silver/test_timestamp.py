"""Tests for timestamp module."""

import pytest
import sys
import pandas as pd

sys.path.insert(0, "worker")

from silver.modules.timestamp import TimestampModule
from silver.models.types import SilverContext
from silver.engine.module_loader import get_available_modules, get_module_instance


@pytest.fixture
def ts_df():
    return pd.DataFrame({
        "created": ["2026-01-15 10:30:00", "2026-02-20 14:00:00", "bad", "2026-03-10", "2026-04-05"],
        "updated": ["2026/01/15", "2026/02/20", "2026/03/10", None, "2026/05/01"],
        "unix_sec": [1736899200, 1737500000, 1738000000, 1738500000, 1739000000],
        "already_dt": pd.date_range("2026-01-01", periods=5, freq="D"),
        "normal_int": [100, 200, 300, 400, 500],
        "name": ["Alice", "Bob", "Charlie", "Diana", "Eve"],
    })


class TestTimestampModule:
    def test_interface(self):
        mod = TimestampModule()
        assert mod.name == "timestamp"
        assert "datetime" in mod.description.lower()

    def test_string_to_datetime(self, ts_df):
        mod = TimestampModule()
        ctx = SilverContext()
        result, _ = mod.run(ts_df, ctx)
        assert pd.api.types.is_datetime64_any_dtype(result["updated"])

    def test_already_datetime_normalized(self, ts_df):
        mod = TimestampModule()
        ctx = SilverContext()
        result, _ = mod.run(ts_df, ctx)
        assert pd.api.types.is_datetime64_any_dtype(result["already_dt"])
        # Should be UTC
        assert result["already_dt"].dt.tz is not None

    def test_unix_seconds_converted(self, ts_df):
        mod = TimestampModule()
        ctx = SilverContext()
        result, _ = mod.run(ts_df, ctx)
        assert "datetime" in str(result["unix_sec"].dtype)

    def test_normal_int_unchanged(self, ts_df):
        mod = TimestampModule()
        ctx = SilverContext()
        result, _ = mod.run(ts_df, ctx)
        assert pd.api.types.is_integer_dtype(result["normal_int"])

    def test_name_column_unchanged(self, ts_df):
        mod = TimestampModule()
        ctx = SilverContext()
        result, _ = mod.run(ts_df, ctx)
        assert not pd.api.types.is_datetime64_any_dtype(result["name"])

    def test_audit_trail(self, ts_df):
        mod = TimestampModule()
        ctx = SilverContext()
        _, result_ctx = mod.run(ts_df, ctx)
        assert len(result_ctx.audit_trail) == 1
        entry = result_ctx.audit_trail[0]
        assert entry.module_name == "timestamp"
        normalized = entry.metadata.get("normalized", [])
        assert len(normalized) >= 2  # updated + unix_sec

    def test_empty_df(self):
        df = pd.DataFrame()
        mod = TimestampModule()
        ctx = SilverContext()
        result, _ = mod.run(df, ctx)
        assert len(result) == 0


class TestDiscovery:
    def test_discovered(self):
        assert "timestamp" in get_available_modules()

    def test_instance(self):
        mod = get_module_instance("timestamp")
        assert mod is not None
        assert isinstance(mod, TimestampModule)
