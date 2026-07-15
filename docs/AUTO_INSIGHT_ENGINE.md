# 🧠 Gaung V3 — Auto-Insight Engine Blueprint

> "Data speaks for itself" — ketika data masuk Gold, AI otomatis menghasilkan insight

---

## Arsitektur

```
GOLD TABLE (DuckDB)
       │
       ▼
┌─────────────────────────────────┐
│     INSIGHT ENGINE (Python)      │
│                                  │
│  ┌──────────┐  ┌──────────────┐ │
│  │ Profiler │  │  Detector    │ │
│  │ min/max  │  │ trend ↑↓     │ │
│  │ avg/std  │  │ outlier 🚩   │ │
│  │ % null   │  │ correlation  │ │
│  │ # unique │  │ seasonality  │ │
│  └────┬─────┘  └──────┬───────┘ │
│       │               │         │
│       └───────┬───────┘         │
│               ▼                 │
│  ┌─────────────────────────────┐│
│  │    Insight Aggregator       ││
│  │  Score + Rank + Filter      ││
│  └────────────┬────────────────┘│
│               ▼                 │
│  ┌─────────────────────────────┐│
│  │   Narrative Generator (LLM)  ││
│  │  Bahasa Indonesia natural   ││
│  └────────────┬────────────────┘│
└───────────────┼─────────────────┘
                ▼
   ┌─────────────────────────┐
   │  INSIGHT RESULTS         │
   │  DuckDB table:           │
   │  _insights               │
   └────────────┬────────────┘
                ▼
   ┌─────────────────────────┐
   │  DASHBOARD / API         │
   │  💡 Auto-Insight Widget  │
   └─────────────────────────┘
```

---

## Detection Methods

| Method | Deteksi | Library | Output |
|---|---|---|---|
| **trend** | ↑/↓/→ per kolom numerik | scipy.stats | direction + slope + confidence |
| **outlier** | Nilai ekstrim | sklearn IsolationForest | anomaly_score + flag |
| **correlation** | Hubungan antar kolom | pandas corr() | pair + coefficient + interpretation |
| **seasonality** | Pola periodik | statsmodels | period + strength |
| **distribution** | Skew, kurtosis | scipy.stats | skew + kurtosis + interpretation |

---

## Narrative Generator (LLM)

```
Input:  { "trends": [...], "outliers": [...], "correlations": [...] }
Prompt: "Kamu data analyst. Jelaskan insight ini dalam Bahasa Indonesia 
         yang mudah dipahami, maksimal 3 paragraf."
Output: "Revenue Januari-Maret naik 23% YoY, didorong oleh..."
```

---

## Integration Points

1. **Dagster job** — `auto_insight` asset, trigger after Gold
2. **dbt post-hook** — run insight after model completion
3. **API endpoint** — `/api/v3/insights?table=X&token=Y`
4. **Dashboard widget** — `InsightCard` component

---

## Schema

```sql
CREATE TABLE _insights (
    insight_id VARCHAR PRIMARY KEY,
    table_name VARCHAR,
    layer VARCHAR,
    insight_type VARCHAR,  -- trend, outlier, correlation, seasonality
    title VARCHAR,
    description TEXT,       -- narrative in Bahasa Indonesia
    data JSON,              -- raw stats
    confidence FLOAT,
    severity VARCHAR,       -- info, warning, critical
    generated_at TIMESTAMP,
    run_id VARCHAR
)
```
