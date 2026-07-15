import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  const step = req.nextUrl.searchParams.get("step") || "silver";
  const table = req.nextUrl.searchParams.get("table") || "data_iot";

  if (token !== "gaung-export-2026") {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  try {
    let cmd = "";

    if (step === "silver") {
      cmd = `cd /home/ubuntu/gaung_v3/dbt && PATH="/home/ubuntu/.local/bin:$PATH" dbt run --select source_iot data_iot_silver --project-dir /home/ubuntu/gaung_v3/dbt 2>&1`;
    } else if (step === "gold") {
      cmd = `cd /home/ubuntu/gaung_v3/dbt && PATH="/home/ubuntu/.local/bin:$PATH" dbt run --select iot_device_summary iot_device_quality_rank iot_dashboard_view --project-dir /home/ubuntu/gaung_v3/dbt 2>&1`;
    }

    const { stdout } = await execAsync(cmd, { timeout: 60000 });

    // Parse output for row counts
    const passed = (stdout.match(/OK/g) || []).length;
    const time = stdout.match(/(\d+\.\d+)s/)?.[1] || "?";

    return NextResponse.json({
      status: "ok",
      step,
      rows: 0,
      models_passed: passed,
      time: `${time}s · ${passed} models`,
    });
  } catch (error: any) {
    const stderr = error.stderr || error.message;
    // Check if dbt output has useful info even on non-zero exit
    const passed = (stderr.match(/OK/g) || []).length;
    if (passed > 0) {
      return NextResponse.json({
        status: "ok",
        step,
        rows: 0,
        models_passed: passed,
        time: `${passed} models ok`,
      });
    }
    return NextResponse.json({ error: stderr.substring(0, 500) }, { status: 500 });
  }
}
