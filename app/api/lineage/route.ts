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

  try {
    // Run lineage visualizer and capture output
    const cmd = `cd /home/ubuntu/gaung_v3 && /usr/bin/python3 -c "
import sys; sys.path.insert(0, '.')
from lineage.tracker import get_lineage_graph
import json
print(json.dumps(get_lineage_graph(), default=str))
"`;

    const { stdout } = await execAsync(cmd, { timeout: 10000 });
    const lineage = JSON.parse(stdout.trim());

    return NextResponse.json(lineage);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
