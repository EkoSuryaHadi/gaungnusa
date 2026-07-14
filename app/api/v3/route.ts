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
    const { stdout } = await execAsync(
      `/usr/bin/python3 /home/ubuntu/gaung_v3/api_helper.py ${endpoint}`,
      { timeout: 15000 }
    );
    return NextResponse.json(JSON.parse(stdout.trim()));
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
