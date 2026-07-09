"""Dynamic module loader for Silver Data Quality Engine.

Discovers and instantiates available modules, loads YAML rules,
and provides factory functions for building module pipelines.

Key features:
    - Auto-discovery: scans modules/ directory for BaseModule subclasses
    - YAML rules loader: loads domain-specific validation rules
    - Module registry: caches discovered modules for performance
"""

import importlib
import inspect
import os
import yaml
from pathlib import Path
from typing import Dict, List, Optional, Type

from silver.modules.base import BaseModule
from silver.models.types import SilverContext


# ─────────────────────────────────────────────────────────────
# Module Registry
# ─────────────────────────────────────────────────────────────

_MODULE_REGISTRY: Optional[Dict[str, Type[BaseModule]]] = None
_RULES_CACHE: Dict[str, dict] = {}


def discover_modules() -> Dict[str, Type[BaseModule]]:
    """Scan the silver/modules/ directory and discover all BaseModule subclasses.

    Modules are auto-discovered by:
    1. Listing all .py files in silver/modules/
    2. Importing each module
    3. Finding classes that inherit from BaseModule (but are not BaseModule itself)

    Returns:
        Dict mapping module name (str) → module class
    """
    global _MODULE_REGISTRY

    if _MODULE_REGISTRY is not None:
        return _MODULE_REGISTRY

    registry: Dict[str, Type[BaseModule]] = {}
    modules_dir = Path(__file__).parent.parent / "modules"

    if not modules_dir.exists():
        return registry

    for fpath in modules_dir.glob("*.py"):
        module_name = fpath.stem
        # Skip __init__ and base
        if module_name.startswith("_") or module_name == "base":
            continue

        try:
            mod = importlib.import_module(f"silver.modules.{module_name}")
            for _, obj in inspect.getmembers(mod, inspect.isclass):
                if (
                    issubclass(obj, BaseModule)
                    and obj is not BaseModule
                    and obj.__module__ == mod.__name__
                ):
                    registry[obj.name] = obj
        except Exception as e:
            # Module failed to load — skip gracefully
            pass

    _MODULE_REGISTRY = registry
    return registry


def get_available_modules() -> List[str]:
    """Return list of available module names."""
    return sorted(discover_modules().keys())


def get_module_instance(name: str) -> Optional[BaseModule]:
    """Get an instantiated module by name.

    Args:
        name: Module name (e.g., "profiling", "duplicate", "outlier")

    Returns:
        Instantiated BaseModule or None if not found
    """
    registry = discover_modules()
    module_cls = registry.get(name)
    if module_cls:
        return module_cls()
    return None


def get_modules_for_dataset(dataset_class: str, ctx: Optional[SilverContext] = None) -> List[BaseModule]:
    """Get recommended modules for a specific dataset class.

    Different dataset types need different modules:
        IoT: datatype → timestamp → outlier → missing → validation
        Finance: datatype → duplicate → validation → scoring
        Sales: datatype → timestamp → duplicate → missing → validation
        ERP: datatype → duplicate → enrichment → validation
        HR: datatype → missing → validation → scoring
        General: datatype → duplicate → missing → outlier → validation

    Args:
        dataset_class: One of "iot", "finance", "sales", "erp", "hr", "general"
        ctx: Optional context (not currently used, for future AI decisions)

    Returns:
        List of instantiated BaseModule instances in recommended order
    """
    module_order_map = {
        "iot":       ["datatype", "timestamp", "outlier", "missing", "validation"],
        "finance":   ["datatype", "duplicate", "validation", "scoring"],
        "sales":     ["datatype", "timestamp", "duplicate", "missing", "validation"],
        "erp":       ["datatype", "duplicate", "enrichment", "validation"],
        "hr":        ["datatype", "missing", "validation", "scoring"],
        "general":   ["datatype", "duplicate", "missing", "outlier", "validation"],
    }

    order = module_order_map.get(dataset_class, module_order_map["general"])
    modules = []
    for name in order:
        instance = get_module_instance(name)
        if instance:
            modules.append(instance)
    return modules


# ─────────────────────────────────────────────────────────────
# YAML Rules Engine
# ─────────────────────────────────────────────────────────────

def get_rules_dir() -> Path:
    """Get the path to the rules directory."""
    return Path(__file__).parent.parent / "rules"


def list_available_rules() -> List[str]:
    """List available YAML rule files."""
    rules_dir = get_rules_dir()
    if not rules_dir.exists():
        return []
    return sorted([
        f.stem for f in rules_dir.glob("*.yaml")
    ] + [
        f.stem for f in rules_dir.glob("*.yml")
    ])


