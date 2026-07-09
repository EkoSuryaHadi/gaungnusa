"""Test suite for Phase 3.2: Audit Logging Utility.

Tests:
    - log_audit() direct audit creation
    - audit_ctx() context manager
    - audit_logged() decorator
    - get_audit_summary()
    - Error handling / exception audit
    - Integration with modules
"""

import pytest, pandas as pd

from silver.models.types import SilverContext, AuditEntry
from silver.utils.logging import log_audit, audit_ctx, audit_logged, get_audit_summary


# ─────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────

@pytest.fixture
def ctx():
    return SilverContext()


@pytest.fixture
def sample_df():
    return pd.DataFrame({"x": [1, 2, 3], "y": [4, 5, 6]})


# ─────────────────────────────────────────────────────────────
# 1. log_audit() — direct audit creation
# ─────────────────────────────────────────────────────────────

def test_log_audit_basic(ctx):
    entry = log_audit(ctx, "test_module", rows_before=100, rows_after=95)
    assert len(ctx.audit_trail) == 1
    assert entry.module_name == "test_module"
    assert entry.rows_before == 100
    assert entry.rows_after == 95
    assert entry.rows_modified == 5


def test_log_audit_with_metadata(ctx):
    log_audit(ctx, "enrichment", rows_before=500, rows_after=500,
              new_columns=2, source="lookup_table")
    entry = ctx.audit_trail[0]
    assert entry.metadata["new_columns"] == 2
    assert entry.metadata["source"] == "lookup_table"


def test_log_audit_with_warnings(ctx):
    log_audit(ctx, "cleaner", rows_before=100, rows_after=90,
              warnings=["10 rows had null values", "2 rows had invalid format"])
    entry = ctx.audit_trail[0]
    assert len(entry.warnings) == 2
    assert "10 rows" in entry.warnings[0]


def test_log_audit_with_errors(ctx):
    log_audit(ctx, "loader", rows_before=0, rows_after=0,
              errors=["File not found", "Permission denied"])
    entry = ctx.audit_trail[0]
    assert len(entry.errors) == 2


def test_log_audit_timestamp_auto(ctx):
    entry = log_audit(ctx, "test", rows_before=10, rows_after=10)
    assert entry.timestamp is not None


def test_log_audit_multiple(ctx):
    log_audit(ctx, "module_a", rows_before=100, rows_after=90)
    log_audit(ctx, "module_b", rows_before=90, rows_after=85)
    log_audit(ctx, "module_c", rows_before=85, rows_after=80)
    assert len(ctx.audit_trail) == 3
    assert ctx.audit_trail[0].module_name == "module_a"
    assert ctx.audit_trail[2].module_name == "module_c"


# ─────────────────────────────────────────────────────────────
# 2. audit_ctx() — context manager
# ─────────────────────────────────────────────────────────────

def test_audit_ctx_basic(ctx, sample_df):
    with audit_ctx(ctx, "transform") as audit:
        result = sample_df.copy()
        result["z"] = result["x"] + result["y"]
        audit["rows_before"] = len(sample_df)
        audit["rows_after"] = len(result)
        audit["columns_before"] = len(sample_df.columns)
        audit["columns_after"] = len(result.columns)

    assert len(ctx.audit_trail) == 1
    entry = ctx.audit_trail[0]
    assert entry.module_name == "transform"
    assert entry.rows_before == 3
    assert entry.rows_after == 3
    assert entry.columns_before == 2
    assert entry.columns_after == 3
    assert entry.execution_ms >= 0


def test_audit_ctx_auto_timing(ctx):
    """Context manager always records execution time."""
    with audit_ctx(ctx, "slow_op") as audit:
        # simulate some work
        total = sum(range(1000))
        audit["rows_before"] = 1
        audit["rows_after"] = 1

    entry = ctx.audit_trail[0]
    assert entry.execution_ms >= 0
    assert entry.module_name == "slow_op"


def test_audit_ctx_exception_creates_audit(ctx):
    """Exception inside context manager still creates audit entry."""
    try:
        with audit_ctx(ctx, "failing_op") as audit:
            audit["rows_before"] = 10
            raise ValueError("Something broke")
    except ValueError:
        pass

    assert len(ctx.audit_trail) == 1
    entry = ctx.audit_trail[0]
    assert entry.module_name == "failing_op"
    assert len(entry.errors) == 1
    assert "ValueError" in entry.errors[0]


