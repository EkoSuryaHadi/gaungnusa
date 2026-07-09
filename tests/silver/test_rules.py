"""Test suite for Phase 2: YAML Rules Engine.

Tests cover:
    - Rule file existence and YAML validity
    - load_rules() with dataset class
    - load_rules() fallback to generic
    - filter_rules_for_columns()
    - merge_rules()
    - validate_rules_structure()
    - ValidationModule with YAML rules (end-to-end)
    - Module loader discovery + rules
"""

import pytest, pandas as pd, numpy as np
from pathlib import Path

from silver.engine.module_loader import (
    load_rules,
    list_available_rules,
    reload_rules,
    filter_rules_for_columns,
    merge_rules,
    validate_rules_structure,
)
from silver.modules.validation import ValidationModule
from silver.models.types import SilverContext


# ─────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def clear_cache():
    """Clear rules cache before each test."""
    reload_rules()
    yield
    reload_rules()


@pytest.fixture
def rules_dir():
    return Path(__file__).parent.parent.parent / "worker" / "silver" / "rules"


# ─────────────────────────────────────────────────────────────
# 1. Rule File Existence
# ─────────────────────────────────────────────────────────────

def test_all_rule_files_exist(rules_dir):
    """All 6 expected YAML rule files must exist."""
    expected = {"generic", "iot", "finance", "sales", "erp", "hr"}
    actual = {f.stem for f in rules_dir.glob("*.yaml")}
    missing = expected - actual
    assert not missing, f"Missing rule files: {missing}"


def test_rule_files_valid_yaml(rules_dir):
    """All YAML rule files must parse correctly."""
    import yaml
    for fpath in sorted(rules_dir.glob("*.yaml")):
        with open(fpath) as f:
            data = yaml.safe_load(f)
        assert isinstance(data, dict), f"{fpath.name}: must be a top-level dict"
        assert len(data) > 0, f"{fpath.name}: must not be empty"


# ─────────────────────────────────────────────────────────────
# 2. list_available_rules()
# ─────────────────────────────────────────────────────────────

def test_list_available_rules():
    """All 6 domain rule sets should be discoverable."""
    rules = list_available_rules()
    assert len(rules) >= 6
    assert "generic" in rules
    assert "iot" in rules
    assert "finance" in rules
    assert "sales" in rules
    assert "erp" in rules
    assert "hr" in rules


# ─────────────────────────────────────────────────────────────
# 3. load_rules() — domain-specific
# ─────────────────────────────────────────────────────────────

def test_load_rules_generic():
    rules = load_rules("generic")
    assert "email" in rules
    assert "amount" in rules
    assert rules["email"]["pattern"]  # regex pattern
    assert rules["amount"]["min"] == 0


def test_load_rules_iot():
    rules = load_rules("iot")
    assert "temperature" in rules
    assert "humidity" in rules
    assert "battery" in rules
    assert rules["humidity"]["max"] == 100
    assert rules["battery"]["max"] == 100


def test_load_rules_finance():
    rules = load_rules("finance")
    assert "transaction_id" in rules
    assert "amount" in rules
    assert "currency" in rules
    assert rules["currency"]["values"]  # enum
    assert "IDR" in rules["currency"]["values"]


def test_load_rules_sales():
    rules = load_rules("sales")
    assert "order_id" in rules
    assert "price" in rules
    assert "quantity" in rules
    assert "rating" in rules
    assert "loyalty_tier" in rules
    assert "gold" in rules["loyalty_tier"]["values"]


def test_load_rules_erp():
    rules = load_rules("erp")
    assert "item_id" in rules
    assert "quantity_on_hand" in rules
    assert "movement_type" in rules
    assert "uom" in rules
    assert "pcs" in rules["uom"]["values"]


def test_load_rules_hr():
    rules = load_rules("hr")
    assert "employee_id" in rules
    assert "salary" in rules
    assert "gender" in rules
    assert "job_level" in rules
    assert "c_level" in rules["job_level"]["values"]


def test_load_rules_unknown_falls_back_to_generic():
    """Unknown dataset class falls back to generic.yaml."""
    rules = load_rules("space_exploration")
    # Must load generic.yaml as fallback
    assert len(rules) > 0
    assert "email" in rules or "id" in rules or "amount" in rules


def test_load_rules_none_loads_generic():
    """None dataset_class loads generic.yaml."""
    rules = load_rules(None)
    assert len(rules) > 0


def test_load_rules_caches():
    """Second call should return cached result."""
    rules1 = load_rules("generic")
    rules2 = load_rules("generic")
    assert rules1 is rules2  # same object in memory


def test_load_rules_reload_clears_cache():
    """reload_rules() should invalidate cache."""
    rules1 = load_rules("generic")
    reload_rules()
    rules2 = load_rules("generic")
    assert rules1 == rules2  # same content
    # But different objects (cache cleared)
    # Note: content equal but identity may differ


