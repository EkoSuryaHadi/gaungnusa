
        
            delete from "gaung"."main"."iot_device_summary"
            where (
                device_id) in (
                select (device_id)
                from "iot_device_summary__dbt_tmp20260715204809488165"
            );

        
    

    insert into "gaung"."main"."iot_device_summary" ("device_id", "total_readings", "avg_temperature", "avg_humidity", "avg_vibration", "min_battery", "max_battery", "total_missing", "total_anomalies", "last_reading_at", "summary_generated_at", "alert_status")
    (
        select "device_id", "total_readings", "avg_temperature", "avg_humidity", "avg_vibration", "min_battery", "max_battery", "total_missing", "total_anomalies", "last_reading_at", "summary_generated_at", "alert_status"
        from "iot_device_summary__dbt_tmp20260715204809488165"
    )
  