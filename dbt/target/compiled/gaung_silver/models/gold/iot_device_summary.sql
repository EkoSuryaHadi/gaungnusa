-- dbt/models/gold/iot_device_summary.sql
-- Gold Layer: Device summary with anomaly flags
-- Incremental: only processes new data



SELECT
    device_id,
    COUNT(*) AS total_readings,
    ROUND(AVG(temperature_c), 2) AS avg_temperature,
    ROUND(AVG(humidity_pct), 2) AS avg_humidity,
    ROUND(AVG(vibration_g), 4) AS avg_vibration,
    ROUND(MIN(battery_v), 3) AS min_battery,
    ROUND(MAX(battery_v), 3) AS max_battery,
    SUM(_missing_count) AS total_missing,
    SUM(_anomaly_score) AS total_anomalies,
    MAX(timestamp) AS last_reading_at,
    NOW() AS summary_generated_at,

    -- Anomaly alert
    CASE
        WHEN AVG(temperature_c) > 200 THEN 'CRITICAL: temperature anomaly'
        WHEN MAX(battery_v) > 10 THEN 'WARNING: battery anomaly'
        WHEN SUM(_anomaly_score) > 5 THEN 'WARNING: multiple anomalies'
        ELSE 'OK'
    END AS alert_status

FROM "gaung"."main"."data_iot_silver"



GROUP BY device_id