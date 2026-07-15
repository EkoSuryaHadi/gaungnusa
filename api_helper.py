"""V3 Dashboard API helper — returns dashboard stats as JSON"""
import sys, json, duckdb

ENDPOINT = sys.argv[1] if len(sys.argv) > 1 else "dashboard"
con = duckdb.connect("/home/ubuntu/gaung_v3/gaung.db")
con.execute("SET s3_endpoint='localhost:9000'; SET s3_access_key_id='gaung'; SET s3_secret_access_key='gaung-minio-2026'; SET s3_use_ssl=false; SET s3_url_style='path';")

if ENDPOINT == "dashboard":
    r = con.execute("SELECT * FROM iot_dashboard_view").fetchone()
    cols = [d[0] for d in con.execute("DESCRIBE iot_dashboard_view").fetchall()]
    d = dict(zip(cols, [str(v) for v in r]))
    d["v3_status"] = "active"
    print(json.dumps(d, default=str))

elif ENDPOINT == "lineage":
    sys.path.insert(0, "/home/ubuntu/gaung_v3")
    from lineage.tracker import get_lineage_graph
    print(json.dumps(get_lineage_graph(), default=str))

elif ENDPOINT == "parity":
    con.execute("INSTALL postgres; LOAD postgres;")
    con.execute("ATTACH 'host=localhost port=5433 dbname=gaung user=gaung password=gaung123' AS v2 (TYPE postgres)")
    parity = {}
    checks = [
        ("bronze", "v2.bronze.data_iot_bronze_raw", "bronze_data_iot_6_latest"),
        ("silver", "v2.silver.data_iot_silver", "data_iot_silver"),
        ("gold_summary", "v2.gold.iot_device_summary", "iot_device_summary"),
        ("gold_quality", "v2.gold.iot_device_quality_rank", "iot_device_quality_rank"),
    ]
    for name, v2t, v3t in checks:
        try:
            v2 = con.execute(f"SELECT count(*) FROM {v2t}").fetchone()[0]
            v3 = con.execute(f"SELECT count(*) FROM {v3t}").fetchone()[0]
            parity[name] = {"v2": v2, "v3": v3, "match": v2 == v3}
        except Exception as e:
            parity[name] = {"error": str(e)[:80]}
    print(json.dumps(parity))

elif ENDPOINT == "insight":
    table = sys.argv[2] if len(sys.argv) > 2 else "iot_device_summary"
    layer = sys.argv[3] if len(sys.argv) > 3 else "gold"
    sys.path.insert(0, "/home/ubuntu/gaung_v3")
    from insight.engine import run_auto_insight
    result = run_auto_insight(table, layer)
    print(json.dumps(result, default=str, ensure_ascii=False))

con.close()
