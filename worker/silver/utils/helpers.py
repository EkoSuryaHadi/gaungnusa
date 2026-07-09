"""Shared utilities for the Silver Data Quality Engine."""

import time
from functools import wraps
from typing import Callable, Any
import pandas as pd


def time_execution(func: Callable) -> Callable:
    """Decorator to measure execution time of a function.

    Usage:
        @time_execution
        def my_slow_function():
            ...
    """
    @wraps(func)
    def wrapper(*args, **kwargs) -> Any:
        start = time.perf_counter()
        result = func(*args, **kwargs)
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        # If the result is a tuple with context, add timing
        if isinstance(result, tuple) and len(result) == 2:
            df, ctx = result
            ctx.module_timings[func.__name__] = elapsed_ms
            return df, ctx
        return result
    return wrapper


def safe_divide(numerator: float, denominator: float, default: float = 0.0) -> float:
    """Safely divide two numbers, returning default if denominator is zero."""
    if denominator == 0:
        return default
    return numerator / denominator


def pct_format(value: float, decimals: int = 2) -> float:
    """Format a ratio (0-1) as percentage (0-100) rounded to decimals."""
    return round(value * 100, decimals)


def is_numeric_dtype(dtype) -> bool:
    """Check if a pandas dtype is numeric."""
    return pd.api.types.is_numeric_dtype(dtype)


def is_datetime_dtype(dtype) -> bool:
    """Check if a pandas dtype is datetime."""
    return pd.api.types.is_datetime64_any_dtype(dtype)


def is_string_dtype(dtype) -> bool:
    """Check if a pandas dtype is string-like."""
    return pd.api.types.is_string_dtype(dtype) or dtype == object