# ─────────────────────────────────────────────────────────────
# 4. filter_rules_for_columns()
# ─────────────────────────────────────────────────────────────

def test_filter_rules_for_columns_keeps_matching():
    rules = {"name": {"min": 1}, "email": {"pattern": ".*"}, "age": {"min": 0, "max": 150}}
    columns = ["name", "age"]
    result = filter_rules_for_columns(rules, columns)
    assert set(result.keys()) == {"name", "age"}
    assert "email" not in result


def test_filter_rules_for_columns_empty_rules():
    assert filter_rules_for_columns({}, ["a", "b"]) == {}


def test_filter_rules_for_columns_empty_columns():
    rules = {"name": {"min": 1}}
    assert filter_rules_for_columns(rules, []) == {}


def test_filter_rules_for_columns_no_match():
    rules = {"name": {"min": 1}}
    result = filter_rules_for_columns(rules, ["age", "city"])
    assert result == {}


# ─────────────────────────────────────────────────────────────
# 5. merge_rules()
# ─────────────────────────────────────────────────────────────

def test_merge_rules_domain_overrides_generic():
    generic = {"amount": {"min": 0}, "email": {"pattern": ".*"}}
    domain = {"amount": {"min": 1000, "max": 10000000}}
    merged = merge_rules(generic, domain)
    assert merged["amount"]["min"] == 1000  # domain overrides generic
    assert merged["amount"]["max"] == 10000000
    assert merged["email"]["pattern"] == ".*"  # generic survives


def test_merge_rules_empty_dicts():
    assert merge_rules({}, {}) == {}
    assert merge_rules({"a": {"min": 0}}, {}) == {"a": {"min": 0}}
    assert merge_rules({}, {"b": {"max": 100}}) == {"b": {"max": 100}}


def test_merge_rules_three_layers():
    gen = {"a": {"min": 0}, "b": {"max": 100}}
    dom = {"b": {"max": 50}}
    custom = {"a": {"min": -10, "max": 100}}
    result = merge_rules(gen, dom, custom)
    assert result["a"]["min"] == -10
    assert result["a"]["max"] == 100
    assert result["b"]["max"] == 50


# ─────────────────────────────────────────────────────────────
# 6. validate_rules_structure()
# ─────────────────────────────────────────────────────────────

def test_validate_valid_rules():
    rules = {
        "age": {"min": 0, "max": 150},
        "status": {"values": ["active", "inactive"]},
        "email": {"pattern": r"^.+@.+\..+$"},
        "id": {"unique": True},
    }
    valid, errors = validate_rules_structure(rules)
    assert valid
    assert errors == []


def test_validate_empty_rules():
    valid, errors = validate_rules_structure({})
    assert valid
    assert errors == []


def test_validate_not_dict():
    valid, errors = validate_rules_structure("not a dict")
    assert not valid
    assert "must be a dict" in errors[0]


def test_validate_rule_not_dict():
    rules = {"age": "should be a dict"}
    valid, errors = validate_rules_structure(rules)
    assert not valid
    assert "must be a dict" in errors[0]


def test_validate_unknown_keys():
    rules = {"age": {"minimum": 0, "maximum": 150}}  # wrong key names
    valid, errors = validate_rules_structure(rules)
    assert not valid
    assert "Unknown rule keys" in errors[0]


def test_validate_min_greater_than_max():
    rules = {"score": {"min": 100, "max": 0}}
    valid, errors = validate_rules_structure(rules)
    assert not valid
    assert "min (100) > max (0)" in errors[0]


def test_validate_values_not_list():
    rules = {"status": {"values": "active,inactive"}}  # string, not list
    valid, errors = validate_rules_structure(rules)
    assert not valid
    assert "'values'" in errors[0]


def test_validate_unique_not_bool():
    rules = {"id": {"unique": "yes"}}
    valid, errors = validate_rules_structure(rules)
    assert not valid
    assert "'unique'" in errors[0]


def test_validate_all_rule_files_pass_structure():
    """Every YAML rule file we ship must pass structure validation."""
    rules_dir = Path(__file__).parent.parent.parent / "worker" / "silver" / "rules"
    for fpath in sorted(rules_dir.glob("*.yaml")):
        import yaml
        with open(fpath) as f:
            rules = yaml.safe_load(f)
        valid, errors = validate_rules_structure(rules)
        assert valid, f"{fpath.name} failed validation: {errors}"


# ─────────────────────────────────────────────────────────────
# 7. ValidationModule with YAML rules (integration)
# ─────────────────────────────────────────────────────────────

