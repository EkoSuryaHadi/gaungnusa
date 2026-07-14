-- dbt/models/gold/iot_hourly_summary.sql
-- Gold: Hourly aggregation per device



SELECT
    device_id || '|' || DATE_TRUNC('hour', timestamp)::VARCHAR AS hour_key,
    device_id,
    DATE_TRUNC('hour', timestamp) AS hour_bucket,

    COUNT(*) AS readings_this_hour,
    ROUND(AVG(temperature_c), 2) AS avg_temperature,
    ROUND(AVG(humidity_pct), 2) AS avg_humidity,
    ROUND(AVG(vibration_g), 4) AS avg_vibration,
    ROUND(MIN(battery_v), 3) AS min_battery,
    ROUND(MAX(battery_v), 3) AS max_battery,

    SUM(CASE WHEN temperature_c IS NULL THEN 1 ELSE 0 END) AS null_temperature,
    SUM(CASE WHEN humidity_pct IS NULL THEN 1 ELSE 0 END) AS null_humidity,
    SUM(_anomaly_score) AS anomalies_this_hour,

    COUNT(DISTINCT timestamp) AS unique_timestamps,

    NOW() AS generated_at

FROM "gaung"."main"."data_iot_silver"



GROUP BY device_id, DATE_TRUNC('hour', timestamp)
ORDER BY hour_bucket DESC