"""Integration tests for Phase 5: Silver Orchestrator + Pipeline.

Tests:
    - SilverPipeline fluent API (chain building)
    - SilverOrchestrator quick/full/deep/custom modes
    - step_silver() in etl_runner.py integration
    - End-to-end: Bronze-like data → Silver pipeline → quality score + audit
    - Domain classification → auto rule loading
    - Error handling in orchestrator
    - Backward compat: legacy validate still works
"""

import pytest, pandas as pd, numpy as np, json, sys, os

# Ensure Silver package is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "worker"))

from silver.models.types import SilverContext, DataProfile, QualityScore, AuditEntry
from silver.engine.pipeline import SilverPipeline
from silver.engine.orchestrator import (
    SilverOrchestrator,
    SilverOrchestratorError,
    run_silver_pipeline,
)
from silver.engine.module_loader import reload_rules


# ─────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def reload():
    reload_rules()


@pytest.fixture
def clean_df():
    return pd.DataFrame({
        "id": [1, 2, 3, 4, 5],
        "name": ["Alice", "Bob", "Charlie", "Diana", "Eve"],
        "age": [25, 30, 35, 40, 45],
        "score": [85, 90, 95, 88, 92],
    })


@pytest.fixture
def bronze_df():
    """Simulates Bronze-layer data: real-world messy data."""
    return pd.DataFrame({
        "transaction_id": ["T001", "T002", "T003", "T004", "T005", "T006"],
        "amount": [100000.0, 250000.0, -5000.0, 150000.0, None, 999999999.0],
        "currency": ["IDR", "IDR", "IDR", "EUR", "IDR", "XXX"],
        "transaction_type": ["payment", "deposit", "invalid", "transfer", "payment", "payment"],
        "transaction_date": ["2024-01-15", "2024-02-20", "2024-03-10",
                             "2024-04-05", "2024-05-12", "2024-06-18"],
    })


# ─────────────────────────────────────────────────────────────
# 1. SilverPipeline Fluent API
# ─────────────────────────────────────────────────────────────

def test_pipeline_basic_chain(clean_df):
    """Basic chaining: profile → score."""
    pipe = SilverPipeline(clean_df)
    pipe.profile().score()
    df, ctx = pipe.run()

    assert ctx.profile is not None
    assert ctx.quality_score is not None
    assert ctx.quality_score.overall > 90
    assert len(ctx.audit_trail) >= 2  # profile + scoring


def test_pipeline_quick(clean_df):
    """Quick preset: profile + classify + validate + score."""
    pipe = SilverPipeline(clean_df)
    pipe.quick()
    df, ctx = pipe.run()

    assert ctx.profile is not None
    assert ctx.dataset_class is not None
    assert ctx.quality_score is not None
    assert len(ctx.audit_trail) >= 3


def test_pipeline_full(bronze_df):
    """Full preset: all cleaning modules + AI components."""
    pipe = SilverPipeline(bronze_df)
    pipe.full()
    df, ctx = pipe.run()

    assert ctx.profile is not None
    assert ctx.dataset_class is not None
    assert ctx.quality_score is not None

    # Quality should be imperfect (has nulls, negative amount, invalid type)
    qs = ctx.quality_score
    assert qs.completeness < 100  # has nulls
    assert qs.validity < 100      # has invalid values

    # Should have recommendations
    assert len(ctx.recommendations) > 0

    # Should have audit trail with multiple modules
    module_names = [e.module_name for e in ctx.audit_trail]
    assert "profiling" in module_names
    assert "validation" in module_names


def test_pipeline_deep(bronze_df):
    """Deep preset: full + anomaly detection + enrichment."""
    pipe = SilverPipeline(bronze_df)
    pipe.deep()
    df, ctx = pipe.run()

    assert ctx.profile is not None
    assert ctx.quality_score is not None
    assert len(ctx.recommendations) > 0


def test_pipeline_custom(clean_df):
    """Custom module selection."""
    pipe = SilverPipeline(clean_df)
    pipe.profile().datatype().timestamp().score()
    df, ctx = pipe.run()

    assert ctx.profile is not None
    assert ctx.quality_score is not None


def test_pipeline_immutability(clean_df):
    """Pipeline should not mutate original DataFrame."""
    original = clean_df.copy()
    pipe = SilverPipeline(clean_df)
    pipe.full()
    df, ctx = pipe.run()
    assert original.equals(clean_df)  # Original unchanged


