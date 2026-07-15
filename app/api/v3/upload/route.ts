import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const execAsync = promisify(exec);
const UPLOAD_DIR = "/home/ubuntu/gaung/uploads";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const sourceName = formData.get("sourceName") as string;
    const token = formData.get("token") as string;

    if (token !== "gaung-export-2026") {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
    if (!file) {
      return NextResponse.json({ error: "No file" }, { status: 400 });
    }

    await mkdir(UPLOAD_DIR, { recursive: true });
    const filePath = path.join(UPLOAD_DIR, file.name);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    const pythonScript = `
import sys; sys.path.insert(0, '/home/ubuntu/gaung_v3')
from bronze.ingest import ingest_csv_to_bronze
import json
result = ingest_csv_to_bronze('${filePath}', '${sourceName}', 6, 46)
print(json.dumps({
    'status': 'ok',
    'rows': result['row_count'],
    'size': result['file_size_bytes'],
    'path': result['parquet_path'],
    'time': str(result['row_count']) + ' baris, ' + str(result['file_size_bytes']) + ' bytes'
}))
`.trim();

    const { stdout } = await execAsync(
      `/usr/bin/python3 -c '${pythonScript.replace(/'/g, "'\\''")}'`,
      { timeout: 60000 }
    );

    // Find the JSON line (last line)
    const lines = stdout.trim().split("\n");
    const jsonLine = lines[lines.length - 1];
    return NextResponse.json(JSON.parse(jsonLine));
  } catch (error: any) {
    const msg = error.stderr || error.stdout || error.message;
    return NextResponse.json({ error: String(msg).substring(0, 300) }, { status: 500 });
  }
}
