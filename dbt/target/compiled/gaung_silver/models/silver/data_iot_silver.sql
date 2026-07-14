-- dbt/models/silver/data_iot_silver.sql
-- SCD Type 2: Slowly Changing Dimension
-- Preserves full history — never overwrites, only appends
-- Includes data quality validation flags



WITH raw_data AS (
    SELECT * FROM "gaung"."main"."source_iot"
),

-- Step 1: Basic cleaning + type casting
cleaned AS (
    SELECT
        device_id,
        timestamp,
        temperature_c,
        humidity_pct,
        vibration_g,
        battery_v,
        status_code,
        _source_file,
        _ingested_at,
        _row_seq,

        -- Quality flag: detect out-of-range values
        CASE
            WHEN temperature_c < -50  OR temperature_c > 300 THEN 1
            ELSE 0
        END AS _temp_outlier,

        CASE
            WHEN humidity_pct < 0 OR humidity_pct > 100 THEN 1
            ELSE 0
        END AS _humidity_outlier,

        CASE
            WHEN battery_v < 0 OR battery_v > 10 THEN 1
            ELSE 0
        END AS _battery_outlier,

        -- Anomaly score (sum of all outlier flags)
        (CASE WHEN temperature_c < -50 OR temperature_c > 300 THEN 1 ELSE 0 END +
         CASE WHEN humidity_pct < 0 OR humidity_pct > 100 THEN 1 ELSE 0 END +
         CASE WHEN battery_v < 0 OR battery_v > 10 THEN 1 ELSE 0 END
        ) AS _anomaly_score,

        -- Missing count per row
        (CASE WHEN temperature_c IS NULL THEN 1 ELSE 0 END +
         CASE WHEN humidity_pct IS NULL THEN 1 ELSE 0 END +
         CASE WHEN vibration_g IS NULL THEN 1 ELSE 0 END +
         CASE WHEN battery_v IS NULL THEN 1 ELSE 0 END
        ) AS _missing_count

    FROM raw_data
),

-- Step 2: Impute missing values (forward-fill per device)
imputed AS (
    SELECT
        device_id,
        timestamp,
        COALESCE(temperature_c,
            LAST_VALUE(temperature_c IGNORE NULLS) OVER (
                PARTITION BY device_id ORDER BY timestamp
                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            )
        ) AS temperature_c,

        COALESCE(humidity_pct,
            LAST_VALUE(humidity_pct IGNORE NULLS) OVER (
                PARTITION BY device_id ORDER BY timestamp
                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            )
        ) AS humidity_pct,

        COALESCE(vibration_g,
            LAST_VALUE(vibration_g IGNORE NULLS) OVER (
                PARTITION BY device_id ORDER BY timestamp
                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            )
        ) AS vibration_g,

        COALESCE(battery_v,
            LAST_VALUE(battery_v IGNORE NULLS) OVER (
                PARTITION BY device_id ORDER BY timestamp
                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            )
        ) AS battery_v,

        status_code,
        _source_file,
        _ingested_at,
        _row_seq,
        _temp_outlier,
        _humidity_outlier,
        _battery_outlier,
        _anomaly_score,
        _missing_count
    FROM cleaned
)

-- Step 3: Build SCD Type 2 with valid_from / valid_to
SELECT
    -- SCD key: unique identifier for each version of a row
    MD5(device_id || '|' || timestamp || '|' || _source_file) AS _scd_key,

    -- Business keys
    device_id,
    timestamp,

    -- Data columns
    temperature_c,
    humidity_pct,
    vibration_g,
    battery_v,
    status_code,

    -- SCD Type 2 temporal columns
    _ingested_at AS _valid_from,
    NULL::TIMESTAMP AS _valid_to,
    TRUE AS _is_current,

    -- Quality metadata
    _temp_outlier,
    _humidity_outlier,
    _battery_outlier,
    _anomaly_score,
    _missing_count,
    _source_file,
    _row_seq

FROM imputed