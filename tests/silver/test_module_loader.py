"""Tests for BaseModule and ModuleLoader."""

import pytest
import sys
import pandas as pd

sys.path.insert(0, "worker")

from silver.modules.base import BaseModule
from silver.models.types import SilverContext, AuditEntry
from silver.engine.module_loader import (
    discover_modules,
    get_available_modules,
    get_module_instance,
    get_modules_for_dataset,
    load_rules,
    list_available_rules,
    reload_rules,
)


# ── Test Module Implementation ──────────────────────────────

class TestModule(BaseModule):
    name = "test_module"
    version = "1.0.0"
    description = "Test module for unit tests"

    def run(self, df, ctx):
        before = len(df)
        df = df.copy()
        df["_test_flag"] = True
        after = len(df)
        ctx.add_audit(AuditEntry(
            module_name=self.name,
            rows_before=before,
            rows_after=after,
            warnings=["test run complete"],
        ))
        return df, ctx


class FailingModule(BaseModule):
    name = "failing"
    version = "1.0.0"
    description = "Always fails"

    def run(self, df, ctx):
        raise RuntimeError("Intentional failure for testing")


# ── Tests ───────────────────────────────────────────────────

class TestBaseModule:
    def test_interface(self):
        mod = TestModule()
        assert mod.name == "test_module"
        assert mod.version == "1.0.0"

        df = pd.DataFrame({"a": [1, 2, 3]})
        ctx = SilverContext()
        result_df, result_ctx = mod.run(df, ctx)

        assert "_test_flag" in result_df.columns
        assert len(result_ctx.audit_trail) == 1
        assert result_ctx.audit_trail[0].module_name == "test_module"

    def test_empty_dataframe(self):
        mod = TestModule()
        df = pd.DataFrame()
        result_df, ctx = mod.run(df, SilverContext())
        # Should not crash
        assert isinstance(result_df, pd.DataFrame)

    def test_repr(self):
        mod = TestModule()
        assert "test_module" in repr(mod)
        assert "1.0.0" in repr(mod)


class TestModuleLoader:
    def test_get_available_modules_empty(self):
        # Initially no modules registered (real modules not created yet)
        reload_rules()
        modules = get_available_modules()
        # Will be empty until we create actual module files
        assert isinstance(modules, list)

    def test_list_available_rules_empty(self):
        reload_rules()
        rules = list_available_rules()
        assert isinstance(rules, list)
        # Will be empty until we create YAML files

    def test_get_module_instance_nonexistent(self):
        mod = get_module_instance("nonexistent_module_xyz")
        assert mod is None

    def test_get_modules_for_dataset_default(self):
        modules = get_modules_for_dataset("general")
        # Empty because no modules registered yet
        assert isinstance(modules, list)

    def test_get_modules_for_dataset_iot(self):
        modules = get_modules_for_dataset("iot")
        assert isinstance(modules, list)
        # Will be populated after modules are created
