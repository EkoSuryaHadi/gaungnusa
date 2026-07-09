"""Test suite for Phase 4: AI Components.

Tests:
    - classifier.py: domain detection accuracy, confidence scoring, dtypes heuristics
    - recommender.py: threshold-based recommendations, priority ranking
    - explainability.py: per-row explanations for range/enum/pattern/unique rules
    - anomaly.py: IQR fallback detection, row-level + column-level results
"""

import pytest, pandas as pd, numpy as np

from silver.models.types import SilverContext, DataProfile, QualityScore, AuditEntry
from silver.modules.profiling import ProfilingModule
from silver.modules.validation import ValidationModule
from silver.engine.module_loader import load_rules, filter_rules_for_columns

from silver.ai.classifier import classify_dataset, classify_and_store, get_domain_label
from silver.ai.recommender import Recommender
from silver.ai.explainability import Explainer, generate_explanations
from silver.ai.anomaly import AnomalyDetector, detect_anomalies


# ─────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def reload():
    from silver.engine.module_loader import reload_rules
    reload_rules()


@pytest.fixture
def ctx():
    return SilverContext()


# ─────────────────────────────────────────────────────────────
# 1. Classifier — domain detection
# ─────────────────────────────────────────────────────────────

def test_classify_iot():
    df = pd.DataFrame({
        "temperature": [25.0, 26.5, 24.0],
        "humidity": [50, 55, 48],
        "battery": [85, 90, 80],
        "timestamp": pd.date_range("2024-01-01", periods=3),
    })
    domain, conf = classify_dataset(df)
    assert domain == "iot"
    assert conf > 0.5


def test_classify_finance():
    df = pd.DataFrame({
        "transaction_id": ["T001", "T002", "T003"],
        "debit": [1000, 0, 500],
        "credit": [0, 2000, 0],
        "currency": ["IDR", "USD", "IDR"],
        "posting_date": pd.date_range("2024-01-01", periods=3),
    })
    domain, conf = classify_dataset(df)
    assert domain == "finance"
    assert conf > 0.5


def test_classify_sales():
    df = pd.DataFrame({
        "order_id": ["O100", "O101", "O102"],
        "product_id": ["P1", "P2", "P3"],
        "quantity": [2, 1, 5],
        "unit_price": [10000, 25000, 8000],
        "customer_id": ["C1", "C2", "C3"],
    })
    domain, conf = classify_dataset(df)
    assert domain == "sales"
    assert conf > 0.5


def test_classify_erp():
    df = pd.DataFrame({
        "item_id": ["ITM001", "ITM002"],
        "warehouse_id": ["WH1", "WH2"],
        "quantity_on_hand": [100, 50],
        "movement_type": ["receipt", "issue"],
        "uom": ["pcs", "kg"],
    })
    domain, conf = classify_dataset(df)
    assert domain == "erp"
    assert conf > 0.5


def test_classify_hr():
    df = pd.DataFrame({
        "employee_id": ["E001", "E002", "E003"],
        "full_name": ["Budi", "Siti", "Agus"],
        "salary": [5000000, 7500000, 6000000],
        "hire_date": pd.date_range("2020-01-01", periods=3),
        "department": ["IT", "Finance", "HR"],
    })
    domain, conf = classify_dataset(df)
    assert domain == "hr"
    assert conf > 0.5


def test_classify_unknown_returns_general():
    df = pd.DataFrame({
        "col_a": [1, 2, 3],
        "col_b": ["x", "y", "z"],
        "col_c": [1.0, 2.0, 3.0],
    })
    domain, conf = classify_dataset(df)
    assert domain == "general"
    assert conf < 0.5


def test_classify_empty_df():
    df = pd.DataFrame()
    domain, conf = classify_dataset(df)
    assert domain in ("general",)


def test_classify_and_store(ctx):
    df = pd.DataFrame({"temperature": [25, 26], "humidity": [50, 55]})
    classify_and_store(df, ctx)
    assert ctx.dataset_class == "iot"
    assert ctx.class_confidence > 0


def test_classify_and_store_low_confidence(ctx):
    df = pd.DataFrame({"col_a": [1], "col_b": [2]})
    classify_and_store(df, ctx)
    assert ctx.dataset_class == "general"
    assert len(ctx.recommendations) >= 1  # low confidence → recommendation


def test_get_domain_label():
    assert "IoT" in get_domain_label("iot")
    assert "Finance" in get_domain_label("finance")
    assert "Unknown" in get_domain_label("quantum_physics")


# ─────────────────────────────────────────────────────────────
# 2. Recommender
# ─────────────────────────────────────────────────────────────

def test_recommender_no_profile(ctx):
    rec = Recommender()
    df = pd.DataFrame({"a": [1, 2, 3]})
    result = rec.generate(df, ctx)
    assert len(result) >= 1
    # First recommendation should be to run profiling
    assert result[0].priority == "HIGH"


