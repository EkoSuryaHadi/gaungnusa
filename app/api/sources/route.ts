import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import { writeFileSync } from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";
import { randomBytes } from "crypto";
import { spawn, execFile } from "child_process";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sources = await prisma.dataSource.findMany({
    where: {
      userId: session.userId,
      ...(session.tenantId ? { tenantId: session.tenantId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(sources);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString("hex")}`;
}

function getWebhookUrl(sourceId: number): string {
  const domain = process.env.WEBHOOK_DOMAIN || "ekosuryahadi.web.id";
  return `https://${domain}/api/webhook/${sourceId}`;
}

/**
 * Auto-classify uploaded file in background.
 * Runs classify_source.py → updates DataSource.domain + domainConfidence.
 */
function classifyFileAsync(sourceId: number, filePath: string) {
  const scriptPath = path.join(process.cwd(), "worker", "classify_source.py");
  const absFilePath = path.join(process.cwd(), "uploads", filePath);

  execFile("/usr/bin/python3", [scriptPath, absFilePath], { timeout: 30000 }, async (err, stdout, stderr) => {
    if (err) {
      console.error("[classify] Script failed:", stderr || err.message);
      return;
    }
    try {
      const result = JSON.parse(stdout.trim());
      if (result.domain && result.confidence !== undefined) {
        await prisma.dataSource.update({
          where: { id: sourceId },
          data: { domain: result.domain, domainConfidence: result.confidence },
        });
        console.log(
          `[classify] Source #${sourceId} → ${result.label} (${Math.round(result.confidence * 100)}%)`
        );
      }
    } catch (parseErr) {
      console.error("[classify] Failed to parse output:", stdout.substring(0, 200));
    }
  });
}

// ---------------------------------------------------------------------------
// POST — dispatcher: JSON body for DATABASE/API/WEBHOOK, multipart for files
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contentType = req.headers.get("content-type") || "";

  // ── JSON body: DATABASE / API / WEBHOOK sources ──
  if (contentType.includes("application/json")) {
    return handleJsonSource(req, session);
  }

  // ── Multipart body: file upload (CSV / Excel) ──
  return handleFileUpload(req, session);
}

// ============================================================
// JSON Source Handler — DATABASE, API, WEBHOOK
// ============================================================

async function handleJsonSource(req: NextRequest, session: any) {
  try {
    const body = await req.json();
    const { type, name, config } = body;

    if (!type || !name) {
      return NextResponse.json(
        { error: "Type and name are required" },
        { status: 400 }
      );
    }

    // ── DATABASE connector ──
    if (type === "DATABASE") {
      return handleDatabaseSource(config, name, session);
    }

    // ── API connector ──
    if (type === "API") {
      return handleApiSource(config, name, session);
    }

    // ── WEBHOOK connector ──
    if (type === "WEBHOOK") {
      return handleWebhookSource(config, name, session);
    }

    return NextResponse.json(
      { error: `Unsupported source type: ${type}. Use 'DATABASE', 'API', or 'WEBHOOK'.` },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("JSON source creation error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ============================================================
// DATABASE Handler
// ============================================================

async function handleDatabaseSource(config: any, name: string, session: any) {
  if (!config) {
    return NextResponse.json(
      { error: "Config is required" },
      { status: 400 }
    );
  }

  const { dbType, host, port, database, username, password, sqlQuery, schedule } = config;

  if (!dbType || !host || !database || !username) {
    return NextResponse.json(
      { error: "dbType, host, database, and username are required" },
      { status: 400 }
    );
  }

  const safeConfig: Record<string, any> = {
    dbType: (dbType || "POSTGRESQL").toUpperCase(),
    host: String(host),
    port: Number(port) || (dbType === "MYSQL" ? 3306 : 5432),
    database: String(database),
    username: String(username),
    password: password || "",
    encrypted: false,
  };

  if (sqlQuery) {
    safeConfig.sqlQuery = String(sqlQuery);
  }

  if (schedule) {
    safeConfig.schedule = String(schedule);
  }

  const source = await prisma.dataSource.create({
    data: {
      userId: session.userId,
      tenantId: session.tenantId ?? null,
      name: String(name),
      type: "DATABASE",
      config: JSON.stringify(safeConfig),
      status: "ACTIVE",
    },
  });

  return NextResponse.json(source, { status: 201 });
}

// ============================================================
// API Handler
// ============================================================

async function handleApiSource(config: any, name: string, session: any) {
  const finalConfig = {
    url: (config?.url || "").trim(),
    method: (config?.method || "GET").toUpperCase(),
    headers: config?.headers || {},
    auth: config?.auth || { type: "none" },
  };

  if (!finalConfig.url) {
    return NextResponse.json(
      { error: "URL is required for API sources" },
      { status: 400 }
    );
  }

  const source = await prisma.dataSource.create({
    data: {
      userId: session.userId,
      tenantId: session.tenantId ?? null,
      name: name.trim(),
      type: "API",
      config: JSON.stringify(finalConfig),
      status: "ACTIVE",
    },
  });

  return NextResponse.json(source, { status: 201 });
}

// ============================================================
// WEBHOOK Handler
// ============================================================

async function handleWebhookSource(config: any, name: string, session: any) {
  // Create source first to get an ID
  const source = await prisma.dataSource.create({
    data: {
      userId: session.userId,
      tenantId: session.tenantId ?? null,
      name: name.trim(),
      type: "WEBHOOK",
      config: JSON.stringify({}),
      status: "ACTIVE",
    },
  });

  // Generate secret and URL using the source ID
  const webhookSecret = generateWebhookSecret();
  const webhookUrl = getWebhookUrl(source.id);

  const finalConfig = {
    webhookSecret,
    webhookUrl,
    ...(config || {}),
  };

  // Update source with webhook config
  await prisma.dataSource.update({
    where: { id: source.id },
    data: {
      config: JSON.stringify(finalConfig),
    },
  });

  return NextResponse.json(
    {
      ...source,
      config: JSON.stringify(finalConfig),
      webhookSecret,
      webhookUrl,
    },
    { status: 201 }
  );
}

/**
 * Auto-trigger Silver processing after Bronze ingest completes.
 * Runs the ETL directly (same as Quick Process) via subprocess.
 */
async function triggerQuickProcessAsync(sourceId: number) {
  try {
    // Look up the source and create Quick Process config
    const source = await prisma.dataSource.findUnique({ where: { id: sourceId } });
    if (!source) return;

    const bronzeTable = source.name
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9]/g, "_")
      .replace(/_+/g, "_")
      .toLowerCase() + "_bronze_raw";

    const silverTable = source.name
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9]/g, "_")
      .replace(/_+/g, "_")
      .toLowerCase() + "_silver";

    // Create pipeline + run record (reuse if exists)
    const pipelineName = `${source.name} → Silver (Quick Process)`;
    let pipeline = await prisma.pipeline.findFirst({
      where: { sourceId: source.id, tenantId: source.tenantId, name: pipelineName },
      include: { steps: { orderBy: { order: "asc" } } },
    });

    if (!pipeline) {
      pipeline = await prisma.pipeline.create({
        data: {
          userId: source.userId,
          tenantId: source.tenantId,
          name: pipelineName,
          sourceId: source.id,
          status: "DRAFT",
          steps: {
            create: [
              { order: 1, type: "SOURCE", config: JSON.stringify({ sourceTable: bronzeTable, sourceLayer: "BRONZE" }) },
              { order: 2, type: "CLEAN", config: JSON.stringify({ stripWhitespace: true, deduplicate: true, normalizeCase: "title", complementaryFill: true }) },
              { order: 3, type: "SILVER_QUALITY", config: JSON.stringify({ silverMode: "full" }) },
              { order: 4, type: "OUTPUT", outputLayer: "SILVER", outputTable: silverTable, config: JSON.stringify({ outputLayer: "SILVER", outputTable: silverTable }) },
            ],
          },
        },
        include: { steps: { orderBy: { order: "asc" } } },
      });
    }

    const run = await prisma.pipelineRun.create({
      data: { pipelineId: pipeline.id, status: "RUNNING", startedAt: new Date() },
    });

    // Build config and run ETL
    const configPath = `/tmp/gaung_auto_qp_${run.id}.json`;
    const { spawn } = await import("child_process");
    const { writeFileSync } = await import("fs");

    writeFileSync(configPath, JSON.stringify({
      pipelineId: pipeline.id,
      runId: run.id,
      source: { fromLakehouse: true, sourceTable: bronzeTable, sourceLayer: "BRONZE" },
      steps: pipeline.steps.map((s: any) => ({
        order: s.order, type: s.type,
        config: typeof s.config === "string" ? JSON.parse(s.config) : s.config,
        ...(s.outputLayer ? { outputLayer: s.outputLayer, outputTable: s.outputTable } : {}),
      })),
    }));

    return new Promise<void>((resolve) => {
      const proc = spawn("/usr/bin/python3", [
        path.join(process.cwd(), "worker", "etl_runner.py"), configPath
      ], {
        env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL || "", DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || "" },
        timeout: 300000,
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

      proc.on("close", async (code: number | null) => {
        try {
          const lines = stdout.split("\n");
          const jsonLine = lines.filter((l) => l.trim().startsWith("{")).pop() || "{}";
          const result = JSON.parse(jsonLine);

          await prisma.pipelineRun.update({
            where: { id: run.id },
            data: {
              status: code === 0 ? "SUCCESS" : "FAILED",
              finishedAt: new Date(),
              rowsOutput: result.rows || 0,
              errorMessage: stderr || null,
              logs: stdout + stderr,
              qualityScore: result.silverQuality || undefined,
              silverAudit: result.silverAudit || undefined,
            },
          });

          if (code === 0) {
            await prisma.pipeline.update({ where: { id: pipeline.id }, data: { status: "ACTIVE" } });
            // Register lakehouse table
            if (result.outputs) {
              for (const output of result.outputs) {
                const cols = (output.columns || []).map((c: any) => ({ name: c.name || c, type: c.type || "VARCHAR" }));
                await prisma.lakehouseTable.upsert({
                  where: { layer_tableName: { layer: output.layer.toUpperCase(), tableName: output.table } },
                  update: { rowsCount: output.rows, schema: JSON.stringify(cols), updatedAt: new Date(), tenantId: source.tenantId ?? null },
                  create: {
                    layer: output.layer.toUpperCase(), tableName: output.table,
                    displayName: output.table.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
                    schema: JSON.stringify(cols), rowsCount: output.rows,
                    tenantId: source.tenantId ?? null,
                  },
                });
              }
            }
            console.log(`[auto] Quick Process done for source #${sourceId}: DQI=${result.silverQuality?.overall || "?"}, rows=${result.rows}`);
          } else {
            console.error(`[auto] Quick Process failed for source #${sourceId}: exit=${code}`);
          }
        } catch (e: any) {
          console.error(`[auto] Quick Process error for source #${sourceId}:`, e.message);
        }
        resolve();
      });

      proc.on("error", (err) => {
        console.error(`[auto] Quick Process spawn error for source #${sourceId}:`, err.message);
        resolve();
      });
    });
  } catch (e: any) {
    console.error(`[auto] Quick Process setup error for source #${sourceId}:`, e.message);
  }
}

// ============================================================
// File Upload Handler (CSV / Excel)
// ============================================================

async function handleFileUpload(req: NextRequest, session: any) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const name = formData.get("name") as string | null;

    if (!file || !name) {
      return NextResponse.json({ error: "File and name are required" }, { status: 400 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["csv", "xlsx", "xls"].includes(ext)) {
      return NextResponse.json({ error: "Only CSV and Excel (.xlsx, .xls) files are accepted" }, { status: 400 });
    }

    const fileType = ext === "csv" ? "CSV" : "EXCEL";

    const uploadDir = path.join(process.cwd(), "uploads");
    await mkdir(uploadDir, { recursive: true });

    const fileName = `${Date.now()}_${file.name}`;
    const filePath = path.join(uploadDir, fileName);

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    // Parse file to count rows and columns
    let rowsCount = 0;
    let columnsCount = 0;
    try {
      if (fileType === "EXCEL") {
        const workbook = XLSX.read(buffer, { type: "buffer" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];
        rowsCount = Math.max(0, data.length - 1); // minus header row
        columnsCount = data.length > 0 ? (data[0] as any[]).length : 0;
      } else {
        const content = buffer.toString("utf-8");
        const records = parse(content, {
          columns: true,
          skip_empty_lines: true,
          relax_column_count: true,
          relax_quotes: true,
        });
        const typed = records as any[];
        rowsCount = typed.length;
        columnsCount = typed.length > 0 ? Object.keys(typed[0]).length : 0;
      }
    } catch (e) {
      // Parsing failed, still save the file
    }

    const source = await prisma.dataSource.create({
      data: {
        userId: session.userId,
        tenantId: session.tenantId ?? null,
        name,
        type: fileType,
        fileName: file.name,
        fileSize: buffer.length,
        filePath: fileName,
        rowsCount,
        columnsCount,
        config: JSON.stringify({ originalName: file.name }),
      },
    });

    // ── Auto-classify in background (no blocking) ──
    classifyFileAsync(source.id, fileName);

    // ── Auto-ingest to Bronze ──
    const rawName = name
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_")
      .replace(/__+/g, "_")
      .replace(/^_|_$/g, "")
      + "_bronze_raw";
    const pipeline = await prisma.pipeline.create({
      data: {
        userId: session.userId,
        tenantId: session.tenantId ?? null,
        name: `${name} → Bronze`,
        description: "Auto-generated raw ingest from upload",
        sourceId: source.id,
        status: "ACTIVE",
        steps: {
          create: [
            { order: 0, type: "SOURCE", config: "{}", positionX: 200, positionY: 100 },
            { order: 1, type: "OUTPUT", config: "{}", outputLayer: "BRONZE", outputTable: rawName, positionX: 500, positionY: 100 },
          ],
        },
      },
      include: { steps: true },
    });

    // ── Auto-run in background (don't block response) ──
    runPipelineAsync(pipeline.id, source, rawName)
      .then((bronzeSuccess) => {
        if (!bronzeSuccess) {
          console.error(`[auto] Bronze ingest FAILED for source #${source.id} — skipping Quick Process`);
          return;
        }
        // After Bronze ingest succeeds, auto-trigger Silver processing
        console.log(`[auto] Bronze done for source #${source.id} → triggering Quick Process`);
        triggerQuickProcessAsync(source.id).catch((e) => {
          console.error("Auto Quick Process failed:", e);
        });
      })
      .catch((e) => {
        console.error("Auto-ingest Bronze failed:", e);
      });

    return NextResponse.json({ source, pipeline });
  } catch (error: any) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ============================================================
// Background ETL runner (auto-ingest to Bronze)
// ============================================================

async function runPipelineAsync(pipelineId: number, source: any, tableName: string): Promise<boolean> {
  const run = await prisma.pipelineRun.create({
    data: { pipelineId, status: "RUNNING", startedAt: new Date() },
  });

  const configPath = `/tmp/gaung_pipeline_${run.id}.json`;
  writeFileSync(configPath, JSON.stringify({
    pipelineId,
    runId: run.id,
    source: {
      filePath: source.filePath,
      fileSize: source.fileSize,
      fileName: source.fileName,
    },
    steps: [
      { type: "SOURCE", config: {}, order: 0 },
      {
        type: "OUTPUT",
        config: { outputLayer: "BRONZE", outputTable: tableName },
        outputLayer: "BRONZE",
        outputTable: tableName,
        order: 1,
      },
    ],
  }));

  return new Promise<boolean>((resolve) => {
    const proc = spawn("/usr/bin/python3", [path.join(process.cwd(), "worker", "etl_runner.py"), configPath], {
      env: { ...process.env },
      timeout: 300000,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

    proc.on("close", async (code: number | null) => {
      const logs = stdout + (stderr ? "\n=== STDERR ===\n" + stderr : "");
      let success = false;
      try {
        const lines = stdout.split("\n");
        const jsonLine = lines.filter((l) => l.trim().startsWith("{")).pop() || "{}";
        const result = JSON.parse(jsonLine);

        success = code === 0;

        await prisma.pipelineRun.update({
          where: { id: run.id },
          data: {
            status: code === 0 ? "SUCCESS" : "FAILED",
            finishedAt: new Date(),
            rowsOutput: result.rows || 0,
            errorMessage: stderr || null,
            logs,
          },
        });

        if (code === 0 && result.outputs) {
          for (const output of result.outputs) {
            const cols = (output.columns || []).map((c: any) => ({ name: c.name || c, type: c.type || "VARCHAR" }));
            await prisma.lakehouseTable.upsert({
              where: {
                layer_tableName: {
                  layer: output.layer.toUpperCase(),
                  tableName: output.table,
                },
              },
              update: { rowsCount: output.rows, schema: JSON.stringify(cols), updatedAt: new Date(), tenantId: source.tenantId ?? null },
              create: {
                layer: output.layer.toUpperCase(),
                tableName: output.table,
                displayName: output.table.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
                schema: JSON.stringify(cols),
                rowsCount: output.rows,
                tenantId: source.tenantId ?? null,
              },
            });
          }
        } else if (code === 0 && result.rows > 0) {
          const cols = (result.columns || []).map((c: any) => ({ name: c.name || c, type: c.type || "VARCHAR" }));
          await prisma.lakehouseTable.upsert({
            where: {
              layer_tableName: { layer: "BRONZE", tableName },
            },
            update: { rowsCount: result.rows, schema: JSON.stringify(cols), updatedAt: new Date() },
            create: {
              layer: "BRONZE",
              tableName,
              displayName: tableName.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
              schema: JSON.stringify(cols),
              rowsCount: result.rows,
              tenantId: source.tenantId ?? null,
            },
          });
        }

        if (code === 0) {
          await prisma.pipeline.update({ where: { id: pipelineId }, data: { status: "ACTIVE" } });
        }
      } catch {
        await prisma.pipelineRun.update({
          where: { id: run.id },
          data: { status: "FAILED", finishedAt: new Date(), logs, errorMessage: stderr || "Unknown error" },
        });
      }
      resolve(success);
    });

    proc.on("error", async () => {
      await prisma.pipelineRun.update({
        where: { id: run.id },
        data: { status: "FAILED", finishedAt: new Date(), errorMessage: "Process spawn failed" },
      });
      resolve(false);
    });
  });
}
