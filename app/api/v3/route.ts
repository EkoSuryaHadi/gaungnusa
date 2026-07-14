import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  if (token !== "gaung-export-2026") {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const endpoint = req.nextUrl.searchParams.get("endpoint") || "dashboard";

  try {
    let cmd = "";

    if (endpoint === "dashboard") {
      cmd = `cd /home/ubuntu/gaung_v3 && python3 -c "
import duckdb, json
con = duckdb.connect('gaung.db')
con.execute(\"SET s3_endpoint='localhost:9000'; SET s3_access_key_id='gaung'; SET s3_secret_access_key='gaung-minio-2026'; SET s3_use_ssl=false; SET s3_url_style='path';\")
r = con.execute('SELECT * FROM iot_dashboard_view').fetchone()
cols = [d[0] for d in con.execute('SELECT column_name FROM information_schema.columns WHERE table_name=\\\"iot_dashboard_view\\\"').fetchall()]
d = dict(zip(cols, [str(v) for v in r]))
d['v3_status'] = 'active'
print(json.dumps(d, default=str))
con.close()
"`;
    } else if (endpoint === "lineage") {
      cmd = `cd /home/ubuntu/gaung_v3 && python3 -c "
import sys; sys.path.insert(0, '.')
from lineage.tracker import get_lineage_graph
import json
print(json.dumps(get_lineage_graph(), default=str))
"`;
    } else if (endpoint === "parity") {
      cmd = `cd /home/ubuntu/gaung_v3 && python3 -c "
import duckdb, json
con = duckdb.connect('gaung.db')
con.execute('INSTALL postgres; LOAD postgres;')
con.execute(\\\"ATTACH 'host=localhost port=5433 dbname=gaung user=gaung password=gaung123' AS v2 (TYPE postgres)\\")
con.execute(\\\"SET s3_endpoint='localhost:9000'; SET s3_access_key_id='gaung'; SET s3_secret_access_key='gaung-minio-2026'; SET s3_use_ssl=false; SET s3_url_style='path';\\\")

parity = {}
checks = [
    ('bronze', 'v2.bronze.data_iot_bronze_raw', 'bronze_data_iot_6_latest'),
    ('silver', 'v2.silver.data_iot_silver', 'data_iot_silver'),
    ('gold_summary', 'v2.gold.iot_device_summary', 'iot_device_summary'),
    ('gold_quality', 'v2.gold.iot_device_quality_rank', 'iot_device_quality_rank'),
]
for name, v2t, v3t in checks:
    try:
        v2 = con.execute(f'SELECT count(*) FROM {v2t}').fetchone()[0]
        v3 = con.execute(f'SELECT count(*) FROM {v3t}').fetchone()[0]
        parity[name] = {'v2': v2, 'v3': v3, 'match': v2==v3}
    except Exception as e:
        parity[name] = {'error': str(e)[:80]}
con.close()
print(json.dumps(parity))
"`;
    }

    const { stdout } = await execAsync(cmd, { timeout: 15000 });
    return NextResponse.json(JSON.parse(stdout.trim()));
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
