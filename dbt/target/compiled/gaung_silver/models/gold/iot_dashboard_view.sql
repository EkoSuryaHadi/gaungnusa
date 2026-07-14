-- dbt/models/gold/iot_dashboard_view.sql
-- Gold: Materialized View for Dashboard (pre-computed, instant queries)
-- This is what the Gaung UI dashboard queries instead of live aggregation



-- Global stats
WITH global_stats AS (
    SELECT
        COUNT(DISTINCT device_id) AS total_devices,
        COUNT(*) AS total_readings,
        ROUND(AVG(temperature_c), 2) AS overall_avg_temp,
        ROUND(AVG(humidity_pct), 2) AS overall_avg_humidity,
        SUM(CASE WHEN _anomaly_score > 0 THEN 1 ELSE 0 END) AS anomalous_readings,
        SUM(_missing_count) AS total_missing_values
    FROM "gaung"."main"."data_iot_silver"
    WHERE _is_current = TRUE
),

-- Top anomaly devices
top_anomalies AS (
    SELECT
        device_id,
        COUNT(*) AS readings,
        SUM(_anomaly_score) AS anomaly_count,
        ROUND(AVG(temperature_c), 1) AS avg_temp
    FROM "gaung"."main"."data_iot_silver"
    WHERE _is_current = TRUE
    GROUP BY device_id
    HAVING SUM(_anomaly_score) > 0
    ORDER BY anomaly_count DESC
    LIMIT 5
),

-- Battery status
battery_status AS (
    SELECT
        device_id,
        ROUND(MIN(battery_v), 2) AS min_battery,
        ROUND(MAX(battery_v), 2) AS max_battery,
        ROUND(AVG(battery_v), 2) AS avg_battery
    FROM "gaung"."main"."data_iot_silver"
    WHERE _is_current = TRUE AND battery_v IS NOT NULL
    GROUP BY device_id
),

-- Recent readings (last 10)
recent AS (
    SELECT device_id, temperature_c, humidity_pct, timestamp
    FROM "gaung"."main"."data_iot_silver"
    WHERE _is_current = TRUE
    ORDER BY timestamp DESC
    LIMIT 10
)

-- Combine into dashboard response
SELECT
    gs.*,
    (SELECT COUNT(*) FROM top_anomalies) AS devices_with_anomalies,
    (SELECT COUNT(*) FROM battery_status WHERE min_battery < 3.5) AS low_battery_devices,
    (SELECT COUNT(*) FROM battery_status WHERE max_battery > 5) AS overvoltage_devices
FROM global_stats gs