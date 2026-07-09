"""Base module interface for the Silver Data Quality Engine.

All modules MUST inherit from BaseModule and implement the abstract run() method.

Design principles:
    - SOLID: Interface Segregation — single method contract
    - Plugin Architecture: modules are swappable, discoverable
    - Pure functions: run(df, ctx) → (df, ctx), no side effects on global state

Example:
    class DuplicateModule(BaseModule):
        name = "duplicate"
        version = "1.0.0"
        description = "Detects and removes duplicate rows"

        def run(self, df, ctx):
            before = len(df)
            df = df.drop_duplicates()
            after = len(df)
            ctx.add_audit(AuditEntry(
                module_name=self.name,
                rows_before=before,
                rows_after=after,
                warnings=[f"Removed {before - after} duplicate rows"],
            ))
            return df, ctx
"""

from abc import ABC, abstractmethod
from typing import Tuple
import pandas as pd

# Forward reference for type hinting
from silver.models.types import SilverContext


class BaseModule(ABC):
    """Abstract base for all Silver quality modules.

    Every module is a plugin that takes a DataFrame + context and returns
    a (possibly transformed) DataFrame + updated context.

    The context object accumulates profile data, audit trails, quality
    scores, warnings, errors, and recommendations across the pipeline.
    """

    # Subclasses MUST override these
    name: str = "base"
    version: str = "1.0.0"
    description: str = "Base module — override in subclass"

    @abstractmethod
    def run(
        self,
        df: pd.DataFrame,
        ctx: SilverContext,
    ) -> Tuple[pd.DataFrame, SilverContext]:
        """Execute this module's logic on the given DataFrame.

        Args:
            df: Input DataFrame to process
            ctx: Mutable context carrying pipeline state

        Returns:
            Tuple of (transformed DataFrame, updated context)

        Contract:
            1. Must NOT mutate the input DataFrame (work on copy if needed)
            2. Must update ctx with audit entries for traceability
            3. Must handle empty DataFrames gracefully
            4. Must be thread-safe (no shared mutable state between instances)
        """
        ...

    def __repr__(self) -> str:
        return f"{self.name} v{self.version} — {self.description}"

    def __str__(self) -> str:
        return self.__repr__()