def load_rules(dataset_class: Optional[str] = None) -> dict:
    """Load validation rules for a specific dataset class.

    Loading priority:
    1. If dataset_class is provided, load {class}.yaml
    2. Fallback: load generic.yaml

    Rules are cached in memory for performance.

    Args:
        dataset_class: One of "iot", "finance", "sales", "erp", "hr", "general"

    Returns:
        Dict of rules (column_name → {min, max, type, ...})
    """
    rules_dir = get_rules_dir()

    # Determine which file to load
    if dataset_class:
        candidates = [
            rules_dir / f"{dataset_class}.yaml",
            rules_dir / f"{dataset_class}.yml",
        ]
    else:
        candidates = []

    # Always try generic as fallback
    candidates.append(rules_dir / "generic.yaml")
    candidates.append(rules_dir / "generic.yml")

    for path in candidates:
        if not path.exists():
            continue

        cache_key = str(path)
        if cache_key in _RULES_CACHE:
            return _RULES_CACHE[cache_key]

        try:
            with open(path) as f:
                rules = yaml.safe_load(f) or {}
            _RULES_CACHE[cache_key] = rules
            return rules
        except Exception:
            continue

    # No rules found at all
    return {}


def reload_rules() -> None:
    """Clear the rules cache. Call after updating YAML files."""
    global _RULES_CACHE
    _RULES_CACHE = {}
    global _MODULE_REGISTRY
    _MODULE_REGISTRY = None


# ─────────────────────────────────────────────────────────────
# Rule Utilities
# ─────────────────────────────────────────────────────────────

def filter_rules_for_columns(rules: dict, columns: list) -> dict:
    """Filter loaded rules to only those applicable to the given column names.

    Args:
        rules: Full rules dict (column_name → rule_spec)
        columns: List of column names in the DataFrame

    Returns:
        Dict with only rules matching columns in the DataFrame
    """
    if not rules:
        return {}
    col_set = set(columns)
    return {col: rule for col, rule in rules.items() if col in col_set}


def merge_rules(*rule_dicts: dict) -> dict:
    """Merge multiple rule dicts. Later dicts override earlier ones for same keys.

    Use case: load generic rules first, then domain-specific rules on top.
    Domain-specific rules take precedence over generic ones.

    Args:
        *rule_dicts: One or more rule dicts to merge

    Returns:
        Merged rules dict (domain overrides generic)
    """
    merged = {}
    for rd in rule_dicts:
        if rd:
            merged.update(rd)
    return merged


def validate_rules_structure(rules: dict) -> tuple:
    """Validate that a loaded rules dict has the correct structure.

    Returns (is_valid, errors_list).
    """
    valid_rule_keys = {"min", "max", "values", "pattern", "unique"}
    errors = []

    if not isinstance(rules, dict):
        return False, ["Rules must be a dict"]

    for col_name, rule in rules.items():
        if not isinstance(col_name, str):
            errors.append(f"Column name must be string, got: {type(col_name)}")
            continue

        if not isinstance(rule, dict):
            errors.append(f"Rule for '{col_name}' must be a dict, got: {type(rule)}")
            continue

        unknown_keys = set(rule.keys()) - valid_rule_keys
        if unknown_keys:
            errors.append(
                f"Unknown rule keys for '{col_name}': {unknown_keys}. "
                f"Valid keys: {sorted(valid_rule_keys)}"
            )

        # cross-check min/max types
        if "min" in rule and "max" in rule:
            try:
                if isinstance(rule["min"], (int, float)) and isinstance(rule["max"], (int, float)):
                    if rule["min"] > rule["max"]:
                        errors.append(
                            f"min ({rule['min']}) > max ({rule['max']}) for '{col_name}'"
                        )
            except (TypeError, ValueError):
                pass

        if "values" in rule and not isinstance(rule["values"], list):
            errors.append(f"'values' for '{col_name}' must be a list, got: {type(rule['values'])}")

        if "unique" in rule and not isinstance(rule["unique"], bool):
            errors.append(f"'unique' for '{col_name}' must be a boolean, got: {type(rule['unique'])}")

    return len(errors) == 0, errors


__all__ = [
    "discover_modules",
    "get_available_modules",
    "get_module_instance",
    "get_modules_for_dataset",
    "list_available_rules",
    "load_rules",
    "reload_rules",
    "filter_rules_for_columns",
    "merge_rules",
    "validate_rules_structure",
]
