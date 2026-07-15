"""
Gaung V3 — Auto-Insight Engine
Deteksi trend, outlier, korelasi → Narasi Bahasa Indonesia
"""
import json
import hashlib
from datetime import datetime, timezone
from typing import Optional

import duckdb
import numpy as np
import pandas as pd
from scipy import stats

DB_PATH = "/home/ubuntu/gaung_v3/gaung.db"
MINIO_HOST = "localhost:9000"
MINIO_ACCESS = "gaung"
MINIO_SECRET = "gaung-minio-2026"


def _get_duckdb():
    con = duckdb.connect(DB_PATH)
    con.execute(f"""
        SET s3_endpoint='{MINIO_HOST}';
        SET s3_access_key_id='{MINIO_ACCESS}';
        SET s3_secret_access_key='{MINIO_SECRET}';
        SET s3_use_ssl=false;
        SET s3_url_style='path';
    """)
    return con


def init_insight_db():
    con = _get_duckdb()
    con.execute("""
        CREATE TABLE IF NOT EXISTS _insights (
            insight_id VARCHAR PRIMARY KEY,
            table_name VARCHAR,
            layer VARCHAR,
            insight_type VARCHAR,
            title VARCHAR,
            description TEXT,
            data JSON,
            confidence FLOAT,
            severity VARCHAR,
            generated_at TIMESTAMP,
            run_id VARCHAR
        )
    """)
    con.close()


# ─── Detectors ────────────────────────────────────────────

def detect_trends(df: pd.DataFrame, table_name: str) -> list[dict]:
    """Detect upward/downward trends in numeric columns"""
    insights = []
    numeric_cols = df.select_dtypes(include=[np.number]).columns

    for col in numeric_cols:
        series = df[col].dropna()
        if len(series) < 5:
            continue

        # Linear regression for trend
        x = np.arange(len(series))
        slope, intercept, r_value, p_value, std_err = stats.linregress(x, series.values)

        if p_value > 0.05:
            continue

        direction = "naik" if slope > 0 else "turun"
        change_pct = abs(slope * len(series) / series.mean() * 100) if series.mean() != 0 else 0

        if change_pct > 10:
            severity = "warning"
        elif change_pct > 5:
            severity = "info"
        else:
            continue

        insights.append({
            "type": "trend",
            "column": col,
            "direction": direction,
            "slope": round(slope, 4),
            "r_squared": round(r_value ** 2, 3),
            "change_percent": round(change_pct, 1),
            "confidence": round(1 - p_value, 3),
            "severity": severity,
            "title": f"{'📈' if slope > 0 else '📉'} {col} {direction} {change_pct:.1f}%",
        })

    return insights


def detect_outliers_isolation(df: pd.DataFrame, table_name: str) -> list[dict]:
    """Detect outliers using Isolation Forest"""
    from sklearn.ensemble import IsolationForest
    insights = []
    numeric_cols = df.select_dtypes(include=[np.number]).columns

    if len(numeric_cols) < 1 or len(df) < 10:
        return insights

    try:
        data = df[numeric_cols].dropna()
        if len(data) < 10:
            return insights

        iso = IsolationForest(contamination=0.05, random_state=42)
        preds = iso.fit_predict(data)
        outlier_count = (preds == -1).sum()
        outlier_pct = outlier_count / len(preds) * 100

        severity = "critical" if outlier_pct > 10 else ("warning" if outlier_pct > 5 else "info")

        insights.append({
            "type": "outlier",
            "total_rows": len(df),
            "outlier_count": int(outlier_count),
            "outlier_percent": round(outlier_pct, 1),
            "method": "isolation_forest",
            "severity": severity,
            "title": f"🚩 {outlier_count} outlier ({outlier_pct:.1f}%) terdeteksi",
        })
    except Exception:
        pass

    return insights


def detect_correlations(df: pd.DataFrame, table_name: str) -> list[dict]:
    """Detect strong correlations between numeric columns"""
    insights = []
    numeric_cols = df.select_dtypes(include=[np.number]).columns
    if len(numeric_cols) < 2:
        return insights

    corr_matrix = df[numeric_cols].corr()

    pairs = []
    for i in range(len(numeric_cols)):
        for j in range(i + 1, len(numeric_cols)):
            corr_val = corr_matrix.iloc[i, j]
            if abs(corr_val) > 0.7:
                pairs.append((numeric_cols[i], numeric_cols[j], corr_val))

    pairs.sort(key=lambda x: abs(x[2]), reverse=True)

    for col1, col2, corr in pairs[:5]:
        direction = "positif" if corr > 0 else "negatif"
        strength = "sangat kuat" if abs(corr) > 0.9 else "kuat"
        insights.append({
            "type": "correlation",
            "column_a": col1,
            "column_b": col2,
            "coefficient": round(corr, 3),
            "direction": direction,
            "strength": strength,
            "severity": "info",
            "title": f"🔗 {col1} ↔ {col2}: korelasi {direction} {strength} ({corr:.2f})",
        })

    return insights


