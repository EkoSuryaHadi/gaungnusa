import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeFileSync } from "fs";
import path from "path";
import os from "os";
import { jobQueue } from "@/lib/queue";

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

  // Concurrent run protection: reject if pipeline is already running
  const existingRun = await prisma.pipelineRun.findFirst({
    where: {
      pipelineId: pipeline.id,
      status: { in: ["PENDING", "RUNNING"] },
    },
  });
  if (existingRun) {
    return NextResponse.json(
      { error: "Pipeline is already running. Please wait for the current run to complete." },
      { status: 409 }
    );
  }

  // Create run record
  const run = await prisma.pipelineRun.create({
    data: { pipelineId: pipeline.id, status: "PENDING" },
  });

  // Build source info — from DataSource or lakehouse table
  const sourceInfo: Record<string, unknown> = {};
  if (pipeline.source) {
    if (pipeline.source.type === "CSV" || pipeline.source.type === "EXCEL") {
      // Prefer Bronze table if it exists (auto-ingested on upload)
      const bronzeTable = await prisma.lakehouseTable.findFirst({
        where: {
          sourceId: pipeline.source.id,
          layer: "BRONZE",
        },
        orderBy: { updatedAt: "desc" },
      });

      if (bronzeTable) {
        // Read from Bronze table (consistent lakehouse architecture)
        sourceInfo.sourceTable = bronzeTable.tableName;
        sourceInfo.sourceLayer = "BRONZE";
        sourceInfo.fromLakehouse = true;
      } else {
        // Fallback: read directly from file (backward compatibility)
        sourceInfo.filePath = pipeline.source.filePath;
        sourceInfo.fileSize = pipeline.source.fileSize;
        sourceInfo.fileName = pipeline.source.fileName;
      }

      try {
        const sourceConfig = JSON.parse(pipeline.source.config || "{}");
        sourceInfo.category = sourceConfig.category || null;
      } catch {
        sourceInfo.category = null;
      }
    } else {
      // API, DATABASE, or WEBHOOK
      // Query the latest BRONZE lakehouse table for this sourceId
      const latestBronzeTable = await prisma.lakehouseTable.findFirst({
        where: {
          sourceId: pipeline.source.id,
          layer: "BRONZE",
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      if (!latestBronzeTable) {
        // Mark run failed
        await prisma.pipelineRun.update({
          where: { id: run.id },
          data: {
            status: "FAILED",
            finishedAt: new Date(),
            errorMessage: `Source "${pipeline.source.name}" has not been synchronized yet. Please sync the data source first.`,
          },
        });
        return NextResponse.json(
          { error: `Source "${pipeline.source.name}" has not been synchronized yet. Please sync the data source first.` },
          { status: 400 }
        );
      }

      sourceInfo.sourceTable = latestBronzeTable.tableName;
      sourceInfo.sourceLayer = "BRONZE";
      sourceInfo.fromLakehouse = true;
    }
  } else {
    // Lakehouse source: get table name from SOURCE step config
    const sourceStep = pipeline.steps.find((s: { type: string }) => s.type === "SOURCE");
    const sourceConfig = sourceStep ? (typeof sourceStep.config === "string" ? JSON.parse(sourceStep.config) : sourceStep.config) : {};
    sourceInfo.sourceTable = sourceConfig.sourceTable || sourceConfig.sourceId || "unknown";
    sourceInfo.sourceLayer = sourceConfig.sourceLayer || "BRONZE";
    sourceInfo.fromLakehouse = true;
  }

  // Write pipeline config for Python worker
  const configPath = path.join(os.tmpdir(), `gaung_pipeline_${run.id}.json`);
  writeFileSync(configPath, JSON.stringify({
    pipelineId: pipeline.id,
    runId: run.id,
    source: sourceInfo,
    steps: pipeline.steps.map((s: { config: string | object; [key: string]: unknown }) => ({
      ...s,
      config: typeof s.config === "string" ? JSON.parse(s.config) : s.config,
    })),
  }));

  // Enqueue in JobQueue (concurrency & memory managed)
  jobQueue.enqueue({
    id: `pipeline_${run.id}`,
    type: "pipeline",
    runId: run.id,
    args: [configPath],
    scriptPath: path.join(process.cwd(), "worker", "etl_runner.py"),
    onStart: async () => {
      await prisma.pipelineRun.update({
        where: { id: run.id },
        data: { status: "RUNNING", startedAt: new Date() },
      });
    },
    onComplete: async (code, stdout, stderr) => {
      const logs = stdout + (stderr ? "\n=== STDERR ===\n" + stderr : "");
      try {
        const lines = stdout.split("\n");
        const jsonLine = lines.filter((l) => l.trim().startsWith("{")).pop() || "{}";
        const result: {
          rows?: number;
          columns?: { name: string; type: string }[];
          outputs?: { layer: string; table: string; rows: number; columns: { name: string; type: string }[] }[];
        } = JSON.parse(jsonLine);

        const success = code === 0;

        // Update PipelineRun status
        await prisma.pipelineRun.update({
          where: { id: run.id },
          data: {
            status: success ? "SUCCESS" : "FAILED",
            finishedAt: new Date(),
            rowsOutput: result.rows || 0,
            errorMessage: success ? null : (stderr || null),
            logs,
          },
        });

        // Update pipeline status to ACTIVE on success
        if (success) {
          await prisma.pipeline.update({
            where: { id: pipeline.id },
            data: { status: "ACTIVE" },
          });
        }

        const tenantId = session.tenantId ?? null;
        // Register lakehouse tables for ALL output steps using per-output metadata
        if (success && result.outputs && result.outputs.length > 0) {
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
                ...(tenantId ? { tenantId } : {}),
              },
            });
          }
        } else if (success && (result.rows || 0) > 0) {
          // Fallback for old runner: use single output metadata
          const outputStep = pipeline.steps.find((s) => s.type === "OUTPUT" && s.outputLayer && s.outputTable);
          if (outputStep?.outputLayer && outputStep?.outputTable) {
            const columnsJson = JSON.stringify(result.columns || []);
            await prisma.lakehouseTable.upsert({
              where: {
                layer_tableName: {
                  layer: outputStep.outputLayer,
                  tableName: outputStep.outputTable,
                },
              },
              update: { rowsCount: result.rows || 0, schema: columnsJson, updatedAt: new Date() },
              create: {
                layer: outputStep.outputLayer,
                tableName: outputStep.outputTable,
                displayName: outputStep.outputTable
                  .replace(/_/g, " ")
                  .replace(/\b\w/g, (c: string) => c.toUpperCase()),
                schema: columnsJson,
                rowsCount: result.rows || 0,
                ...(tenantId ? { tenantId } : {}),
              },
            });
          }
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        await prisma.pipelineRun.update({
          where: { id: run.id },
          data: {
            status: "FAILED",
            finishedAt: new Date(),
            errorMessage: `Post-processing error: ${errorMsg}`,
            logs,
          },
        }).catch(() => {
          console.error(`[ETL] Failed to update run ${run.id}:`, errorMsg);
        });
      }
    },
    onError: async (err) => {
      await prisma.pipelineRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          errorMessage: `Process spawn error: ${err.message}`,
        },
      }).catch(() => {
        console.error(`[ETL] Failed to update run ${run.id}:`, err.message);
      });
    }
  });

  return NextResponse.json({
    ...run,
    status: "PENDING",
    message: "Pipeline enqueued. Track progress via WebSocket or refresh the page.",
  });
}

