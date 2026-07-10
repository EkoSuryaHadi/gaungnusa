import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";
import { randomBytes } from "crypto";
import { jobQueue } from "@/lib/queue";

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
 * Ingest a CSV/Excel file into the Bronze layer (lakehouse architecture) via JobQueue.
 */
function ingestToBronzeBackground(
  sourceId: number,
  fileName: string,
  sourceName: string,
  fileSize: number,
  tenantId: number | null,
): void {
  // Build a small inline Python script that imports and calls ingest_csv_to_bronze
  const workerDir = path.join(process.cwd(), "worker").replace(/\\/g, "/");
  const inlineScript = [
    `import sys, json`,
    `sys.path.insert(0, '${workerDir}')`,
    `from etl_runner import ingest_csv_to_bronze`,
    `table, rows, cols = ingest_csv_to_bronze('${fileName.replace(/'/g, "\\'")}', ${sourceId}, ${fileSize})`,
    `print(json.dumps({"table": table, "rows": rows, "columns": cols}))`,
  ].join("; ");

  jobQueue.enqueue({
    id: `bronze_ingest_${sourceId}`,
    type: "bronze_ingest",
    sourceId,
    args: [],
    inlineScript,
    onComplete: async (code, stdout, stderr) => {
      const success = code === 0;
      try {
        if (success) {
          // Parse result from stdout
          const lines = stdout.split("\n");
          const jsonLine = lines.filter((l) => l.trim().startsWith("{")).pop() || "{}";
          const result: { table: string; rows: number; columns: { name: string; type: string }[] } = JSON.parse(jsonLine);

          if (result.table && result.rows > 0) {
            const columnsJson = JSON.stringify(result.columns || []);

            // Register Bronze table in LakehouseTable
            await prisma.lakehouseTable.upsert({
              where: {
                layer_tableName: {
                  layer: "BRONZE",
                  tableName: result.table,
                },
              },
              update: {
                rowsCount: result.rows,
                schema: columnsJson,
                updatedAt: new Date(),
              },
              create: {
                layer: "BRONZE",
                tableName: result.table,
                displayName: `${sourceName} (File)`,
                schema: columnsJson,
                rowsCount: result.rows,
                sourceId,
                isSystem: true,
                ...(tenantId ? { tenantId } : {}),
              },
            });

            console.log(`[Bronze Ingest] Source #${sourceId}: ${result.rows} rows → bronze."${result.table}"`);
          }
        } else {
          console.error(`[Bronze Ingest Error for Source #${sourceId}]:`, stderr || "Unknown error");
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[Bronze Ingest Post-process Error for Source #${sourceId}]:`, msg);
      }
    },
    onError: async (err) => {
      console.error(`[Bronze Ingest Spawn Error for Source #${sourceId}]:`, err.message);
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

    // ── AUTO BRONZE INGESTION ──
    // Ingest the uploaded file into a Bronze table in the background.
    // This ensures CSV/Excel data goes through the Bronze layer (like API and DB sources).
    ingestToBronzeBackground(
      source.id,
      fileName,
      name,
      buffer.length,
      session.tenantId ?? null,
    );

    return NextResponse.json(source);
  } catch (error: any) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
