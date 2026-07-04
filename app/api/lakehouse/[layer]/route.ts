import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ layer: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { layer } = await params;
  const layerUpper = layer.toUpperCase();

  if (!["SILVER", "BRONZE", "GOLD"].includes(layerUpper)) {
    return NextResponse.json({ error: "Invalid layer" }, { status: 400 });
  }

  try {
    const tables = await prisma.lakehouseTable.findMany({
      where: {
        layer: layerUpper,
        ...(session.tenantId ? { tenantId: session.tenantId } : {}),
      },
      orderBy: { tableName: "asc" },
      select: {
        id: true,
        tableName: true,
        displayName: true,
        description: true,
        rowsCount: true,
        sizeBytes: true,
        schema: true,
        createdAt: true,
      },
    });

    // Parse schema JSON and extract column count
    const result = tables.map((t) => {
      let columns: { name: string; type: string }[] = [];
      try {
        columns = JSON.parse(t.schema || "[]");
      } catch {
        // ignore parse errors
      }
      return {
        ...t,
        columnsCount: columns.length,
        schema: undefined, // don't send full schema in list view
      };
    });

    return NextResponse.json({ tables: result });
  } catch (error) {
    console.error("Error fetching lakehouse tables:", error);
    return NextResponse.json(
      { error: "Failed to fetch tables" },
      { status: 500 }
    );
  }
}
