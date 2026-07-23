
        
            delete from "gaung"."main"."iot_device_quality_rank"
            where (
                device_id) in (
                select (device_id)
                from "iot_device_quality_rank__dbt_tmp20260715204809243191"
            );

        
    

    insert into "gaung"."main"."iot_device_quality_rank" ("device_id", "total_readings", "avg_temperature", "avg_humidity", "total_missing", "total_anomalies", "dqi_score", "quality_tier", "quality_rank", "generated_at")
    (
        select "device_id", "total_readings", "avg_temperature", "avg_humidity", "total_missing", "total_anomalies", "dqi_score", "quality_tier", "quality_rank", "generated_at"
        from "iot_device_quality_rank__dbt_tmp20260715204809243191"
    )
  