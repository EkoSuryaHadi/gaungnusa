import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { spawn } from "child_process";
import { writeFileSync } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

/**
 * One-click quick process: Bronze → Silver
 *
 * POST /api/sources/[id]/quick-process
 *   → Auto-creates pipeline (SOURCE → CLEAN → SILVER_QUALITY → OUTPUT)
 *   → Runs it synchronously
 *   → Returns result with DQI score
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Allow internal calls (auto-triggered from upload flow) to bypass auth
  const isInternalCall = req.headers.get("x-internal-call") === "1";

  let session;
  if (!isInternalCall) {
    session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } else {
    // For internal calls, find the admin user as fallback session
    const admin = await prisma.user.findFirst({ where: { email: "admin@gaung.io" } });
    if (!admin) return NextResponse.json({ error: "Internal: no admin user" }, { status: 500 });
    session = { userId: admin.id, tenantId: admin.tenantId };
  }

  const { id } = await params;
  const sourceId = parseInt(id);

  // 1. Look up source (for table name in Bronze)
  // Admin can access any source; regular users scoped to their own tenant/user
  const source = session.role === "ADMIN"
    ? await prisma.dataSource.findFirst({ where: { id: sourceId } })
    : await prisma.dataSource.findFirst({
        where: {
          id: sourceId,
          OR: [
            { userId: session.userId },
            { tenantId: session.tenantId ?? undefined },
          ],
        },
      });
  if (!source) return NextResponse.json({ error: "Source not found" }, { status: 404 });

  // Bronze table name (snake_case from file name)
  const bronzeTable = source.name
    .replace(/\.[^.]+$/, "")           // strip extension
    .replace(/[^a-zA-Z0-9]/g, "_")     // only alphanum + underscore
    .replace(/_+/g, "_")               // collapse multiple underscores
    .toLowerCase()
    + "_bronze_raw";

  const silverTable = source.name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9]/g, "_")
    .replace(/_+/g, "_")
    .toLowerCase()
    + "_silver";

  const pipelineName = `${source.name} → Silver (Quick Process)`;
  // Use source's tenantId (not session's) — admin from Default tenant can process PT 123 sources
  const tenantId = source.tenantId ?? null;

  // 2. REUSE existing Quick Process pipeline for this source if available
  let pipeline = await prisma.pipeline.findFirst({
    where: {
      sourceId,
      tenantId,
      name: pipelineName,
    },
    include: { steps: { orderBy: { order: "asc" } } },
  });

  if (!pipeline) {
    // First time: create new pipeline
    pipeline = await prisma.pipeline.create({
      data: {
        userId: session.userId,
        tenantId,
        name: pipelineName,
        sourceId,
        status: "DRAFT",
        steps: {
          create: [
            {
              order: 1,
              type: "SOURCE",
              config: JSON.stringify({ sourceTable: bronzeTable, sourceLayer: "BRONZE" }),
            },
            {
              order: 2,
              type: "CLEAN",
              config: JSON.stringify({ stripWhitespace: true, deduplicate: true, normalizeCase: "upper", complementaryFill: true }),
            },
            {
              order: 3,
              type: "SILVER_QUALITY",
              config: JSON.stringify({ silverMode: "full" }),
            },
            {
              order: 4,
              type: "OUTPUT",
              outputLayer: "SILVER",
              outputTable: silverTable,
              config: JSON.stringify({ outputLayer: "SILVER", outputTable: silverTable }),
            },
          ],
        },
      },
      include: { steps: { orderBy: { order: "asc" } } },
    });
  }

  // 3. Create run record
  const run = await prisma.pipelineRun.create({
    data: { pipelineId: pipeline.id, status: "RUNNING", startedAt: new Date() },
  });

  try {
    // 4. Execute ETL
    const configPath = `/tmp/gaung_quick_${run.id}.json`;
    writeFileSync(configPath, JSON.stringify({
      pipelineId: pipeline.id,
      runId: run.id,
      source: {
        fromLakehouse: true,
        sourceTable: bronzeTable,
        sourceLayer: "BRONZE",
      },
      steps: pipeline.steps.map((s: any) => ({
        ...s,
        config: typeof s.config === "string" ? JSON.parse(s.config) : s.config,
      })),
    }));

    const result = await runETL(configPath);

    // 5. Update run result
    const finishedRun = await prisma.pipelineRun.update({
      where: { id: run.id },
      data: {
        status: result.success ? "SUCCESS" : "FAILED",
        finishedAt: new Date(),
        rowsOutput: result.rows,
        errorMessage: result.error || null,
        logs: result.logs || "",
        qualityScore: result.silverQuality || undefined,
        silverAudit: result.silverAudit || undefined,
      },
    });

    if (result.success) {
      await prisma.pipeline.update({
        where: { id: pipeline.id },
        data: { status: "ACTIVE" },
      });

      // Register lakehouse table
      if (result.outputs && result.outputs.length > 0) {
        for (const output of result.outputs) {
          await prisma.lakehouseTable.upsert({
            where: { layer_tableName: { layer: output.layer.toUpperCase(), tableName: output.table } },
            update: { rowsCount: output.rows, schema: JSON.stringify(output.columns || []), updatedAt: new Date(), tenantId: tenantId ?? null },
            create: {
              layer: output.layer.toUpperCase(),
              tableName: output.table,
              displayName: output.table.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
              schema: JSON.stringify(output.columns || []),
              rowsCount: output.rows,
              ...(tenantId ? { tenantId } : {}),
            },
          });
        }
      }
    }

    return NextResponse.json({
      pipelineId: pipeline.id,
      runId: finishedRun.id,
      status: finishedRun.status,
      rows: result.rows,
      columns: result.columns || [],
      silverTable,
      qualityScore: result.silverQuality || null,
      silverAudit: result.silverAudit || null,
      logs: result.logs || "",
      error: result.error || null,
    });
  } catch (error: any) {
    console.error("Quick process error:", error);
    await prisma.pipelineRun.update({
      where: { id: run.id },
      data: { status: "FAILED", finishedAt: new Date(), errorMessage: error.message },
    });
    return NextResponse.json({ error: error.message, status: "FAILED" }, { status: 500 });
  }
}

function runETL(configPath: string): Promise<{
  success: boolean;
  rows: number;
  columns: { name: string; type: string }[];
  outputs?: { layer: string; table: string; rows: number; columns: { name: string; type: string }[] }[];
  logs: string;
  error: string | null;
  silverQuality?: any;
  silverAudit?: any;
}> {
  return new Promise((resolve) => {
    const scriptPath = path.join(process.cwd(), "worker", "etl_runner.py");
    // Ensure DATABASE_URL and other critical env vars are passed to Python subprocess
    const childEnv = {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL || "",
      DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || "",
      PATH: process.env.PATH || "/usr/bin",
      HOME: process.env.HOME || "/home/ubuntu",
    };
    const proc = spawn("/usr/bin/python3", [scriptPath, configPath], {
      env: childEnv,
      timeout: 300000,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
    proc.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

    proc.on("close", (code: number | null) => {
      const logs = stdout + (stderr ? "\n=== STDERR ===\n" + stderr : "");
      try {
        const lines = stdout.split("\n");
        const jsonLine = lines.filter((l) => l.trim().startsWith("{")).pop() || "{}";
        const result = JSON.parse(jsonLine);
        resolve({
          success: code === 0,
          rows: result.rows || 0,
          columns: result.columns || [],
          outputs: result.outputs || undefined,
          logs,
          error: stderr || null,
          silverQuality: result.silverQuality || undefined,
          silverAudit: result.silverAudit || undefined,
        });
      } catch {
        resolve({
          success: code === 0,
          rows: 0,
          columns: [],
          logs,
          error: stderr || null,
        });
      }
    });

    proc.on("error", (err) => {
      resolve({ success: false, rows: 0, columns: [], logs: "", error: err.message });
    });
  });
}
