import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { spawn } from "child_process";
import { writeFileSync } from "fs";
import path from "path";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const pipeline = await prisma.pipeline.findFirst({
    where: { id: parseInt(id), userId: session.userId, ...(session.tenantId ? { tenantId: session.tenantId } : {}) },
    include: { steps: { orderBy: { order: "asc" } }, source: true },
  });

  if (!pipeline) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Create run record
  const run = await prisma.pipelineRun.create({
    data: { pipelineId: pipeline.id, status: "PENDING" },
  });

  try {
    // Mark running
    await prisma.pipelineRun.update({
      where: { id: run.id },
      data: { status: "RUNNING", startedAt: new Date() },
    });

    // Build source info — from DataSource or lakehouse table
    const sourceInfo: any = {};
    if (pipeline.source) {
      sourceInfo.filePath = pipeline.source.filePath;
      sourceInfo.fileSize = pipeline.source.fileSize;
      sourceInfo.fileName = pipeline.source.fileName;
    } else {
      // Lakehouse source: get table name from SOURCE step config
      const sourceStep = pipeline.steps.find((s: any) => s.type === "SOURCE");
      const sourceConfig = sourceStep ? (typeof sourceStep.config === "string" ? JSON.parse(sourceStep.config) : sourceStep.config) : {};
      sourceInfo.sourceTable = sourceConfig.sourceTable || sourceConfig.sourceId || "unknown";
      sourceInfo.sourceLayer = sourceConfig.sourceLayer || "BRONZE";
      sourceInfo.fromLakehouse = true;
    }

    // Write pipeline config for Python worker
    const configPath = `/tmp/gaung_pipeline_${run.id}.json`;
    writeFileSync(configPath, JSON.stringify({
      pipelineId: pipeline.id,
      runId: run.id,
      source: sourceInfo,
      steps: pipeline.steps.map((s: any) => ({
        ...s,
        config: typeof s.config === "string" ? JSON.parse(s.config) : s.config,
      })),
    }));

    // Execute Python ETL worker
    const result = await runETL(configPath);

    const finishedRun = await prisma.pipelineRun.update({
      where: { id: run.id },
      data: {
        status: result.success ? "SUCCESS" : "FAILED",
        finishedAt: new Date(),
        rowsOutput: result.rows,
        errorMessage: result.error || null,
        logs: result.logs || "",
      },
    });

    // Update pipeline status to ACTIVE on success
    if (result.success) {
      await prisma.pipeline.update({
        where: { id: pipeline.id },
        data: { status: "ACTIVE" },
      });
    }

    // Register lakehouse tables for ALL output steps using per-output metadata
    if (result.success && result.outputs && result.outputs.length > 0) {
      for (const output of result.outputs) {
        const columnsJson = JSON.stringify(output.columns || []);
        await prisma.lakehouseTable.upsert({
          where: {
            layer_tableName: {
              layer: output.layer.toUpperCase(),
              tableName: output.table,
            },
          },
          update: { rowsCount: output.rows, schema: columnsJson, updatedAt: new Date() },
          create: {
            layer: output.layer.toUpperCase(),
            tableName: output.table,
            displayName: output.table
              .replace(/_/g, " ")
              .replace(/\b\w/g, (c: string) => c.toUpperCase()),
            schema: columnsJson,
            rowsCount: output.rows,
            ...(session.tenantId ? { tenantId: session.tenantId } : {}),
          },
        });
      }
    } else if (result.success && result.rows > 0) {
      // Fallback for old runner: use single output metadata
      const outputStep = pipeline.steps.find((s: any) => s.type === "OUTPUT" && s.outputLayer && s.outputTable);
      if (outputStep?.outputLayer && outputStep?.outputTable) {
        const columnsJson = JSON.stringify(result.columns || []);
        await prisma.lakehouseTable.upsert({
          where: {
            layer_tableName: {
              layer: outputStep.outputLayer,
              tableName: outputStep.outputTable,
            },
          },
          update: { rowsCount: result.rows, schema: columnsJson, updatedAt: new Date() },
          create: {
            layer: outputStep.outputLayer,
            tableName: outputStep.outputTable,
            displayName: outputStep.outputTable
              .replace(/_/g, " ")
              .replace(/\b\w/g, (c: string) => c.toUpperCase()),
            schema: columnsJson,
            rowsCount: result.rows,
            ...(session.tenantId ? { tenantId: session.tenantId } : {}),
          },
        });
      }
    }

    return NextResponse.json(finishedRun);
  } catch (error: any) {
    await prisma.pipelineRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        errorMessage: error.message,
      },
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function runETL(configPath: string): Promise<{
  success: boolean;
  rows: number;
  columns: { name: string; type: string }[];
  outputs?: { layer: string; table: string; rows: number; columns: { name: string; type: string }[] }[];
  logs: string;
  error: string | null;
}> {
  return new Promise((resolve) => {
    const scriptPath = path.join(process.cwd(), "worker", "etl_runner.py");
    const proc = spawn("python3", [scriptPath, configPath], {
      env: { ...process.env },
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
          logs,
          error: stderr || null,
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
