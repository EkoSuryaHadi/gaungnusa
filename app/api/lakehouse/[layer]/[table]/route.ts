import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ layer: string; table: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { layer, table } = await params;
  const layerUpper = layer.toUpperCase();

  if (!["SILVER", "BRONZE", "GOLD"].includes(layerUpper)) {
    return NextResponse.json({ error: "Invalid layer" }, { status: 400 });
  }

  try {
    // Find the lakehouse table record
    const tableMeta = await prisma.lakehouseTable.findFirst({
      where: {
        layer: layerUpper,
        tableName: table,
        ...(session.tenantId ? { tenantId: session.tenantId } : {}),
      },
    });

    if (!tableMeta) {
      // Fallback: legacy with NULL tenantId
      const legacy = await prisma.lakehouseTable.findFirst({
        where: { layer: layerUpper, tableName: table, tenantId: null },
      });
      if (legacy) {
        await prisma.lakehouseTable.update({
          where: { id: legacy.id },
          data: { tenantId: session.tenantId! },
        });
      } else {
        return NextResponse.json({ error: "Table not found" }, { status: 404 });
      }
    }

    // Drop the PostgreSQL table
    try {
      const schemaName = `"${layer.toLowerCase()}"`;
      const tableName = `"${table}"`;
      await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${schemaName}.${tableName}`);
    } catch (e) {
      console.error("Failed to drop PG table:", e);
    }

    // Delete the lakehouse metadata record
    await prisma.lakehouseTable.deleteMany({
      where: {
        layer: layerUpper,
        tableName: table,
        ...(session.tenantId ? { tenantId: session.tenantId } : {}),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting table:", error);
    return NextResponse.json({ error: "Failed to delete table" }, { status: 500 });
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ layer: string; table: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { layer, table } = await params;
  const layerUpper = layer.toUpperCase();

  if (!["SILVER", "BRONZE", "GOLD"].includes(layerUpper)) {
    return NextResponse.json({ error: "Invalid layer" }, { status: 400 });
  }

  try {
    // Get table metadata
    const tableMeta = await prisma.lakehouseTable.findFirst({
      where: {
        layer: layerUpper,
        tableName: table,
        ...(session.tenantId ? { tenantId: session.tenantId } : {}),
      },
    });

    if (!tableMeta) {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    // Try to query actual data from the PostgreSQL table
    let columns: string[] = [];
    let rows: Record<string, unknown>[] = [];
    let totalRows = tableMeta.rowsCount;

    try {
      const schema = JSON.parse(tableMeta.schema || "[]") as {
        name: string;
        type: string;
      }[];
      columns = schema.map((col) => col.name);

      // Query the actual table if columns are known
      if (columns.length > 0) {
        const schemaName = `"${layer.toLowerCase()}"`;
        const tableName = `"${tableMeta.tableName}"`;
        const quotedColumns = columns.map((c) => `"${c}"`).join(", ");
        const result = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
          `SELECT ${quotedColumns} FROM ${schemaName}.${tableName} LIMIT 100`
        );
        rows = result;

        // Get actual count
        const countResult = await prisma.$queryRawUnsafe<
          { count: bigint }[]
        >(`SELECT COUNT(*) as count FROM ${schemaName}.${tableName}`);
        if (countResult.length > 0) {
          totalRows = Number(countResult[0].count);
        }
      } else {
        // No schema stored — discover columns from PostgreSQL
        const schemaName = `"${layer.toLowerCase()}"`;
        const tableName = `"${tableMeta.tableName}"`;
        const colResult = await prisma.$queryRawUnsafe<
          { column_name: string }[]
        >(
          `SELECT column_name FROM information_schema.columns WHERE table_schema='${layer.toLowerCase()}' AND table_name='${tableMeta.tableName}' ORDER BY ordinal_position`
        );
        columns = colResult.map((c) => c.column_name);
        if (columns.length > 0) {
          const quotedColumns = columns.map((c) => `"${c}"`).join(", ");
          const result = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
            `SELECT ${quotedColumns} FROM ${schemaName}.${tableName} LIMIT 100`
          );
          rows = result;
          const countResult = await prisma.$queryRawUnsafe<
            { count: bigint }[]
          >(`SELECT COUNT(*) as count FROM ${schemaName}.${tableName}`);
          if (countResult.length > 0) {
            totalRows = Number(countResult[0].count);
          }
        }
      }
    } catch {
      // Table may not exist yet in PostgreSQL — that's OK, return empty
      rows = [];
      try {
        columns = JSON.parse(tableMeta.schema || "[]").map(
          (col: { name: string }) => col.name
        );
      } catch {
        columns = [];
      }
    }

    // Convert BigInt to Number for JSON serialization
    const safeRows = rows.map(row => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        out[k] = typeof v === 'bigint' ? Number(v) : v;
      }
      return out;
    });

    return NextResponse.json({
      table: {
        tableName: tableMeta.tableName,
        displayName: tableMeta.displayName,
        description: tableMeta.description,
        layer: tableMeta.layer,
        rowsCount: totalRows,
        sizeBytes: tableMeta.sizeBytes,
      },
      columns,
      rows: safeRows,
      totalRows,
    });
  } catch (error) {
    console.error("Error fetching table data:", error);
    return NextResponse.json(
      { error: "Failed to fetch table data" },
      { status: 500 }
    );
  }
}
