"""Silver Orchestrator — central coordinator for Silver quality pipelines.

Accepts a DataFrame + optional config, runs the full Silver pipeline,
and returns (transformed_df, context_with_scores_audit_explanations).

Designed to be the single entry point that etl_runner.py calls via step_silver().

Config format (from pipeline step):
    {
        "mode": "quick" | "full" | "deep" | "custom",
        "domain": "iot" | null (auto-detect),
        "modules": ["profiling", "validation", "scoring"],  // custom mode only
        "validation_mode": "flag" | "drop",
        "tenant_id": 1,
        "pipeline_id": 5,
        "run_id": 42,
    }
"""

import time
import pandas as pd
from typing import Tuple, Optional, Dict, Any

from silver.models.types import SilverContext, AuditEntry
from silver.engine.pipeline import SilverPipeline
from silver.engine.module_loader import reload_rules


class SilverOrchestratorError(Exception):
    """Base exception for Silver orchestrator errors."""
    pass


class SilverOrchestrator:
    """Coordinates the Silver pipeline execution end-to-end.

    Usage:
        orch = SilverOrchestrator()
        df, ctx = orch.run(df, config={"mode": "full"})
    """

    def __init__(self):
        """Initialize orchestrator. Reload rules to ensure freshness."""
        reload_rules()

    def run(
        self,
        df: pd.DataFrame,
        config: Optional[Dict[str, Any]] = None,
    ) -> Tuple[pd.DataFrame, SilverContext]:
        """Run the Silver pipeline on the given DataFrame.

        Args:
            df: Input DataFrame (usually from Bronze layer)
            config: Pipeline configuration dict

        Returns:
            Tuple of (processed DataFrame, SilverContext with full state)

        Raises:
            SilverOrchestratorError: If pipeline execution fails
        """
        config = config or {}
        mode = config.get("mode", "full")
        domain = config.get("domain")
        validation_mode = config.get("validation_mode", "flag")

        # ── Build context ──────────────────────────────
        ctx = SilverContext(
            tenant_id=config.get("tenant_id"),
            pipeline_id=config.get("pipeline_id"),
            run_id=config.get("run_id"),
            mode=mode,
        )

        if validation_mode:
            ctx.loaded_rules = getattr(ctx, "loaded_rules", {})
            setattr(ctx, "validation_mode", validation_mode)

        # ── Build pipeline ─────────────────────────────
        start = time.perf_counter()

        try:
            pipe = SilverPipeline(df, ctx, domain=domain)

            if mode == "quick":
                pipe.quick()
            elif mode == "deep":
                pipe.deep()
            elif mode == "custom":
                modules = config.get("modules", [])
                if not modules:
                    raise SilverOrchestratorError(
                        "Custom mode requires 'modules' list in config"
                    )
                self._build_custom(pipe, modules)
            else:
                # Default: full
                pipe.full(domain=domain)

            df, ctx = pipe.run()

        except Exception as e:
            elapsed_ms = int((time.perf_counter() - start) * 1000)
            ctx.add_error(f"SilverOrchestrator: {type(e).__name__}: {e}")
            ctx.add_audit(AuditEntry(
                module_name="silver_orchestrator",
                module_version="2.0.0",
                execution_ms=elapsed_ms,
                rows_before=len(df) if df is not None else 0,
                rows_after=len(df) if df is not None else 0,
                errors=[f"{type(e).__name__}: {e}"],
                metadata={"status": "failed", "mode": mode},
            ))
            raise SilverOrchestratorError(f"Pipeline failed: {e}") from e

        # ── Final audit ────────────────────────────────
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        ctx.add_audit(AuditEntry(
            module_name="silver_orchestrator",
            module_version="2.0.0",
            execution_ms=elapsed_ms,
            rows_before=len(df) if df is not None else 0,
            rows_after=len(df),
            metadata={
                "status": "success",
                "mode": mode,
                "domain": ctx.dataset_class,
                "dqi_overall": ctx.quality_score.overall if ctx.quality_score else None,
                "total_recommendations": len(ctx.recommendations),
                "total_explanations": len(ctx.explanations),
                "total_warnings": len(ctx.warnings),
                "total_errors": len(ctx.errors),
            },
        ))

        return df, ctx

    def _build_custom(self, pipe: SilverPipeline, modules: list) -> None:
        """Build a custom pipeline from module names."""
        module_map = {
            "profiling":   lambda: pipe.profile(),
            "datatype":    lambda: pipe.datatype(),
            "timestamp":   lambda: pipe.timestamp(),
            "duplicate":   lambda: pipe.duplicate(),
            "missing":     lambda: pipe.missing(),
            "outlier":     lambda: pipe.outlier(),
            "enrichment":  lambda: pipe.enrichment(),
            "validation":  lambda: pipe.validate(),
            "scoring":     lambda: pipe.score(),
            "classify":    lambda: pipe.classify(),
            "recommend":   lambda: pipe.recommend(),
            "explain":     lambda: pipe.explain(),
            "anomaly":     lambda: pipe.detect_anomalies(),
        }

        for mod_name in modules:
            builder = module_map.get(mod_name)
            if builder:
                builder()
            else:
                pipe.ctx.add_warning(f"Unknown module '{mod_name}', skipped")


# ─────────────────────────────────────────────────────────────
# Convenience function
# ─────────────────────────────────────────────────────────────

def run_silver_pipeline(
    df: pd.DataFrame,
    config: Optional[Dict[str, Any]] = None,
) -> Tuple[pd.DataFrame, SilverContext]:
    """Convenience wrapper for SilverOrchestrator.run()."""
    orch = SilverOrchestrator()
    return orch.run(df, config)


__all__ = ["SilverOrchestrator", "SilverOrchestratorError", "run_silver_pipeline"]
