"""Test suite for Phase 3.1: Scoring Module.

Tests QualityScore computation from profile + audit trail covering:
    - Perfect data → DQI 100
    - Data with missing values → reduced completeness
    - Data with duplicates → reduced uniqueness
    - Data with validation violations → reduced validity
    - Integration: Profiling → Validation → Scoring
    - Empty data
    - No profile (no profiling ran)
    - Weight verification
"""

import pytest, pandas as pd, numpy as np

from silver.models.types import SilverContext, DataProfile, QualityScore, AuditEntry
from silver.modules.scoring import ScoringModule
from silver.modules.profiling import ProfilingModule
from silver.modules.validation import ValidationModule
from silver.engine.module_loader import load_rules, filter_rules_for_columns


# ─────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────

@pytest.fixture
def scoring():
    return ScoringModule()


@pytest.fixture
def clean_df():
    """Perfect data: no nulls, no duplicates, all integers."""
    return pd.DataFrame({
        "id": [1, 2, 3, 4, 5],
        "name": ["A", "B", "C", "D", "E"],
        "age": [25, 30, 35, 40, 45],
        "score": [85, 90, 95, 88, 92],
    })


@pytest.fixture
def dirty_df():
    """Dirty data: nulls, duplicates, outliers, invalid values."""
    return pd.DataFrame({
        "id": [1, 2, 2, 3, 4, None],           # duplicate id, missing
        "age": [25, 200, 30, -5, None, 40],     # outlier, negative, missing
        "score": [85, 90, 95, 88, 92, 87],
        "status": ["active", "active", "active", "invalid", "active", "active"],
    })


# ─────────────────────────────────────────────────────────────
# 1. Scoring — perfect data
# ─────────────────────────────────────────────────────────────

def test_scoring_perfect_data(scoring, clean_df):
    """Perfect data should score near 100 overall."""
    ctx = SilverContext()
    profiler = ProfilingModule()
    _, ctx = profiler.run(clean_df, ctx)
    _, ctx = scoring.run(clean_df, ctx)

    assert ctx.quality_score is not None
    qs = ctx.quality_score
    assert qs.completeness == 100.0
    assert qs.duplicate_pct <= 0.0 if hasattr(qs, 'duplicate_pct') else True
    assert qs.overall > 90.0  # Near perfect


def test_scoring_creates_audit(scoring, clean_df):
    """Scoring module creates an audit entry with DQI metadata."""
    ctx = SilverContext()
    _, ctx = scoring.run(clean_df, ctx)

    audit = ctx.audit_trail[-1]
    assert audit.module_name == "scoring"
    assert "dqi_overall" in audit.metadata
    assert "weights" in audit.metadata


# ─────────────────────────────────────────────────────────────
# 2. Scoring — dirty data (missing values)
# ─────────────────────────────────────────────────────────────

def test_scoring_reduced_completeness(scoring):
    """Missing values should reduce completeness score."""
    ctx = SilverContext()
    df = pd.DataFrame({
        "a": [1, 2, None, 4, 5],
        "b": [10, 20, 30, None, 50],
    })
    profiler = ProfilingModule()
    _, ctx = profiler.run(df, ctx)
    _, ctx = scoring.run(df, ctx)

    assert ctx.quality_score.completeness < 100.0
    # 2 missing out of 10 cells = 80% complete
    assert ctx.quality_score.completeness == 80.0  # (10-2)/10 * 100


def test_scoring_reduced_uniqueness(scoring):
    """Duplicate rows should reduce uniqueness score."""
    ctx = SilverContext()
    df = pd.DataFrame({
        "x": [1, 1, 1, 2, 3],
    })
    profiler = ProfilingModule()
    _, ctx = profiler.run(df, ctx)
    _, ctx = scoring.run(df, ctx)

    assert ctx.quality_score.uniqueness < 100.0


# ─────────────────────────────────────────────────────────────
# 3. Scoring — validity from validation module
# ─────────────────────────────────────────────────────────────

def test_scoring_reduced_validity(scoring):
    """Validation violations should reduce validity score."""
    ctx = SilverContext()
    rules = {"age": {"min": 0, "max": 150}}
    ctx.loaded_rules = rules

    df = pd.DataFrame({
        "age": [25, 200, -5, 999, 30],
        "name": ["A", "B", "C", "D", "E"],
    })

    validator = ValidationModule()
    _, ctx = validator.run(df, ctx)
    _, ctx = scoring.run(df, ctx)

    assert ctx.quality_score.validity < 100.0
    # 3 violations out of 5 rows = 40% valid → valid = 100 - 60 = 40
    assert ctx.quality_score.validity == 40.0