def test_audit_ctx_exception_propagates(ctx):
    """The original exception re-raises after auditing."""
    with pytest.raises(ValueError, match="Something broke"):
        with audit_ctx(ctx, "failing_op") as audit:
            audit["rows_before"] = 10
            raise ValueError("Something broke")


def test_audit_ctx_metadata(ctx):
    with audit_ctx(ctx, "cleanup", phase="post", batch_id=42) as audit:
        audit["rows_before"] = 100
        audit["rows_after"] = 98

    entry = ctx.audit_trail[0]
    assert entry.metadata["phase"] == "post"
    assert entry.metadata["batch_id"] == 42


# ─────────────────────────────────────────────────────────────
# 3. audit_logged() — decorator
# ─────────────────────────────────────────────────────────────

def test_audit_logged_decorator_basic(ctx):
    @audit_logged("my_cleaner")
    def clean_df(df, ctx):
        return df.dropna(), ctx

    df = pd.DataFrame({"a": [1, None, 3], "b": [4, 5, None]})
    result_df, result_ctx = clean_df(df, ctx)

    assert len(result_ctx.audit_trail) == 1
    entry = result_ctx.audit_trail[0]
    assert entry.module_name == "my_cleaner"
    assert entry.rows_before == 3
    assert entry.rows_after == 1  # only 1 complete row
    assert entry.metadata["status"] == "success"


def test_audit_logged_decorator_failure(ctx):
    @audit_logged("broken_loader")
    def failing_load(df, ctx):
        raise RuntimeError("Cannot load")

    df = pd.DataFrame({"x": [1, 2, 3]})
    with pytest.raises(RuntimeError):
        failing_load(df, ctx)

    assert len(ctx.audit_trail) == 1
    entry = ctx.audit_trail[0]
    assert entry.module_name == "broken_loader"
    assert entry.metadata["status"] == "failed"
    assert len(entry.errors) == 1
    assert "RuntimeError" in entry.errors[0]


def test_audit_logged_preserves_identity(ctx):
    """Decorator preserves function name and docstring."""
    @audit_logged("transform")
    def my_transformer(df, ctx):
        """Transforms the data."""
        return df, ctx

    assert my_transformer.__name__ == "my_transformer"
    assert my_transformer.__doc__ == "Transforms the data."


# ─────────────────────────────────────────────────────────────
# 4. get_audit_summary()
# ─────────────────────────────────────────────────────────────

def test_audit_summary_empty(ctx):
    summary = get_audit_summary(ctx)
    assert summary["total_modules"] == 0
    assert summary["total_time_ms"] == 0


def test_audit_summary_single(ctx):
    log_audit(ctx, "profiling", rows_before=1000, rows_after=1000,
              execution_ms=150, new_insights=5)
    summary = get_audit_summary(ctx)
    assert summary["total_modules"] == 1
    assert summary["total_time_ms"] == 150
    assert summary["total_warnings"] == 0
    assert summary["total_errors"] == 0
    assert len(summary["modules"]) == 1
    assert summary["modules"][0]["module"] == "profiling"


def test_audit_summary_multiple(ctx):
    log_audit(ctx, "profiling", rows_before=100, rows_after=100, execution_ms=10)
    log_audit(ctx, "cleaning", rows_before=100, rows_after=95, execution_ms=25,
              warnings=["5 duplicates removed"])
    log_audit(ctx, "validation", rows_before=95, rows_after=95, execution_ms=15,
              warnings=["2 values out of range"])
    log_audit(ctx, "scoring", rows_before=95, rows_after=95, execution_ms=5)

    summary = get_audit_summary(ctx)
    assert summary["total_modules"] == 4
    assert summary["total_time_ms"] == 55  # 10+25+15+5
    assert summary["total_warnings"] == 2
    assert summary["total_errors"] == 0


def test_audit_summary_with_errors(ctx):
    log_audit(ctx, "load", rows_before=0, rows_after=0,
              errors=["File corrupt", "Schema mismatch"])
    summary = get_audit_summary(ctx)
    assert summary["total_errors"] == 2