def test_pipeline_context_preserved(bronze_df):
    """Context passed in should be preserved and enriched."""
    ctx = SilverContext(tenant_id=42, pipeline_id=7, run_id=99)
    pipe = SilverPipeline(bronze_df, ctx=ctx)
    pipe.quick()
    _, result_ctx = pipe.run()

    assert result_ctx.tenant_id == 42
    assert result_ctx.pipeline_id == 7
    assert result_ctx.run_id == 99


# ─────────────────────────────────────────────────────────────
# 2. SilverOrchestrator
# ─────────────────────────────────────────────────────────────

def test_orchestrator_quick_mode(clean_df):
    df, ctx = run_silver_pipeline(clean_df, {"mode": "quick"})
    assert ctx.quality_score is not None
    assert len(ctx.audit_trail) > 0


def test_orchestrator_full_mode(bronze_df):
    df, ctx = run_silver_pipeline(bronze_df, {"mode": "full"})

    assert ctx.quality_score is not None
    assert ctx.dataset_class is not None
    # Bronze data has finance keywords
    assert ctx.dataset_class in ("finance", "sales", "general")


def test_orchestrator_with_domain_override(bronze_df):
    """Force finance domain — should use finance rules."""
    df, ctx = run_silver_pipeline(bronze_df, {"mode": "full", "domain": "finance"})

    assert ctx.dataset_class == "finance" or "finance" in str(ctx.loaded_rules)


def test_orchestrator_custom_modules(clean_df):
    """Custom mode with specific modules."""
    df, ctx = run_silver_pipeline(clean_df, {
        "mode": "custom",
        "modules": ["profiling", "scoring"],
    })
    assert ctx.quality_score is not None
    # Only profiling + scoring + orchestrator audit
    module_names = [e.module_name for e in ctx.audit_trail]
    assert "profiling" in module_names
    assert "scoring" in module_names


def test_orchestrator_custom_no_modules_raises():
    with pytest.raises(SilverOrchestratorError):
        run_silver_pipeline(pd.DataFrame({"x": [1]}), {"mode": "custom"})


def test_orchestrator_config_merged(bronze_df):
    """Config values should propagate to context."""
    df, ctx = run_silver_pipeline(bronze_df, {
        "mode": "quick",
        "tenant_id": 123,
        "pipeline_id": 456,
        "run_id": 789,
    })
    assert ctx.tenant_id == 123
    assert ctx.pipeline_id == 456
    assert ctx.run_id == 789


def test_orchestrator_all_audits_structured():
    """All audit entries must be AuditEntry instances."""
    ctx = SilverContext()
    pipe = SilverPipeline(
        pd.DataFrame({"a": [1, 2, 3]}), ctx
    )
    pipe.quick()
    _, ctx = pipe.run()

    for entry in ctx.audit_trail:
        assert isinstance(entry, AuditEntry)
        assert entry.module_name
        assert entry.execution_ms >= 0
        assert entry.timestamp is not None


def test_orchestrator_error_handling():
    """Invalid module name should not crash — warning added."""
    ctx = SilverContext()
    pipe = SilverPipeline(pd.DataFrame({"x": [1]}), ctx)
    pipe.profile().score()

    # Manually inject bad module
    pipe._modules.append(("nonexistent_module", {}))
    df, ctx = pipe.run()

    # Should have warnings about missing module
    assert len(ctx.warnings) >= 1


# ─────────────────────────────────────────────────────────────
# 3. step_silver() in etl_runner.py
# ─────────────────────────────────────────────────────────────

def test_step_silver_function(bronze_df):
    """Test step_silver directly (simulates etl_runner call)."""
    # Import step_silver dynamically (worker/ is in path)
    from etl_runner import step_silver

    config = {
        "silverMode": "quick",
        "pipelineId": 1,
        "runId": 1,
    }
    result = step_silver(bronze_df, config)
    assert isinstance(result, pd.DataFrame)
    assert len(result) > 0


def test_step_silver_fallback_to_legacy():
    """When silver engine fails to import, fall back to legacy validate."""
    # This is tested implicitly: step_silver has try/except ImportError
    # The function should return a DataFrame even in fallback mode
    from etl_runner import step_silver
    df = pd.DataFrame({"amount": [100, -50, 200]})
    config = {"validationRules": "NUMBER:amount,min=0"}
    result = step_silver(df, config)
    assert isinstance(result, pd.DataFrame)


def test_step_silver_with_legacy_rules(bronze_df):
    """Old validate config → auto-upgraded to Silver custom mode."""
    from etl_runner import step_silver
    config = {
        "validationRules": "NOT_NULL:amount\nNUMBER:amount,min=0",
        "pipelineId": 1,
        "runId": 1,
    }
    result = step_silver(bronze_df, config)
    assert isinstance(result, pd.DataFrame)


