"""Dataset Classifier — heuristic domain detection from column names and dtypes.

Classifies a dataset into one of 6 domains:
    - iot: sensor, device, telemetry data
    - finance: accounting, transactions, payments
    - sales: orders, customers, products
    - erp: inventory, warehouse, supply chain
    - hr: employees, payroll, attendance
    - general: catch-all fallback

Algorithm:
    1. Build a normalized set of column names (lowercase, stripped)
    2. Score each domain by keyword matching (weighted by specificity)
    3. Consider dtype composition (datetime columns → IoT/HR, currency → finance)
    4. Return highest-scoring domain + confidence

Design: heuristic-only (no ML dependency). Deterministic, fast, swappable.
"""

import pandas as pd
from typing import Tuple, Optional

from silver.models.types import SilverContext, Recommendation


# ─────────────────────────────────────────────────────────────
# Domain keywords (ordered by specificity: specific → generic)
# ─────────────────────────────────────────────────────────────

DOMAIN_KEYWORDS = {
    "iot": {
        "strong": [
            "temperature", "humidity", "pressure", "battery", "sensor",
            "device_id", "rssi", "snr", "voltage", "current", "power",
            "accelerometer", "gyroscope", "magnetometer", "latitude",
            "longitude", "altitude", "gps", "barometric", "thermometer",
            "hygrometer", "barometer", "proximity",
        ],
        "weak": [
            "timestamp", "reading", "value", "status", "signal", "battery_level",
            "firmware", "channel", "gateway", "node", "mqtt",
        ],
    },
    "finance": {
        "strong": [
            "transaction_id", "invoice_id", "payment_id", "debit", "credit",
            "ledger", "balance", "currency", "tax_code", "tax_rate",
            "account_type", "entry_type", "posting_date", "due_date",
            "counterparty", "reconciliation", "journal", "fiscal",
        ],
        "weak": [
            "amount", "total", "net", "gross", "reference", "description",
            "remark", "category", "date", "status", "approved",
            "bank", "payment_method", "cheque",
        ],
    },
    "sales": {
        "strong": [
            "order_id", "product_id", "sku", "customer_id", "loyalty_tier",
            "order_status", "sales_channel", "fulfillment_status",
            "unit_price", "cost_price", "selling_price", "discount_pct",
            "payment_status", "rating",
        ],
        "weak": [
            "price", "quantity", "qty", "units", "stock", "category",
            "description", "date", "customer", "product", "brand",
            "marketplace", "cart", "checkout", "review",
        ],
    },
    "erp": {
        "strong": [
            "item_id", "warehouse_id", "bin_location", "batch_number",
            "serial_number", "movement_type", "uom", "unit_of_measure",
            "reorder_point", "safety_stock", "supplier_id", "vendor_id",
            "po_status", "production_status", "work_center", "machine_id",
            "quality_status", "defect_rate", "yield_pct",
        ],
        "weak": [
            "quantity_on_hand", "quantity_reserved", "quantity_available",
            "max_stock", "min_stock", "zone", "supplier", "vendor",
            "receipt", "issue", "transfer", "adjustment", "scrap",
            "cycle_count", "inventory", "warehouse",
        ],
    },
    "hr": {
        "strong": [
            "employee_id", "nik", "npwp", "bpjs", "payroll_period",
            "attendance_status", "shift", "job_title", "job_level",
            "salary_grade", "performance_rating", "kpi_score",
            "hire_date", "termination_date", "review_status",
            "marital_status", "education_level", "employment_status",
        ],
        "weak": [
            "full_name", "first_name", "last_name", "gender", "age",
            "salary", "base_salary", "allowance", "bonus", "overtime",
            "department", "division", "position", "manager",
            "date_of_birth", "email", "phone", "address",
        ],
    },
}