def test_recommender_high_missing(ctx):
    rec = Recommender()
    profiler = ProfilingModule()
    df = pd.DataFrame({"a": [1, None, None, None, 5]})  # 60% missing
    _, ctx = profiler.run(df, ctx)
    result = rec.generate(df, ctx)
    assert any(r.priority == "CRITICAL" for r in result)
    assert any("missing" in r.title.lower() for r in result)


def test_recommender_duplicates(ctx):
    rec = Recommender()
    profiler = ProfilingModule()
    df = pd.DataFrame({"a": [1, 1, 1, 2, 3]})  # 40% dup
    _, ctx = profiler.run(df, ctx)
    result = rec.generate(df, ctx)
    assert any(r.priority == "CRITICAL" for r in result)


def test_recommender_domain_specific(ctx):
    rec = Recommender()
    profiler = ProfilingModule()
    df = pd.DataFrame({"temperature": [25.0, 26.0, 27.0]})
    _, ctx = profiler.run(df, ctx)
    ctx.dataset_class = "iot"
    result = rec.generate(df, ctx)
    # Should have IoT-specific recommendation
    assert any("location" in r.title.lower() or "device" in r.title.lower() for r in result)


def test_recommender_sorted_by_priority(ctx):
    rec = Recommender()
    profiler = ProfilingModule()
    # High missing → CRITICAL; duplicates → CRITICAL
    df = pd.DataFrame({"a": [None, None, None, 0, 0], "b": [1, 1, 1, 2, 3]})
    _, ctx = profiler.run(df, ctx)
    result = rec.generate(df, ctx)
    priorities = [r.priority for r in result]
    # CRITICAL must come before HIGH, MEDIUM, etc.
    priority_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3, "INFO": 4}
    for i in range(len(result) - 1):
        assert priority_order[result[i].priority] <= priority_order[result[i + 1].priority]


# ─────────────────────────────────────────────────────────────
# 3. Explainability
# ─────────────────────────────────────────────────────────────

def test_explainer_range_rule():
    explainer = Explainer()
    ctx = SilverContext()
    ctx.loaded_rules = {"age": {"min": 0, "max": 120}}

    df = pd.DataFrame({"age": [25, -5, 150, 30]})
    explanations = explainer.explain(df, ctx)

    # Should find violations at rows 1 (-5) and 2 (150)
    assert len(explanations) >= 2
    cols = {e.column for e in explanations}
    assert "age" in cols


def test_explainer_enum_rule():
    explainer = Explainer()
    ctx = SilverContext()
    ctx.loaded_rules = {"status": {"values": ["active", "inactive"]}}

    df = pd.DataFrame({"status": ["active", "deleted", "invalid", "inactive"]})
    explanations = explainer.explain(df, ctx)

    assert len(explanations) >= 2  # "deleted" and "invalid"
    for exp in explanations:
        assert exp.column == "status"
        assert "not in allowed set" in exp.message.lower() or "invalid" in exp.message.lower()


def test_explainer_pattern_rule():
    explainer = Explainer()
    ctx = SilverContext()
    ctx.loaded_rules = {"email": {"pattern": r"^.+@.+\..+$"}}

    df = pd.DataFrame({"email": ["test@example.com", "invalid", "x@y.z", None]})
    explanations = explainer.explain(df, ctx)

    # "invalid" should be flagged
    flagged_values = [e.actual_value for e in explanations]
    assert "invalid" in flagged_values or any("pattern" in e.message.lower() for e in explanations)


def test_explainer_no_rules():
    explainer = Explainer()
    ctx = SilverContext()
    df = pd.DataFrame({"x": [1, 2, 3]})
    explanations = explainer.explain(df, ctx)
    assert explanations == []


def test_explainer_max_cap():
    """Ensure max_explanations cap is respected."""
    explainer = Explainer()
    ctx = SilverContext()
    ctx.loaded_rules = {"value": {"min": 0}}  # many violations

    # All negative values violate min=0
    df = pd.DataFrame({"value": [-1] * 100})
    explanations = explainer.explain(df, ctx, max_explanations=10)
    assert len(explanations) <= 10


def test_explainer_unique_rule():
    explainer = Explainer()
    ctx = SilverContext()
    ctx.loaded_rules = {"id": {"unique": True}}

    df = pd.DataFrame({"id": [1, 2, 2, 3, 3, 3]})
    explanations = explainer.explain(df, ctx)
    # Duplicates at row 1 (value 2) and row 2 (value 3)
    assert len(explanations) >= 2


def test_generate_explanations_adds_to_ctx(ctx):
    ctx.loaded_rules = {"score": {"min": 0, "max": 100}}
    df = pd.DataFrame({"score": [50, -10, 200, 75]})
    generate_explanations(df, ctx)
    assert len(ctx.explanations) >= 2