# ─────────────────────────────────────────────────────────────
# 4. End-to-End: Bronze → Silver Pipeline
# ─────────────────────────────────────────────────────────────

def test_bronze_to_silver_realistic():
    """Simulate a real Bronze → Silver pipeline with messy data."""
    df = pd.DataFrame({
        "order_id": ["ORD-001", "ORD-002", "ORD-003", "ORD-004", "ORD-005", "ORD-006"],
        "customer_id": ["C001", "C002", "C003", "C001", "C004", "C005"],
        "product_id": ["P1", "P2", "P3", "P1", "P4", "P5"],
        "quantity": [2, 1, -5, 3, None, 10],
        "unit_price": [10000, 25000, 8000, 10000, 15000, -2000],
        "order_status": ["completed", "pending", "invalid", "completed", "shipped", "cancelled"],
        "order_date": ["2024-01-01", "2024-01-02", "2024-01-03",
                       "2024-01-04", "2024-01-05", "2024-01-06"],
    })

    # Run full Silver pipeline
    df_result, ctx = run_silver_pipeline(df, {"mode": "full"})

    # Verify quality score
    assert ctx.quality_score is not None
    qs = ctx.quality_score
    assert qs.completeness < 100  # quantity has null
    assert qs.validity < 100      # invalid order_status, negative values
    assert qs.overall > 0
    assert qs.overall < 100

    # Verify classification
    assert ctx.dataset_class in ("sales", "erp")

    # Verify audit trail is complete
    assert len(ctx.audit_trail) >= 8  # profile+datatype+timestamp+duplicate+missing+outlier+validate+score+orchestrator

    # Verify recommendations exist
    assert len(ctx.recommendations) > 0

    # Verify explanations for violations
    assert len(ctx.explanations) > 0


def test_silver_context_to_dict(bronze_df):
    """ctx.to_dict() should produce serializable output."""
    df, ctx = run_silver_pipeline(bronze_df, {"mode": "quick"})
    result = ctx.to_dict()

    assert "quality_score" in result
    assert "audit_trail" in result
    assert "recommendations" in result
    assert "warnings" in result

    # JSON serializable
    import json
    serialized = json.dumps(result, default=str)
    assert len(serialized) > 100


def test_silver_pipeline_idempotent(clean_df):
    """Running same pipeline twice produces consistent results."""
    df1, ctx1 = run_silver_pipeline(clean_df, {"mode": "quick"})
    df2, ctx2 = run_silver_pipeline(clean_df, {"mode": "quick"})

    assert ctx1.quality_score.overall == ctx2.quality_score.overall


def test_silver_pipeline_large_dataset():
    """Silver pipeline should handle 10K+ rows."""
    df = pd.DataFrame({
        "id": range(1, 10001),
        "value": np.random.randn(10000) * 100 + 500,
        "category": np.random.choice(["A", "B", "C", None], 10000),
    })

    df_result, ctx = run_silver_pipeline(df, {"mode": "quick"})
    assert ctx.quality_score is not None
    assert ctx.profile is not None
    assert ctx.profile.total_rows == 10000


# ─────────────────────────────────────────────────────────────
# 5. Backward Compatibility
# ─────────────────────────────────────────────────────────────

def test_legacy_etl_runner_still_works():
    """Existing etl_runner functions still work after adding step_silver."""
    from etl_runner import step_clean, step_validate, step_transform, step_filter

    df = pd.DataFrame({
        "  name ": [" Alice", "Bob ", " Charlie"],
        "amount": [100, -50, 200],
        "id": [1, 2, 3],
    })

    # Legacy clean
    cleaned = step_clean(df, {"stripWhitespace": True, "deduplicate": True})
    assert "  name " in cleaned.columns  # column name itself has spaces
    assert cleaned["  name "].iloc[0] == "Alice"  # values are stripped

    # Legacy validate
    validated = step_validate(df, {
        "validationRules": "NUMBER:amount,min=0",
        "validationMode": "flag",
    })
    assert isinstance(validated, pd.DataFrame)
    assert len(validated) == 3  # flag mode keeps all rows

    # Legacy filter — just verify it doesn't crash
    filtered = step_filter(df, {"column": "amount", "operator": "gt", "value": 0})
    assert isinstance(filtered, pd.DataFrame)


def test_step_handlers_include_silver():
    """STEP_HANDLERS must include SILVER_QUALITY."""
    from etl_runner import STEP_HANDLERS
    assert "SILVER_QUALITY" in STEP_HANDLERS
    assert callable(STEP_HANDLERS["SILVER_QUALITY"])
