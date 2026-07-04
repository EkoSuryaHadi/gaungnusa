import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/prisma";

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
    const tableMeta = await prisma.lakehouseTable.findFirst({
      where: {
        layer: layerUpper,
        tableName: table,
        ...(session.tenantId ? { tenantId: session.tenantId } : {}),
      },
      select: {
        tableName: true,
        displayName: true,
        description: true,
        layer: true,
        schema: true,
        rowsCount: true,
        sizeBytes: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!tableMeta) {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    let columns: { name: string; type: string }[] = [];
    try {
      columns = JSON.parse(tableMeta.schema || "[]");
    } catch {
      columns = [];
    }

    // Fallback: if schema is empty, read directly from PostgreSQL via Prisma
    if (columns.length === 0) {
      try {
        const rows = await prisma.$queryRawUnsafe<any[]>(
          `SELECT column_name, data_type 
           FROM information_schema.columns 
           WHERE table_schema = $1 AND table_name = $2
           ORDER BY ordinal_position`,
          layerUpper.toLowerCase(),
          table
        );
        columns = rows.map((r: any) => ({
          name: r.column_name,
          type: r.data_type,
        }));
      } catch (pgErr) {
        console.error("Failed to read columns from PostgreSQL:", pgErr);
      }
    }

    return NextResponse.json({
      ...tableMeta,
      columns,
    });
  } catch (error) {
    console.error("Error fetching table schema:", error);
    return NextResponse.json(
      { error: "Failed to fetch table schema" },
      { status: 500 }
    );
  }
}