# ─────────────────────────────────────────────────────────────
# 4. Anomaly Detection
# ─────────────────────────────────────────────────────────────

def test_anomaly_no_numeric_cols():
    detector = AnomalyDetector()
    df = pd.DataFrame({"name": ["A", "B", "C"], "city": ["X", "Y", "Z"]})
    result = detector.detect(df)
    assert result["total_anomalies"] == 0
    assert result["method"] == "none"


def test_anomaly_iqr_fallback():
    detector = AnomalyDetector(contamination=0.1)
    df = pd.DataFrame({"value": [10, 11, 12, 13, 14, 100, 200]})
    result = detector.detect(df)
    # method should be iqr_zscore (sklearn not installed in test)
    assert result["method"] in ("iqr_zscore", "isolation_forest")
    assert result["total_anomalies"] > 0  # should detect the 100, 200


def test_anomaly_clean_data():
    detector = AnomalyDetector(contamination=0.05)
    df = pd.DataFrame({"a": [1.0, 2.0, 3.0, 4.0, 5.0] * 10})
    result = detector.detect(df)
    # Clean data should have few anomalies
    assert result["total_anomalies"] <= len(df) * 0.2


def test_anomaly_column_summary():
    detector = AnomalyDetector()
    df = pd.DataFrame({
        "normal": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] * 5,
        "spiky": [1, 2, 3, 4, 5, 100, 7, 8, 9, 10] * 5,
    })
    result = detector.detect(df)
    col_anoms = result["column_anomalies"]
    assert col_anoms["spiky"] > col_anoms["normal"]


def test_anomaly_output_keys():
    detector = AnomalyDetector()
    df = pd.DataFrame({"x": range(100), "y": np.random.randn(100)})
    result = detector.detect(df)
    for key in ["row_anomalies", "row_scores", "column_anomalies", "total_anomalies", "method"]:
        assert key in result


def test_anomaly_small_df():
    """Small datasets (<10 rows) should still work."""
    detector = AnomalyDetector()
    df = pd.DataFrame({"x": [1, 2, 3, 1000]})
    result = detector.detect(df)
    assert result["total_anomalies"] > 0


def test_detect_anomalies_convenience():
    df = pd.DataFrame({"a": [1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3, 500, 600]})
    result = detect_anomalies(df, contamination=0.1)
    assert result["total_anomalies"] > 0


# ─────────────────────────────────────────────────────────────
# 5. Integration — Classifier → Recommender → Explainer
# ─────────────────────────────────────────────────────────────

def test_full_ai_pipeline(ctx):
    """Classify → profile → validate → recommend → explain."""
    df = pd.DataFrame({
        "temperature": [25.0, 26.5, 999.0, 24.0, 30.0],
        "humidity": [50, 55, 150, 48, 60],
        "battery": [85, 90, 80, -5, 95],
    })

    # Step 1: Classify
    classify_and_store(df, ctx)
    assert ctx.dataset_class == "iot"
    assert ctx.class_confidence > 0.5

    # Step 2: Profile
    profiler = ProfilingModule()
    _, ctx = profiler.run(df, ctx)
    assert ctx.profile is not None

    # Step 3: Validate with IoT rules
    rules = load_rules("iot")
    ctx.loaded_rules = filter_rules_for_columns(rules, df.columns.tolist())
    validator = ValidationModule()
    _, ctx = validator.run(df, ctx)

    # Step 4: Recommend
    rec = Recommender()
    recommendations = rec.generate(df, ctx)
    assert len(recommendations) > 0

    # Step 5: Explain violations
    explainer = Explainer()
    explanations = explainer.explain(df, ctx)
    # Should have explanations for temperature 999, humidity 150, battery -5
    assert len(explanations) >= 3


def test_end_to_end_with_anomaly(ctx):
    """Full pipeline including anomaly detection."""
    df = pd.DataFrame({
        "temperature": [25, 26, 27, 999, 25, 26, 27] * 5,  # 35 rows, 5 outliers
        "humidity": [50, 55, 48, 50, 150, 55, 48] * 5,
    })

    classify_and_store(df, ctx)
    profiler = ProfilingModule()
    _, ctx = profiler.run(df, ctx)

    # Anomaly detection
    detector = AnomalyDetector(contamination=0.1)
    result = detector.detect(df)
    assert result["total_anomalies"] > 0

    # Validate
    rules = load_rules("iot")
    ctx.loaded_rules = filter_rules_for_columns(rules, df.columns.tolist())
    validator = ValidationModule()
    _, ctx = validator.run(df, ctx)

    # Score
    from silver.modules.scoring import ScoringModule
    scorer = ScoringModule()
    _, ctx = scorer.run(df, ctx)

    assert ctx.quality_score is not None
    assert ctx.quality_score.validity < 100  # has violations
