"""Audit Logging Utility — wraps module execution with structured audit trails.

Two usage modes:
    1. Direct: log_audit(ctx, name, rows_before, rows_after, **metadata)
       Append a structured AuditEntry to the context without running a module.

    2. Decorator: @audit_logged(name)
       Wrap any function to auto-record timing, input/output sizes, and warnings.

    3. Context manager: with audit_ctx(ctx, name) as audit:
       Inline audit block that auto-records timing.

Designed to be used both inside BaseModule.run() and for ad-hoc audit events
in the pipeline orchestrator.
"""

import time
import traceback
from contextlib import contextmanager
from functools import wraps
from typing import Optional, Callable, Any

from silver.models.types import SilverContext, AuditEntry


# ─────────────────────────────────────────────────────────────
# Direct Audit Entry
# ─────────────────────────────────────────────────────────────

def log_audit(
    ctx: SilverContext,
    module_name: str,
    rows_before: int = 0,
    rows_after: int = 0,
    columns_before: int = 0,
    columns_after: int = 0,
    execution_ms: int = 0,
    module_version: str = "1.0.0",
    warnings: Optional[list] = None,
    errors: Optional[list] = None,
    **metadata: Any,
) -> AuditEntry:
    """Directly append a structured audit entry to the context.

    Use this for pipeline events that are not tied to a specific module,
    or for ad-hoc audit records.

    Args:
        ctx: Silver context to append to
        module_name: Name of the module/event
        rows_before: Row count before operation
        rows_after: Row count after operation
        columns_before: Column count before operation
        columns_after: Column count after operation
        execution_ms: Execution time in milliseconds
        module_version: Version string
        warnings: List of warning messages
        errors: List of error messages
        **metadata: Additional key-value metadata

    Returns:
        The created AuditEntry
    """
    entry = AuditEntry(
        module_name=module_name,
        module_version=module_version,
        execution_ms=execution_ms,
        rows_before=rows_before,
        rows_after=rows_after,
        columns_before=columns_before,
        columns_after=columns_after,
        warnings=warnings or [],
        errors=errors or [],
        metadata=metadata,
    )
    ctx.add_audit(entry)
    return entry


# ─────────────────────────────────────────────────────────────
# Context Manager
# ─────────────────────────────────────────────────────────────

@contextmanager
def audit_ctx(ctx: SilverContext, module_name: str, **extra_meta):
    """Context manager that auto-records timing and row counts.

    Usage:
        with audit_ctx(ctx, "custom_clean") as audit:
            df = my_clean_fn(df)
            audit.rows_after = len(df)

    Yields a dict that you can populate. On exit, creates an AuditEntry.
    """
    start = time.perf_counter()
    audit_state = {
        "rows_before": -1,
        "rows_after": -1,
        "columns_before": -1,
        "columns_after": -1,
        "warnings": [],
        "errors": [],
        "metadata": dict(extra_meta),
    }

    try:
        yield audit_state
    except Exception as e:
        audit_state["errors"].append(f"{type(e).__name__}: {e}")
        raise
    finally:
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        log_audit(
            ctx=ctx,
            module_name=module_name,
            rows_before=audit_state["rows_before"] if audit_state["rows_before"] >= 0 else 0,
            rows_after=audit_state["rows_after"] if audit_state["rows_after"] >= 0 else 0,
            columns_before=audit_state["columns_before"] if audit_state["columns_before"] >= 0 else 0,
            columns_after=audit_state["columns_after"] if audit_state["columns_after"] >= 0 else 0,
            execution_ms=elapsed_ms,
            warnings=audit_state["warnings"],
            errors=audit_state["errors"],
            **audit_state["metadata"],
        )


# ─────────────────────────────────────────────────────────────
# Decorator
# ─────────────────────────────────────────────────────────────

def audit_logged(module_name: str, module_version: str = "1.0.0"):
    """Decorator to auto-audit any function call.

    Wraps a function that takes (df, ctx) and returns (df, ctx).
    Auto-records timing, before/after row counts, and exceptions.

    Usage:
        @audit_logged("my_module")
        def my_clean(df, ctx):
            return df.dropna(), ctx
    """
    def decorator(fn: Callable):
        @wraps(fn)
        def wrapper(df, ctx, *args, **kwargs):
            rows_before = len(df) if hasattr(df, "__len__") else 0
            cols_before = len(df.columns) if hasattr(df, "columns") else 0
            start = time.perf_counter()
            warnings_list = []
            errors_list = []

            try:
                result_df, result_ctx = fn(df, ctx, *args, **kwargs)
            except Exception as e:
                elapsed_ms = int((time.perf_counter() - start) * 1000)
                log_audit(
                    ctx=ctx,
                    module_name=module_name,
                    module_version=module_version,
                    rows_before=rows_before,
                    rows_after=rows_before,
                    columns_before=cols_before,
                    columns_after=cols_before,
                    execution_ms=elapsed_ms,
                    errors=[f"{type(e).__name__}: {e}\n{traceback.format_exc()}"],
                    status="failed",
                )
                raise

            rows_after = len(result_df) if hasattr(result_df, "__len__") else 0
            cols_after = len(result_df.columns) if hasattr(result_df, "columns") else 0
            elapsed_ms = int((time.perf_counter() - start) * 1000)

            log_audit(
                ctx=result_ctx,
                module_name=module_name,
                module_version=module_version,
                rows_before=rows_before,
                rows_after=rows_after,
                columns_before=cols_before,
                columns_after=cols_after,
                execution_ms=elapsed_ms,
                warnings=warnings_list,
                errors=errors_list,
                status="success",
            )

            return result_df, result_ctx

        return wrapper
    return decorator


# ─────────────────────────────────────────────────────────────
# Audit Summary
# ─────────────────────────────────────────────────────────────

def get_audit_summary(ctx: SilverContext) -> dict:
    """Generate a summary of the audit trail for reporting.

    Args:
        ctx: Silver context with audit trail

    Returns:
        Dict with total_time_ms, module_count, errors, warnings, etc.
    """
    if not ctx.audit_trail:
        return {
            "total_modules": 0,
            "total_time_ms": 0,
            "total_warnings": 0,
            "total_errors": 0,
            "modules": [],
        }

    modules = []
    total_warnings = 0
    total_errors = 0
    total_time = 0

    for entry in ctx.audit_trail:
        modules.append({
            "module": entry.module_name,
            "version": entry.module_version,
            "execution_ms": entry.execution_ms,
            "rows_before": entry.rows_before,
            "rows_after": entry.rows_after,
            "warnings": len(entry.warnings),
            "errors": len(entry.errors),
        })
        total_warnings += len(entry.warnings)
        total_errors += len(entry.errors)
        total_time += entry.execution_ms

    return {
        "total_modules": len(modules),
        "total_time_ms": total_time,
        "total_warnings": total_warnings,
        "total_errors": total_errors,
        "modules": modules,
    }