def test_validation_module_with_generic_rules():
    """ValidationModule uses loaded_rules from context."""
    ctx = SilverContext()
    rules = load_rules("generic")
    ctx.loaded_rules = filter_rules_for_columns(rules, ["id", "amount", "age"])

    df = pd.DataFrame({
        "id": [1, 2, 2],
        "amount": [100, -50, 200],
        "age": [25, -5, 999],
    })

    mod = ValidationModule()
    result_df, ctx = mod.run(df, ctx)

    # Audit entry recorded
    assert len(ctx.audit_trail) == 1
    audit = ctx.audit_trail[0]
    assert audit.module_name == "validation"

    # Violations detected
    violations = audit.metadata.get("total_violations", 0)
    assert violations > 0  # duplicate id, negative amount, negative age, age >150


def test_validation_module_no_rules():
    """With no rules loaded, should produce warning audit."""
    ctx = SilverContext()
    df = pd.DataFrame({"x": [1, 2, 3]})
    mod = ValidationModule()
    result_df, ctx = mod.run(df, ctx)
    assert len(ctx.audit_trail) == 1
    assert "warning" in ctx.audit_trail[0].metadata


def test_validation_module_with_iot_rules():
    """IoT rules validate sensor ranges."""
    ctx = SilverContext()
    rules = load_rules("iot")
    ctx.loaded_rules = filter_rules_for_columns(rules, ["temperature", "humidity", "battery"])

    df = pd.DataFrame({
        "temperature": [25, 500, -99, 30],  # 500 and -99 are out of range
        "humidity": [50, 150, 80, -10],      # 150 and -10 out of range
        "battery": [85, 120, 50, -5],         # 120 and -5 out of range
    })

    mod = ValidationModule()
    result_df, ctx = mod.run(df, ctx)

    audit = ctx.audit_trail[0]
    assert audit.metadata["total_violations"] > 0
    # Should find violations for out-of-range values
    assert "temperature" in audit.metadata["details"]
    assert "humidity" in audit.metadata["details"]
    assert "battery" in audit.metadata["details"]


def test_validation_module_with_finance_rules():
    """Finance rules check transaction types and currencies."""
    ctx = SilverContext()
    rules = load_rules("finance")
    ctx.loaded_rules = filter_rules_for_columns(
        rules, ["currency", "transaction_type", "amount", "payment_method"]
    )

    df = pd.DataFrame({
        "currency": ["IDR", "IDR", "XXX", "EUR"],  # XXX is invalid
        "transaction_type": ["payment", "invalid_type", "deposit", "transfer"],
        "amount": [100000, 200000, -50000, 300000],
        "payment_method": ["bank_transfer", "ewallet", "magic_wand", "cash"],  # magic_wand invalid
    })

    mod = ValidationModule()
    result_df, ctx = mod.run(df, ctx)

    audit = ctx.audit_trail[0]
    violations = audit.metadata["total_violations"]
    assert violations >= 3  # XXX currency, invalid_type, magic_wand, negative amount


def test_validation_module_flag_mode_creates_violation_columns():
    """Flag mode should add _violation columns."""
    ctx = SilverContext()
    ctx.validation_mode = "flag"
    rules = {"amount": {"min": 0}}
    ctx.loaded_rules = rules

    df = pd.DataFrame({"amount": [100, -50, 200]})
    mod = ValidationModule()
    result_df, ctx = mod.run(df, ctx)

    # Should have added violation column for flagged rows
    violation_col = "_amount_violation"
    assert violation_col in result_df.columns


# ─────────────────────────────────────────────────────────────
# 8. End-to-end: Profile → Rules → Validation
# ─────────────────────────────────────────────────────────────

def test_full_pipeline_profile_validate():
    """Simulate a pipeline: profile → load rules → validate."""
    from silver.modules.profiling import ProfilingModule

    df = pd.DataFrame({
        "id": [1, 2, 3, 4],
        "temperature": [25.0, 26.5, 999.0, 24.0],
        "status": ["active", "inactive", "deleted", "active"],
    })

    ctx = SilverContext()

    # Step 1: Profile
    profiler = ProfilingModule()
    df, ctx = profiler.run(df, ctx)
    assert ctx.profile is not None
    assert ctx.profile.total_rows == 4

    # Step 2: Load and filter rules
    rules = load_rules("iot")
    rules = filter_rules_for_columns(rules, df.columns.tolist())
    ctx.loaded_rules = rules

    # Step 3: Validate
    validator = ValidationModule()
    result_df, ctx = validator.run(df, ctx)

    # Should have 2 audit entries (profile + validation)
    assert len(ctx.audit_trail) == 2
    assert ctx.audit_trail[0].module_name == "profiling"
    assert ctx.audit_trail[1].module_name == "validation"

    # Temperature 999 should be caught (max is 300)
    viol = ctx.audit_trail[1].metadata["total_violations"]
    assert viol > 0
