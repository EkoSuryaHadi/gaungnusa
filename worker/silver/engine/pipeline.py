"""Silver Pipeline — fluent API for building and chaining quality modules.

Designed to be the clean interface between the orchestrator and
individual modules. Provides type-safe, chainable methods.

Usage:
    pipeline = SilverPipeline(df, ctx)
    pipeline.profile().classify().validate().score().explain()
    df, ctx = pipeline.run()

Or manual:
    pipeline.profile().datatype()
    pipeline.add_module("duplicate")
    df, ctx = pipeline.run()
"""

import pandas as pd
from typing import List, Optional, Tuple

from silver.models.types import SilverContext
from silver.engine.module_loader import (
    get_module_instance,
    load_rules,
    filter_rules_for_columns,
    merge_rules,
)
from silver.ai.classifier import classify_and_store
from silver.ai.recommender import Recommender
from silver.ai.explainability import generate_explanations
from silver.ai.anomaly import detect_anomalies


class SilverPipeline:
    """Fluent builder for Silver quality pipelines.

    Pipelines are built by chaining method calls, then executed
    with .run(). Each method adds modules to an internal execution queue.

    The pipeline is immutable during execution — a new pipeline copy
    is returned from each method for safe chaining.
    """

    def __init__(
        self,
        df: pd.DataFrame,
        ctx: Optional[SilverContext] = None,
        domain: Optional[str] = None,
    ):
        """Initialize pipeline with data and optional context.

        Args:
            df: Input DataFrame
            ctx: Existing context (creates new if None)
            domain: Force a specific domain (skip auto-classification)
        """
        self.df = df.copy()
        self.ctx = ctx or SilverContext()
        self._modules: List[Tuple[str, dict]] = []  # (module_name, kwargs)
        self._domain = domain
        self._anomaly_result = None

    # ── Builder Methods (return self for chaining) ─────

    def profile(self) -> "SilverPipeline":
        """Run data profiling to compute DataProfile."""
        self._modules.append(("profiling", {}))
        return self

    def datatype(self) -> "SilverPipeline":
        """Detect and cast column types."""
        self._modules.append(("datatype", {}))
        return self

    def timestamp(self) -> "SilverPipeline":
        """Normalize timestamp columns."""
        self._modules.append(("timestamp", {}))
        return self

    def duplicate(self, mode: str = "flag") -> "SilverPipeline":
        """Detect/remove duplicate rows.
        Args:
            mode: 'flag' (default) or 'drop'
        """
        self._modules.append(("duplicate", {"mode": mode}))
        return self

    def missing(self, strategy: str = "flag", fill_value: Optional[str] = None) -> "SilverPipeline":
        """Handle missing values.
        Args:
            strategy: 'flag', 'drop', 'mean', 'median', 'mode', 'fill'
            fill_value: Value to fill when strategy='fill'
        """
        kwargs = {"strategy": strategy}
        if fill_value is not None:
            kwargs["fill_value"] = fill_value
        self._modules.append(("missing", kwargs))
        return self

    def outlier(self, method: str = "iqr", mode: str = "flag") -> "SilverPipeline":
        """Detect outliers.
        Args:
            method: 'iqr' or 'zscore'
            mode: 'flag', 'drop', or 'clip'
        """
        self._modules.append(("outlier", {"method": method, "mode": mode}))
        return self

    def enrichment(self, mappings: Optional[dict] = None) -> "SilverPipeline":
        """Enrich data with lookup mappings."""
        kwargs = {}
        if mappings:
            kwargs["mappings"] = mappings
        self._modules.append(("enrichment", kwargs))
        return self

    def classify(self) -> "SilverPipeline":
        """Auto-classify dataset domain (IoT/Finance/Sales/ERP/HR/General)."""
        self._modules.append(("_classify", {}))
        return self

    def validate(self, domain: Optional[str] = None) -> "SilverPipeline":
        """Run YAML rule-based validation.
        Args:
            domain: Override domain for rule selection
        """
        kwargs = {}
        if domain:
            kwargs["domain"] = domain
        self._modules.append(("validation", kwargs))
        return self

    def score(self) -> "SilverPipeline":
        """Compute Data Quality Index (DQI 0-100)."""
        self._modules.append(("scoring", {}))
        return self

    def recommend(self) -> "SilverPipeline":
        """Generate prioritized recommendations."""
        self._modules.append(("_recommend", {}))
        return self

    def explain(self, max_explanations: int = 50) -> "SilverPipeline":
        """Generate per-row rule violation explanations."""
        kwargs = {"max_explanations": max_explanations}
        self._modules.append(("_explain", kwargs))
        return self

    def detect_anomalies(self, contamination: float = 0.05) -> "SilverPipeline":
        """ML-based anomaly detection."""
        self._modules.append(("_anomaly", {"contamination": contamination}))
        return self

    # ── Quick Presets ──────────────────────────────────

    def quick(self) -> "SilverPipeline":
        """Quick quality check: profile + datatype + timestamp + fill missing + classify + validate + score."""
        return self.profile().datatype().timestamp().missing(strategy="fill_interpolate").classify().validate().score()

    def full(self, domain: Optional[str] = None) -> "SilverPipeline":
        """Full pipeline: profile → classify → all cleaning → validate → score → explain."""
        pipe = self.profile().datatype().timestamp()
        if domain:
            pipe._domain = domain
        return pipe.duplicate().missing().outlier().classify().validate().score().recommend().explain()

    def deep(self) -> "SilverPipeline":
        """Deep analysis: full pipeline + anomaly detection + enrichment."""
        return self.full().detect_anomalies().enrichment()

    # ── Execution ─────────────────────────────────────

    def run(self) -> Tuple[pd.DataFrame, SilverContext]:
        """Execute all queued modules in order.

        Returns:
            Tuple of (transformed DataFrame, populated SilverContext)
        """
        df = self.df
        ctx = self.ctx

        for module_name, kwargs in self._modules:
            df, ctx = self._execute_module(df, ctx, module_name, kwargs)

        return df, ctx

    # ── Private ────────────────────────────────────────

    def _execute_module(
        self,
        df: pd.DataFrame,
        ctx: SilverContext,
        name: str,
        kwargs: dict,
    ) -> Tuple[pd.DataFrame, SilverContext]:
        """Execute a single module by name, handling special AI modules."""
        # ── Special AI modules (not BaseModule subclasses) ──
        if name == "_classify":
            classify_and_store(df, ctx)
            return df, ctx

        if name == "_recommend":
            rec = Recommender()
            recommendations = rec.generate(df, ctx)
            for r in recommendations:
                ctx.add_recommendation(r)
            return df, ctx

        if name == "_explain":
            max_n = kwargs.get("max_explanations", 50)
            generate_explanations(df, ctx, max_n)
            return df, ctx

        if name == "_anomaly":
            contamination = kwargs.get("contamination", 0.05)
            result = detect_anomalies(df, contamination=contamination)
            self._anomaly_result = result
            ctx.module_timings["anomaly_total"] = int(
                (result.get("row_anomalies", []) == -1).sum()
            )
            return df, ctx

        # ── Standard modules ────────────────────────────
        module = get_module_instance(name)
        if module is None:
            ctx.add_warning(f"Module '{name}' not found, skipping")
            return df, ctx

        # Validation modules: auto-load rules if not loaded
        if name == "validation":
            self._auto_load_rules(ctx, kwargs.get("domain"))

        # Apply kwargs to module if it has those attributes
        for key, value in kwargs.items():
            if hasattr(module, key):
                setattr(module, key, value)

        return module.run(df, ctx)

    def _auto_load_rules(self, ctx: SilverContext, domain: Optional[str] = None):
        """Auto-load YAML rules if not already loaded."""
        if ctx.loaded_rules:
            return  # Already loaded

        dataset_class = domain or self._domain or ctx.dataset_class or "general"

        # Load domain + generic rules, merge (domain overrides generic)
        domain_rules = load_rules(dataset_class)
        generic_rules = load_rules("generic") if dataset_class != "generic" else {}

        merged = merge_rules(generic_rules, domain_rules)
        ctx.loaded_rules = filter_rules_for_columns(
            merged, self.df.columns.tolist()
        )
        ctx.active_rules_file = f"{dataset_class}.yaml"


__all__ = ["SilverPipeline"]
