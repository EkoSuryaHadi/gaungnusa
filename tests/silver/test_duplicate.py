"""Tests for duplicate module."""

import pytest
import sys
import pandas as pd

sys.path.insert(0, "worker")
from silver.modules.duplicate import DuplicateModule
from silver.models.types import SilverContext
from silver.engine.module_loader import get_available_modules


@pytest.fixture
def dup_df():
    return pd.DataFrame({"a": [1, 2, 1, 3, 2], "b": ["x", "y", "x", "z", "y"], "c": [10, 20, 10, 30, 20]})


class TestDuplicateModule:
    def test_flag_mode(self, dup_df):
        ctx = SilverContext()
        r, c = DuplicateModule().run(dup_df, ctx)
        assert "_is_duplicate" in r.columns
        assert r["_is_duplicate"].sum() == 2
        assert len(r) == 5  # unchanged

    def test_drop_mode(self, dup_df):
        ctx = SilverContext()
        ctx.duplicate_mode = "drop"
        r, c = DuplicateModule().run(dup_df, ctx)
        assert len(r) == 3

    def test_subset(self, dup_df):
        ctx = SilverContext()
        ctx.duplicate_subset = ["a"]
        r, c = DuplicateModule().run(dup_df, ctx)
        assert r["_is_duplicate"].sum() == 2

    def test_no_duplicates(self):
        df = pd.DataFrame({"a": [1, 2, 3]})
        ctx = SilverContext()
        r, c = DuplicateModule().run(df, ctx)
        assert "_is_duplicate" not in r.columns  # nothing flagged
        assert c.audit_trail[0].metadata["duplicates_found"] == 0

    def test_audit(self, dup_df):
        ctx = SilverContext()
        _, c = DuplicateModule().run(dup_df, ctx)
        assert c.audit_trail[0].module_name == "duplicate"
        assert c.audit_trail[0].metadata["duplicates_found"] == 2


class TestDiscovery:
    def test_discovered(self):
        assert "duplicate" in get_available_modules()
