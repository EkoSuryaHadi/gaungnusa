
  
  create view "gaung"."main"."source_iot__dbt_tmp" as (
    -- dbt/models/bronze/source_iot.sql



WITH base AS (
    SELECT
        device_id,
        temperature_c,
        humidity_pct,
        vibration_g,
        battery_v,
        timestamp,
        status_code,
        _source_file,
        _ingested_at
    FROM "gaung"."main"."bronze_data_iot_6_latest"
)
SELECT
    device_id,
    TRY_CAST(temperature_c AS DOUBLE) AS temperature_c,
    TRY_CAST(humidity_pct AS DOUBLE) AS humidity_pct,
    vibration_g::DOUBLE AS vibration_g,
    TRY_CAST(battery_v AS DOUBLE) AS battery_v,
    TRY_CAST(timestamp AS TIMESTAMP) AS timestamp,
    status_code,
    _source_file,
    TRY_CAST(_ingested_at AS TIMESTAMP) AS _ingested_at,
    ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY timestamp) AS _row_seq,
    COUNT(*) OVER (PARTITION BY device_id) AS _device_total_rows
FROM base
  );
