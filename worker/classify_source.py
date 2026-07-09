#!/usr/bin/env python3
"""Classify a data source file into a domain (IoT, Sales, Finance, ERP, HR, general).

Usage: python3 classify_source.py <file_path>

Input:  path to a CSV/Excel/JSON file
Output: JSON on stdout — { domain, label, confidence }
"""

import sys
import json
import os

import pandas as pd

# Add project root to path for silver imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from worker.silver.ai.classifier import classify_dataset, get_domain_label


def load_file(filepath: str) -> pd.DataFrame:
    """Load a data file into a DataFrame."""
    ext = os.path.splitext(filepath)[1].lower()

    if ext == ".csv":
        df = pd.read_csv(filepath, nrows=1000)
    elif ext in (".xlsx", ".xls"):
        df = pd.read_excel(filepath, nrows=1000)
    elif ext == ".json":
        df = pd.read_json(filepath)
    elif ext == ".parquet":
        df = pd.read_parquet(filepath)
    else:
        raise ValueError(f"Unsupported file type: {ext}")

    return df


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: classify_source.py <file_path>"}))
        sys.exit(1)

    filepath = sys.argv[1]

    if not os.path.exists(filepath):
        print(json.dumps({"error": f"File not found: {filepath}"}))
        sys.exit(1)

    try:
        df = load_file(filepath)
        domain, confidence = classify_dataset(df)
        label = get_domain_label(domain)

        result = {
            "domain": domain,
            "label": label,
            "confidence": confidence,
            "columns": len(df.columns),
            "rows_sampled": len(df),
        }

        print(json.dumps(result))
        sys.exit(0)

    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
