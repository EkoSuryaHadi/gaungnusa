
  
    
    

    create  table
      "gaung"."main"."iot_device_quality_rank"
  
    as (
      -- dbt/models/gold/iot_device_quality_rank.sql
-- Gold: Device Quality Ranking with DQI score



SELECT
    device_id,
    COUNT(*) AS total_readings,
    ROUND(AVG(temperature_c), 2) AS avg_temperature,
    ROUND(AVG(humidity_pct), 2) AS avg_humidity,
    SUM(_missing_count) AS total_missing,
    SUM(_anomaly_score) AS total_anomalies,

    -- Data Quality Index (0–100)
    ROUND(
        100
        - (SUM(_missing_count) * 1.0 / COUNT(*) * 40)  -- 40% weight: completeness
        - (SUM(_anomaly_score) * 1.0 / COUNT(*) * 50)  -- 50% weight: validity
        - (CASE WHEN COUNT(DISTINCT timestamp) < COUNT(*) THEN 10 ELSE 0 END)  -- 10% weight: uniqueness
    , 1) AS dqi_score,

    -- Quality tier
    CASE
        WHEN ROUND(100 - (SUM(_missing_count)*1.0/COUNT(*)*40) - (SUM(_anomaly_score)*1.0/COUNT(*)*50) - (CASE WHEN COUNT(DISTINCT timestamp) < COUNT(*) THEN 10 ELSE 0 END), 1) >= 90 THEN 'A - Excellent'
        WHEN ROUND(100 - (SUM(_missing_count)*1.0/COUNT(*)*40) - (SUM(_anomaly_score)*1.0/COUNT(*)*50) - (CASE WHEN COUNT(DISTINCT timestamp) < COUNT(*) THEN 10 ELSE 0 END), 1) >= 70 THEN 'B - Good'
        WHEN ROUND(100 - (SUM(_missing_count)*1.0/COUNT(*)*40) - (SUM(_anomaly_score)*1.0/COUNT(*)*50) - (CASE WHEN COUNT(DISTINCT timestamp) < COUNT(*) THEN 10 ELSE 0 END), 1) >= 50 THEN 'C - Fair'
        ELSE 'D - Poor'
    END AS quality_tier,

    ROW_NUMBER() OVER (ORDER BY
        ROUND(100 - (SUM(_missing_count)*1.0/COUNT(*)*40) - (SUM(_anomaly_score)*1.0/COUNT(*)*50) - (CASE WHEN COUNT(DISTINCT timestamp) < COUNT(*) THEN 10 ELSE 0 END), 1) DESC
    ) AS quality_rank,

    NOW() AS generated_at

FROM "gaung"."main"."data_iot_silver"



GROUP BY device_id
ORDER BY dqi_score DESC
    );
  
  
  