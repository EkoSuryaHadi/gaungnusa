"""
Silver AI Data Quality Engine
===============================

Clean Architecture plugin-based data quality engine for Gaung v2.4.

Architecture:
    engine/     — Orchestration & pipeline coordination
    modules/    — Independent plugin modules (BaseModule interface)
    rules/      — YAML-based validation rules per domain
    ai/         — AI services (classifier, recommender, explainability)
    models/     — Data classes (DataProfile, SilverContext, AuditEntry)
    utils/      — Shared helpers

Usage:
    from silver.engine.orchestrator import SilverOrchestrator
    orchestrator = SilverOrchestrator()
    df_clean, ctx = orchestrator.run(df, config={"mode": "full"})
"""

__version__ = "1.0.0"
