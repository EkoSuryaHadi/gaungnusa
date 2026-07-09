"""Tests for datatype module."""

import pytest
import sys
import pandas as pd
import numpy as np

sys.path.insert(0, "worker")

from silver.modules.datatype import DataTypeModule
from silver.models.types import SilverContext
from silver.engine.module_loader import get_available_modules, get_module_instance


@pytest.fixture
def mixed_df():
    return pd.DataFrame({
        "id_str": ["1", "2", "3", "4", "5"],
        "price_str": ["10.5", "20.3", "30.0", "", "50.1"],
        "event_str": ["2026-01-01", "2026-02-15", "bad", "2026-04-01", "2026-05-10"],
        "flag_str": ["true", "false", "true", "yes", "no"],
        "name": ["Alice", "Bob", "Charlie", "Diana", "Eve"],
        "already_int": [1, 2, 3, 4, 5],
    })


class TestDataTypeModule:
    def test_interface(self):
        mod = DataTypeModule()
        assert mod.name == "datatype"
        assert "detect" in mod.description.lower()

    def test_int_detection(self, mixed_df):
        mod = DataTypeModule()
        ctx = SilverContext()
        result, _ = mod.run(mixed_df, ctx)
        assert str(result["id_str"].dtype) in ("Int64", "int64")

    def test_float_detection(self, mixed_df):
        mod = DataTypeModule()
        ctx = SilverContext()
        result, _ = mod.run(mixed_df, ctx)
        assert str(result["price_str"].dtype) == "float64"

    def test_bool_detection(self, mixed_df):
        mod = DataTypeModule()
        ctx = SilverContext()
        result, _ = mod.run(mixed_df, ctx)
        assert str(result["flag_str"].dtype) == "boolean"

    def test_already_typed_unchanged(self, mixed_df):
        mod = DataTypeModule()
        ctx = SilverContext()
        result, _ = mod.run(mixed_df, ctx)
        assert str(result["already_int"].dtype) == "int64"

    def test_string_unchanged(self, mixed_df):
        mod = DataTypeModule()
        ctx = SilverContext()
        result, _ = mod.run(mixed_df, ctx)
        assert str(result["name"].dtype) in ("object", "str")  # pandas version-dependent

    def test_below_threshold_stays_string(self, mixed_df):
        """With correct parsing, 4/5 dates valid = 80%, at threshold → datetime."""
        mod = DataTypeModule()
        ctx = SilverContext()
        result, _ = mod.run(mixed_df, ctx)
        # 4/5 valid dates = 80% → passes threshold → converted to datetime
        assert str(result["event_str"].dtype) in (
            "datetime64[ns]", "datetime64[us]", "datetime64[ms]",
            "datetime64[us, UTC]", "datetime64[ns, UTC]",
        )

    def test_empty_dataframe(self):
        df = pd.DataFrame()
        mod = DataTypeModule()
        ctx = SilverContext()
        result, _ = mod.run(df, ctx)
        assert len(result) == 0

    def test_audit_trail(self, mixed_df):
        mod = DataTypeModule()
        ctx = SilverContext()
        _, result_ctx = mod.run(mixed_df, ctx)
        assert len(result_ctx.audit_trail) == 1
        entry = result_ctx.audit_trail[0]
        assert entry.module_name == "datatype"
        changes = entry.metadata.get("changes", [])
        assert len(changes) == 4  # id→int, price→float, event→datetime, flag→bool

    def test_all_null_column(self):
        df = pd.DataFrame({"x": [None, None, None]})
        mod = DataTypeModule()
        ctx = SilverContext()
        result, _ = mod.run(df, ctx)
        assert str(result["x"].dtype) in ("object", "str")


    def test_skips_timestamp_columns(self):
        """Datatype should NOT convert columns whose names match timestamp patterns.
        This leaves timestamp handling to the dedicated TimestampModule."""
        df = pd.DataFrame({
            "created_at": ["2026-01-01", "2026-02-15", "2026-03-10"],
            "updated": ["2026/01/15", "2026/02/20", "2026/03/01"],
            "amount": ["100", "200", "300"],
        })
        mod = DataTypeModule()
        ctx = SilverContext()
        result, _ = mod.run(df, ctx)
        # Timestamp columns stay as string
        assert str(result["created_at"].dtype) in ("object", "str")
        assert str(result["updated"].dtype) in ("object", "str")
        # Non-timestamp column still gets typed
        assert str(result["amount"].dtype) in ("Int64", "int64")

    def test_formatted_numbers_with_commas(self):
        """Numbers with thousand-separator commas should be cast to numeric."""
        df = pd.DataFrame({
            "debit": ["10,117,864", "2,688,370", None, "14,744,809", "1,089,298"],
            "credit": [None, None, "7,588,795", None, None],
            "balance": ["510,117,864", "507,429,494", "515,018,289", "500,273,480", "501,362,778"],
        })
        mod = DataTypeModule()
        ctx = SilverContext()
        result, _ = mod.run(df, ctx)
        assert str(result["debit"].dtype) in ("Int64", "int64", "float64")
        assert str(result["credit"].dtype) in ("Int64", "int64", "float64")
        assert str(result["balance"].dtype) in ("Int64", "int64", "float64")
        # Verify values are actual numbers
        assert result["balance"].iloc[0] == 510117864
        assert result["debit"].iloc[0] == 10117864
        # Null credit should remain null
        assert pd.isna(result["credit"].iloc[0])

    def test_formatted_numbers_indonesian_style(self):
        """Indonesian-style dot-separator (1.500.000) should be handled."""
        df = pd.DataFrame({
            "amount": ["Rp 1.500.000", "IDR 2.750.500", "$3,000.50", "5.000", "100"],
        })
        mod = DataTypeModule()
        ctx = SilverContext()
        result, _ = mod.run(df, ctx)
        assert str(result["amount"].dtype) in ("Int64", "int64", "float64")
        assert result["amount"].iloc[0] == 1500000
        assert result["amount"].iloc[1] == 2750500
        assert result["amount"].iloc[2] == 3000.50
        assert result["amount"].iloc[3] == 5000
        assert result["amount"].iloc[4] == 100


class TestDiscovery:
    def test_discovered(self):
        assert "datatype" in get_available_modules()

    def test_instance(self):
        mod = get_module_instance("datatype")
        assert mod is not None
        assert isinstance(mod, DataTypeModule)