def detect_seasonality(df: pd.DataFrame, table_name: str) -> list[dict]:
    """Detect seasonality patterns using autocorrelation"""
    insights = []

    # Try to find a date column
    date_cols = df.select_dtypes(include=['datetime64', 'object']).columns
    numeric_cols = df.select_dtypes(include=[np.number]).columns

    if len(date_cols) == 0 or len(numeric_cols) == 0:
        return insights

    for date_col in date_cols[:2]:
        try:
            ts = pd.to_datetime(df[date_col])
        except:
            continue

        for num_col in numeric_cols[:3]:
            series = df[num_col].dropna()
            if len(series) < 20:
                continue

            # Simple autocorrelation at lag 7 (weekly) and lag 30 (monthly)
            try:
                acf_7 = series.autocorr(lag=min(7, len(series) - 1))
                acf_30 = series.autocorr(lag=min(30, len(series) - 1)) if len(series) > 30 else 0

                if abs(acf_7) > 0.3 or abs(acf_30) > 0.3:
                    period = "mingguan" if abs(acf_7) > abs(acf_30) else "bulanan"
                    strength = abs(acf_7) if period == "mingguan" else abs(acf_30)
                    insights.append({
                        "type": "seasonality",
                        "column": num_col,
                        "period": period,
                        "strength": round(strength, 3),
                        "acf_7": round(acf_7, 3),
                        "acf_30": round(acf_30, 3),
                        "severity": "info",
                        "title": f"🔄 {num_col}: pola {period} terdeteksi (strength={strength:.2f})",
                    })
            except:
                pass

    return insights


# ─── Narrative Generator ──────────────────────────────────

def generate_narrative(insights: list[dict], table_name: str) -> str:
    """Generate human-readable narrative in Bahasa Indonesia"""
    if not insights:
        return f"✅ Data di tabel **{table_name}** terlihat normal. Tidak ada anomali atau tren signifikan yang terdeteksi."

    parts = []

    # Trends
    trends = [i for i in insights if i["type"] == "trend"]
    if trends:
        trend_texts = []
        for t in trends[:3]:
            trend_texts.append(f"{t['column']} **{t['direction']} {t['change_percent']:.1f}%**")
        parts.append(f"📊 **Analisis Tren:** {', '.join(trend_texts)}.")

    # Outliers
    outliers = [i for i in insights if i["type"] == "outlier"]
    if outliers:
        o = outliers[0]
        parts.append(f"🚩 **Anomali:** {o['outlier_count']} data point ({o['outlier_percent']:.1f}%) terdeteksi sebagai outlier.")

    # Correlations
    corrs = [i for i in insights if i["type"] == "correlation"]
    if corrs:
        c = corrs[0]
        parts.append(f"🔗 **Korelasi:** {c['column_a']} dan {c['column_b']} memiliki hubungan {c['direction']} yang {c['strength']} (r={c['coefficient']:.2f}).")

    # Seasonality
    seasons = [i for i in insights if i["type"] == "seasonality"]
    if seasons:
        s = seasons[0]
        parts.append(f"🔄 **Pola Musiman:** Data {s['column']} menunjukkan pola {s['period']}.")

    narrative = "\n\n".join(parts)
    narrative += f"\n\n---\n💡 *Insight dihasilkan otomatis oleh Gaung Auto-Insight Engine*"
    return narrative


# ─── Main Engine ──────────────────────────────────────────

def run_auto_insight(table_name: str, layer: str = "gold", run_id: Optional[str] = None) -> dict:
    """Main entry point — analyze a table and generate insights"""
    init_insight_db()
    con = _get_duckdb()

    if run_id is None:
        run_id = hashlib.md5(f"{table_name}|{datetime.now(timezone.utc).isoformat()}".encode()).hexdigest()[:8]

    # Load data
    df = con.execute(f"SELECT * FROM {table_name}").fetchdf()
    con.close()

    if len(df) == 0:
        return {"status": "empty", "insights": [], "narrative": "Tidak ada data untuk dianalisis."}

    # Run detectors
    all_insights = []
    all_insights.extend(detect_trends(df, table_name))
    all_insights.extend(detect_outliers_isolation(df, table_name))
    all_insights.extend(detect_correlations(df, table_name))
    all_insights.extend(detect_seasonality(df, table_name))

    # Generate narrative
    narrative = generate_narrative(all_insights, table_name)

    # Save to DB
    con = _get_duckdb()
    now = datetime.now(timezone.utc).isoformat()
    for idx, insight in enumerate(all_insights):
        insight_id = hashlib.md5(f"{run_id}|{idx}|{insight.get('title', '')}".encode()).hexdigest()[:16]
        con.execute(f"""
            INSERT INTO _insights VALUES (
                '{insight_id}', '{table_name}', '{layer}', '{insight['type']}',
                '{insight.get('title', '').replace("'", "''")}',
                '', '{json.dumps(insight, default=str).replace("'", "''")}',
                {insight.get('confidence', 0.8)}, '{insight.get('severity', 'info')}',
                '{now}', '{run_id}'
            )
            ON CONFLICT DO NOTHING
        """)
    con.close()

    return {
        "status": "ok",
        "table": table_name,
        "rows_analyzed": len(df),
        "columns_analyzed": len(df.columns),
        "insights_count": len(all_insights),
        "insights": all_insights,
        "narrative": narrative,
        "run_id": run_id,
    }


def get_latest_insights(table_name: str) -> list[dict]:
    """Get the most recent insights for a table"""
    con = _get_duckdb()
    results = con.execute(f"""
        SELECT insight_type, title, description, data, confidence, severity, generated_at
        FROM _insights
        WHERE table_name = '{table_name}'
        ORDER BY generated_at DESC
    """).fetchall()
    con.close()

    return [
        {"type": r[0], "title": r[1], "description": r[2],
         "data": json.loads(r[3]), "confidence": r[4],
         "severity": r[5], "generated_at": str(r[6])}
        for r in results
    ]
