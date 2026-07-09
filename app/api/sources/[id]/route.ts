import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/sources/[id] — source detail + preview
// ---------------------------------------------------------------------------

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const source = await prisma.dataSource.findFirst({
    where: {
      id: parseInt(id),
      userId: session.userId,
      ...(session.tenantId ? { tenantId: session.tenantId } : {}),
    },
  });

  // Fallback: try legacy NULL tenantId
  if (!source && session.tenantId) {
    const legacySource = await prisma.dataSource.findFirst({
      where: { id: parseInt(id), userId: session.userId, tenantId: null },
    });
    if (legacySource) {
      await prisma.dataSource.update({
        where: { id: legacySource.id },
        data: { tenantId: session.tenantId! },
      });
      return NextResponse.json({ ...legacySource, tenantId: session.tenantId });
    }
  }

  if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Try CSV preview (first 10 rows)
  let preview: any[] | null = null;
  if (source.filePath && (source.type === "CSV" || source.type === "EXCEL")) {
    try {
      const filePath = path.join(process.cwd(), "uploads", source.filePath);
      if (fs.existsSync(filePath)) {
        if (source.type === "CSV") {
          const content = fs.readFileSync(filePath, "utf-8");
          const lines = content.split("\n").filter(Boolean);
          const headers = lines[0]?.split(",").map((h: string) => h.trim()) || [];
          const rows = lines.slice(1, 11).map((line: string) => {
            const vals = line.split(",").map((v: string) => v.trim());
            const row: Record<string, string> = {};
            headers.forEach((h: string, i: number) => { row[h] = vals[i] || ""; });
            return row;
          });
          preview = [{ headers }, ...rows];
        }
      }
    } catch (e) { /* ignore parse errors */ }
  }

  return NextResponse.json({ ...source, preview });
}

// ---------------------------------------------------------------------------
// DELETE /api/sources/[id] — comprehensive cleanup
// ---------------------------------------------------------------------------

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const source = await prisma.dataSource.findFirst({
    where: {
      id: parseInt(id),
      userId: session.userId,
      ...(session.tenantId ? { tenantId: session.tenantId } : {}),
    },
  });

  // Fallback: legacy source with NULL tenantId
  if (!source && session.tenantId) {
    const legacySource = await prisma.dataSource.findFirst({
      where: { id: parseInt(id), userId: session.userId, tenantId: null },
    });
    if (legacySource) {
      await prisma.dataSource.update({
        where: { id: legacySource.id },
        data: { tenantId: session.tenantId! },
      });
      return performDelete(legacySource);
    }
  }

  if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return performDelete(source);
}

// ============================================================
// Comprehensive delete — pipelines, runs, lakehouse, DB tables
// ============================================================

async function performDelete(source: any) {
  const deleted: string[] = [];

  // 1. Find all pipelines linked to this source
  const pipelines = await prisma.pipeline.findMany({
    where: { sourceId: source.id },
    include: { steps: true },
  });

  // 2. Collect output table names from pipeline steps
  const outputTables: { layer: string; table: string }[] = [];
  for (const p of pipelines) {
    for (const step of p.steps) {
      if (step.outputTable) {
        const layer = (step.outputLayer || "SILVER").toLowerCase();
        outputTables.push({ layer, table: step.outputTable.toLowerCase() });
      }
      if (step.type === "OUTPUT" && step.config) {
        try {
          const cfg = JSON.parse(step.config);
          if (cfg.outputTable) {
            const layer = (cfg.outputLayer || step.outputLayer || "SILVER").toLowerCase();
            outputTables.push({ layer, table: cfg.outputTable.toLowerCase() });
          }
        } catch {}
      }
    }
  }

  // Also add auto-generated table names from source name
  const rawName = source.name
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/__+/g, "_")
    .replace(/^_|_$/g, "");
  outputTables.push({ layer: "bronze", table: rawName + "_bronze_raw" });
  outputTables.push({ layer: "silver", table: rawName + "_silver" });

  // 3. Delete pipeline runs (cascade from pipeline, but safe to do first)
  const pipelineIds = pipelines.map((p: any) => p.id);
  if (pipelineIds.length > 0) {
    await prisma.pipelineRun.deleteMany({ where: { pipelineId: { in: pipelineIds } } });
    deleted.push(`${pipelineIds.length} pipeline run(s)`);

    // 4. Delete pipeline steps
    await prisma.pipelineStep.deleteMany({ where: { pipelineId: { in: pipelineIds } } });
    deleted.push(`${pipelineIds.length} pipeline step(s)`);

    // 5. Delete pipelines
    await prisma.pipeline.deleteMany({ where: { id: { in: pipelineIds } } });
    deleted.push(`${pipelineIds.length} pipeline(s)`);
  }

  // 6. Delete LakehouseTable entries for this source's tables
  const uniqueTables = Array.from(
    new Map(outputTables.map((t) => [`${t.layer}:${t.table}`, t])).values()
  );
  for (const { layer, table } of uniqueTables) {
    try {
      await prisma.lakehouseTable.deleteMany({
        where: { layer: layer.toUpperCase(), tableName: table },
      });
    } catch {}
  }
  if (uniqueTables.length > 0) {
    deleted.push(`${uniqueTables.length} lakehouse table(s)`);
  }

  // 7. Drop actual PostgreSQL tables (best-effort, may not exist)
  try {
    for (const { layer, table } of uniqueTables) {
      try {
        const escapedTable = table.replace(/"/g, '""');
        execSync(
          `psql "${process.env.DATABASE_URL}" -c 'DROP TABLE IF EXISTS ${layer}."${escapedTable}" CASCADE'`,
          { timeout: 5000, stdio: "pipe" }
        );
      } catch {}
    }
    deleted.push(`DB tables dropped`);
  } catch {}

  // 8. Delete uploaded file
  if (source.filePath) {
    try {
      const filePath = path.join(process.cwd(), "uploads", source.filePath);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        deleted.push("uploaded file");
      }
    } catch {}
  }

  // 9. Finally delete the DataSource
  await prisma.dataSource.delete({ where: { id: source.id } });

  console.log(`[DELETE] Source #${source.id} "${source.name}" — cleaned up: ${deleted.join(", ")}`);

  return NextResponse.json({
    success: true,
    cleanedUp: deleted,
  });
}
