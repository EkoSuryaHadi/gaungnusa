"""Anomaly Detection — ML-based outlier detection with fallback.

Uses scikit-learn IsolationForest for unsupervised anomaly detection on numeric columns.
Falls back to IQR + Z-score if sklearn is not available.

Returns anomaly scores per row (0=normal, -1=anomaly) and per-column anomaly flags.

Design decisions:
    - IsolationForest: robust to high-dimensional data, no assumptions on distribution
    - Contamination: auto-estimated or configurable (default 0.05 = 5%)
    - Fallback: IQR (1.5×) + Z-score (>3σ) for pure-Python environments
    - Returns both row-level and column-level anomalies
"""

import pandas as pd
import numpy as np
from typing import Tuple, Optional, Dict, List, Any


class AnomalyDetector:
    """ML-based anomaly detection with IQR/Z-score fallback."""

    def __init__(self, contamination: float = 0.05, random_state: int = 42):
        """Initialize detector.

        Args:
            contamination: Expected proportion of anomalies (0.01 - 0.5)
            random_state: Seed for reproducibility
        """
        self.contamination = contamination
        self.random_state = random_state

    def detect(
        self,
        df: pd.DataFrame,
        columns: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Detect anomalies in the DataFrame.

        Args:
            df: DataFrame to analyze
            columns: Optional subset of numeric columns (None = all numeric)

        Returns:
            Dict with:
                - row_anomalies: array of -1/1 per row (-1 = anomaly)
                - row_scores: anomaly scores per row (lower = more anomalous)
                - column_anomalies: per-column IQR outlier counts
                - total_anomalies: total anomalous rows
                - method: "isolation_forest" or "iqr_zscore"
        """
        # ── Select numeric columns ────────────────────────
        if columns is None:
            numeric_cols = [
                c for c in df.columns
                if pd.api.types.is_numeric_dtype(df[c])
                and df[c].dropna().nunique() > 1  # constant columns ignored
            ]
        else:
            numeric_cols = [c for c in columns if c in df.columns]

        if not numeric_cols:
            return {
                "row_anomalies": np.ones(len(df)),
                "row_scores": np.ones(len(df)),
                "column_anomalies": {},
                "total_anomalies": 0,
                "method": "none",
            }

        # ── Prepare data (drop rows with all-null numeric) ─
        numeric_df = df[numeric_cols].copy()

        # ── Try IsolationForest, fallback to IQR+Zscore ──
        try:
            result = self._isolation_forest(numeric_df, numeric_cols)
        except ImportError:
            result = self._iqr_zscore_fallback(numeric_df, numeric_cols)

        # Column-level anomaly summary
        col_anomalies = self._column_outlier_summary(df, numeric_cols)

        return {
            "row_anomalies": result["row_anomalies"],
            "row_scores": result["row_scores"],
            "column_anomalies": col_anomalies,
            "total_anomalies": int((result["row_anomalies"] == -1).sum()),
            "method": result["method"],
        }

    # ── IsolationForest (scikit-learn) ─────────────────────

    def _isolation_forest(
        self, df: pd.DataFrame, numeric_cols: List[str]
    ) -> Dict[str, Any]:
        from sklearn.ensemble import IsolationForest
        from sklearn.impute import SimpleImputer

        # Impute missing values with median
        imputer = SimpleImputer(strategy="median")
        X = df[numeric_cols].values
        X_clean = imputer.fit_transform(X)

        # Cap contamination for small datasets
        n_samples = len(X_clean)
        if n_samples < 10:
            return self._iqr_zscore_fallback(df, numeric_cols)

        contamination = min(self.contamination, (n_samples - 1) / n_samples * 0.5)

        model = IsolationForest(
            contamination=contamination,
            random_state=self.random_state,
            n_estimators=100,
        )
        labels = model.fit_predict(X_clean)
        scores = model.score_samples(X_clean)

        return {
            "row_anomalies": labels,
            "row_scores": scores,
            "method": "isolation_forest",
        }

    # ── IQR + Z-score fallback ────────────────────────────

    def _iqr_zscore_fallback(
        self, df: pd.DataFrame, numeric_cols: List[str]
    ) -> Dict[str, Any]:
        n_rows = len(df)
        anomaly_votes = np.zeros(n_rows, dtype=int)

        for col_name in numeric_cols:
            col = df[col_name].dropna()
            if len(col) < 4:
                continue

            # IQR method
            q1 = col.quantile(0.25)
            q3 = col.quantile(0.75)
            iqr = q3 - q1
            if iqr > 0:
                lower = q1 - 1.5 * iqr
                upper = q3 + 1.5 * iqr
                anomaly_votes += ((df[col_name] < lower) | (df[col_name] > upper)).astype(int)

            # Z-score method (>3σ)
            std = col.std()
            if std > 0:
                mean = col.mean()
                z_anomaly = (abs(df[col_name] - mean) > 3 * std).astype(int)
                anomaly_votes += z_anomaly

        # Row is anomalous if any method flagged it
        labels = np.where(anomaly_votes >= 1, -1, 1)
        scores = 1.0 - (anomaly_votes / max(len(numeric_cols) * 2, 1))

        return {
            "row_anomalies": labels,
            "row_scores": scores,
            "method": "iqr_zscore",
        }

    # ── Column outlier summary ────────────────────────────

    def _column_outlier_summary(
        self, df: pd.DataFrame, numeric_cols: List[str]
    ) -> Dict[str, int]:
        summary = {}
        for col_name in numeric_cols:
            col = df[col_name].dropna()
            if len(col) < 4:
                summary[col_name] = 0
                continue
            q1 = col.quantile(0.25)
            q3 = col.quantile(0.75)
            iqr = q3 - q1
            if iqr > 0:
                lower = q1 - 1.5 * iqr
                upper = q3 + 1.5 * iqr
                count = int(((df[col_name] < lower) | (df[col_name] > upper)).sum())
                summary[col_name] = count
            else:
                summary[col_name] = 0
        return summary


# ─────────────────────────────────────────────────────────────
# Convenience function
# ─────────────────────────────────────────────────────────────

def detect_anomalies(
    df: pd.DataFrame,
    columns: Optional[List[str]] = None,
    contamination: float = 0.05,
) -> Dict[str, Any]:
    """Convenience: detect anomalies in a DataFrame."""
    detector = AnomalyDetector(contamination=contamination)
    return detector.detect(df, columns)


__all__ = ["AnomalyDetector", "detect_anomalies"]