# ─────────────────────────────────────────────────────────────
# 4. Scoring — no profile
# ─────────────────────────────────────────────────────────────

def test_scoring_no_profile(scoring, clean_df):
    """Without a profile, should use defaults (100.0)."""
    ctx = SilverContext()
    _, ctx = scoring.run(clean_df, ctx)
    assert ctx.quality_score is not None
    # Everything defaults to 100 when no profile
    assert ctx.quality_score.completeness == 100.0
    assert ctx.quality_score.overall == 100.0


# ─────────────────────────────────────────────────────────────
# 5. Scoring — empty DataFrame
# ─────────────────────────────────────────────────────────────

def test_scoring_empty_df(scoring):
    """Empty DataFrame with profile should score 100 (no data = no problems)."""
    ctx = SilverContext()
    df = pd.DataFrame()
    _, ctx = scoring.run(df, ctx)

    assert ctx.quality_score is not None
    assert ctx.quality_score.overall == 100.0


# ─────────────────────────────────────────────────────────────
# 6. Scoring — weights verification
# ─────────────────────────────────────────────────────────────

def test_scoring_weights_sum_to_one(scoring):
    assert abs(sum(scoring.WEIGHTS.values()) - 1.0) < 0.001

    # Each weight within [0, 1]
    for dim, w in scoring.WEIGHTS.items():
        assert 0 < w < 1, f"Weight for {dim} should be in (0,1), got {w}"


def test_weighted_overall_matches_dimensions(scoring):
    """overall = weighted sum of dimensions."""
    qs = QualityScore(
        completeness=80.0,
        validity=90.0,
        consistency=85.0,
        uniqueness=95.0,
        timeliness=100.0,
        accuracy=70.0,
    )
    expected = round(
        80 * 0.25 + 90 * 0.25 + 85 * 0.15 + 95 * 0.15 + 100 * 0.10 + 70 * 0.10, 2
    )
    assert qs.overall == expected


# ─────────────────────────────────────────────────────────────
# 7. Integration — Profiling → Validation → Scoring
# ─────────────────────────────────────────────────────────────

def test_full_pipeline_dqi(scoring, dirty_df):
    """Complete pipeline: profile → validate → score."""
    ctx = SilverContext()

    # Step 1: Profile
    profiler = ProfilingModule()
    _, ctx = profiler.run(dirty_df, ctx)
    assert ctx.profile is not None

    # Step 2: Validate
    rules = {"age": {"min": 0, "max": 150}, "id": {"unique": True}}
    ctx.loaded_rules = rules
    validator = ValidationModule()
    _, ctx = validator.run(dirty_df, ctx)

    # Step 3: Score
    _, ctx = scoring.run(dirty_df, ctx)

    qs = ctx.quality_score
    assert qs is not None
    assert 0 <= qs.overall <= 100
    assert qs.completeness < 100  # has nulls
    assert qs.validity < 100      # has age violations + dup id
    assert len(ctx.audit_trail) == 3  # profile, validation, scoring


# ─────────────────────────────────────────────────────────────
# 8. Boundary cases
# ─────────────────────────────────────────────────────────────

def test_scoring_all_missing(scoring):
    """All values missing → completeness = 0."""
    ctx = SilverContext()
    df = pd.DataFrame({
        "a": [None, None, None],
        "b": [None, None, None],
    })
    profiler = ProfilingModule()
    _, ctx = profiler.run(df, ctx)
    _, ctx = scoring.run(df, ctx)

    assert ctx.quality_score.completeness == 0.0


def test_scoring_very_large_df(scoring):
    """Large clean dataset should score 100."""
    ctx = SilverContext()
    df = pd.DataFrame({
        "id": range(1, 10001),
        "value": np.random.randn(10000) * 100 + 500,
    })
    profiler = ProfilingModule()
    _, ctx = profiler.run(df, ctx)
    _, ctx = scoring.run(df, ctx)

    assert ctx.quality_score.completeness > 99.0
    assert ctx.quality_score.overall > 90.0


# ─────────────────────────────────────────────────────────────
# 9. Module discovery
# ─────────────────────────────────────────────────────────────

def test_scoring_discovered():
    from silver.engine.module_loader import discover_modules
    modules = discover_modules()
    assert "scoring" in modules


def test_scoring_instance():
    from silver.engine.module_loader import get_module_instance
    inst = get_module_instance("scoring")
    assert inst is not None
    assert isinstance(inst, ScoringModule)
