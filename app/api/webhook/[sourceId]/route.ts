import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createHash, randomBytes } from "crypto";

// ---------------------------------------------------------------------------
// POST /api/webhook/[sourceId]
// Accept JSON payload, verify secret, store to bronze layer
// ---------------------------------------------------------------------------

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sourceId: string }> }
) {
  const { sourceId } = await params;
  const id = parseInt(sourceId, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid source ID" }, { status: 400 });
  }

  // 1. Find the source
  const source = await prisma.dataSource.findUnique({
    where: { id },
  });

  if (!source) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  if (source.type !== "WEBHOOK") {
    return NextResponse.json(
      { error: "Source is not a webhook endpoint" },
      { status: 400 }
    );
  }

  // 2. Verify webhook secret from X-Webhook-Secret header
  let storedSecret = "";
  try {
    const config = JSON.parse(source.config || "{}");
    storedSecret = config.webhookSecret || "";
  } catch {
    return NextResponse.json(
      { error: "Invalid webhook configuration" },
      { status: 500 }
    );
  }

  if (!storedSecret) {
    return NextResponse.json(
      { error: "Webhook not properly configured" },
      { status: 500 }
    );
  }

  const providedSecret = req.headers.get("x-webhook-secret") || "";
  if (providedSecret !== storedSecret) {
    return NextResponse.json({ error: "Invalid webhook secret" }, { status: 401 });
  }

  // 3. Parse the JSON payload
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  // 4. Store raw payload to bronze layer
  // Table name: webhook_{sourceId}_{YYYYMMDDHHmmss}
  const now = new Date();
  const timestamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+/, "")
    .replace("T", "");

  const tableName = `webhook_${sourceId}_${timestamp}`;

  try {
    // Normalize payload to array of records
    let records: Record<string, unknown>[];
    if (Array.isArray(payload)) {
      records = payload as Record<string, unknown>[];
    } else {
      records = [payload as Record<string, unknown>];
    }

    if (records.length === 0) {
      return NextResponse.json({ error: "Empty payload" }, { status: 400 });
    }

    // Collect all unique keys from all records (flattened to top-level strings)
    const allKeys = new Set<string>();
    for (const record of records) {
      Object.keys(record).forEach((k) => allKeys.add(k));
    }
    const columns = Array.from(allKeys);

    // Build CREATE TABLE statement for bronze layer
    // Map JSON values to TEXT columns — bronze is raw storage
    const columnDefs = columns
      .map((col) => {
        const safe = col.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
        return `"${safe}" TEXT`;
      })
      .join(", ");

    // Add metadata columns
    const fullColumnDefs = columnDefs
      ? `${columnDefs}, "_received_at" TIMESTAMPTZ DEFAULT NOW()`
      : `"_received_at" TIMESTAMPTZ DEFAULT NOW()`;

    const fullTableName = `bronze."${tableName}"`;

    // Use raw SQL via Prisma since dynamic table creation is needed
    await prisma.$executeRawUnsafe(
      `CREATE SCHEMA IF NOT EXISTS bronze`
    );
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS ${fullTableName} (${fullColumnDefs})`
    );

    // Build INSERT
    for (const record of records) {
      const colNames = Object.keys(record)
        .map((col) => {
          const safe = col.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
          return `"${safe}"`;
        })
        .join(", ");

      const placeholders = Object.keys(record)
        .map((_, i) => `$${i + 1}`)
        .join(", ");

      const values = Object.values(record).map((v) => {
        if (v === null || v === undefined) return null;
        if (typeof v === "object") return JSON.stringify(v);
        return String(v);
      });

      if (colNames) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO ${fullTableName} (${colNames}) VALUES (${placeholders})`,
          ...values
        );
      }
    }

    // Record the lakehouse table metadata
    await prisma.lakehouseTable.create({
      data: {
        layer: "BRONZE",
        tableName,
        displayName: tableName,
        schema: JSON.stringify(
          columns.map((c) => ({
            name: c.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase(),
            type: "TEXT",
          }))
        ),
        rowsCount: records.length,
        sizeBytes: JSON.stringify(payload).length,
        sourceId: id,
        isSystem: true,
        tenantId: source.tenantId,
      },
    });

    // Update source metadata
    await prisma.dataSource.update({
      where: { id },
      data: {
        lastSyncAt: now,
        rowsCount: (source.rowsCount || 0) + records.length,
        status: "ACTIVE",
      },
    });

    return NextResponse.json({
      success: true,
      rowsInserted: records.length,
      table: tableName,
      receivedAt: now.toISOString(),
    });
  } catch (error: any) {
    console.error("Webhook storage error:", error);
    return NextResponse.json(
      { error: `Failed to store webhook data: ${error.message}` },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// GET /api/webhook/[sourceId]
// Return basic info about the webhook endpoint
// ---------------------------------------------------------------------------

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sourceId: string }> }
) {
  const { sourceId } = await params;
  const id = parseInt(sourceId, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid source ID" }, { status: 400 });
  }

  const source = await prisma.dataSource.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      type: true,
      status: true,
      lastSyncAt: true,
      rowsCount: true,
      createdAt: true,
    },
  });

  if (!source) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  return NextResponse.json(source);
}