def classify_dataset(
    df: pd.DataFrame,
    ctx: Optional[SilverContext] = None,
) -> Tuple[str, float]:
    """Classify a DataFrame into one of 6 domains.

    Args:
        df: DataFrame to classify
        ctx: Optional context (profile, existing classification)

    Returns:
        Tuple of (domain_name, confidence 0.0-1.0)
    """
    # Build normalized column set
    columns_lower = [c.lower().strip().replace(" ", "_") for c in df.columns]
    col_set = set(columns_lower)

    # Score each domain
    scores = {}
    for domain, keywords in DOMAIN_KEYWORDS.items():
        strong_hits = sum(1 for kw in keywords["strong"] if kw in col_set)
        weak_hits = sum(1 for kw in keywords["weak"] if kw in col_set)
        scores[domain] = strong_hits * 3 + weak_hits * 1

    # Dtype heuristic boosts
    _apply_dtype_heuristics(df, scores)

    # Find winner
    if not scores:
        return "general", 0.5

    max_score = max(scores.values())
    winner = max(scores, key=scores.get)

    # Confidence
    if max_score == 0:
        return "general", 0.3
    elif max_score >= 10:
        confidence = min(0.95, max_score / 15.0)
    elif max_score >= 5:
        confidence = 0.6 + (max_score - 5) * 0.07
    else:
        confidence = 0.3 + max_score * 0.06

    return winner, round(confidence, 2)


def _apply_dtype_heuristics(df: pd.DataFrame, scores: dict) -> None:
    """Boost domain scores based on column dtype composition."""
    numeric_count = 0
    datetime_count = 0
    string_count = 0
    total = len(df.columns)

    for col in df.columns:
        if pd.api.types.is_numeric_dtype(df[col]):
            numeric_count += 1
        elif pd.api.types.is_datetime64_any_dtype(df[col]):
            datetime_count += 1
        elif df[col].dtype == object:
            string_count += 1

    # IoT: many numeric + some datetime (sensors)
    if numeric_count / max(total, 1) > 0.6 and datetime_count >= 1:
        scores["iot"] = scores.get("iot", 0) + 2

    # Finance: balanced numeric + string + few datetime
    if numeric_count >= 2 and string_count >= 2 and datetime_count >= 1:
        scores["finance"] = scores.get("finance", 0) + 2

    # Sales: moderate numeric + moderate string
    if numeric_count / max(total, 1) > 0.3 and string_count / max(total, 1) > 0.3:
        scores["sales"] = scores.get("sales", 0) + 1

    # HR: mostly string + few numeric + few datetime
    if string_count / max(total, 1) > 0.5 and numeric_count >= 1 and datetime_count >= 1:
        scores["hr"] = scores.get("hr", 0) + 1

    # ERP: high numeric + moderate string
    if numeric_count / max(total, 1) > 0.4 and string_count >= 2:
        scores["erp"] = scores.get("erp", 0) + 1


# ─────────────────────────────────────────────────────────────
# Domain labels (human-readable)
# ─────────────────────────────────────────────────────────────

DOMAIN_LABELS = {
    "iot": "IoT / Sensor / Telemetry",
    "finance": "Finance / Accounting",
    "sales": "Sales / E-Commerce / POS",
    "erp": "ERP / Inventory / Supply Chain",
    "hr": "HR / Payroll / Workforce",
    "general": "General / Unknown",
}


def get_domain_label(domain: str) -> str:
    """Return human-readable label for a domain."""
    return DOMAIN_LABELS.get(domain, "Unknown")


def classify_and_store(df: pd.DataFrame, ctx: SilverContext) -> SilverContext:
    """Classify dataset and store results in context.

    Returns the updated context with dataset_class and class_confidence set.
    """
    domain, confidence = classify_dataset(df, ctx)
    ctx.dataset_class = domain
    ctx.class_confidence = confidence

    # Add recommendation if confidence is low
    if confidence < 0.5:
        ctx.add_recommendation(Recommendation(
            priority="LOW",
            category="classification",
            title=f"Dataset classified as '{get_domain_label(domain)}' with low confidence",
            description="Consider adding more descriptive column names or reviewing domain-specific rules.",
            confidence=confidence,
        ))

    return ctx


__all__ = [
    "classify_dataset",
    "classify_and_store",
    "get_domain_label",
    "DOMAIN_LABELS",
]
