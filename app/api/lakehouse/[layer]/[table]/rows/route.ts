import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ layer: string; table: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { layer, table } = await params;
  const layerLower = layer.toLowerCase();

  if (!["silver", "bronze", "gold"].includes(layerLower)) {
    return NextResponse.json({ error: "Invalid layer" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const rows: { deviceId: string; timestamp: string; values: Record<string, unknown> }[] = body.rows;

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: "No rows provided" }, { status: 400 });
    }

    const schemaName = `"${layerLower}"`;
    const tableName = `"${table}"`;

    let updated = 0;
    for (const row of rows) {
      if (!row.deviceId || !row.timestamp) {
        console.warn("Skipping row without deviceId/timestamp:", row);
        continue;
      }

      const setClauses: string[] = [];
      const values: (string | number)[] = [];

      for (const [col, val] of Object.entries(row.values)) {
        setClauses.push(`"${col}" = $${values.length + 1}`);
        if (typeof val === "number" && !isNaN(val)) {
          values.push(val);
        } else {
          values.push(String(val ?? ""));
        }
      }

      if (setClauses.length === 0) continue;

      // Use composite key: device_id + timestamp
      const setStr = setClauses.join(", ");
      const di = values.length + 1;
      const ts = values.length + 2;
      values.push(row.deviceId, row.timestamp);

      const result = await prisma.$executeRawUnsafe(
        `UPDATE ${schemaName}.${tableName} 
         SET ${setStr} 
         WHERE "device_id" = $${di} AND "timestamp" = $${ts}::timestamptz`,
        ...values
      );
      updated += result;
    }

    return NextResponse.json({ success: true, updated });
  } catch (error) {
    console.error("Error updating rows:", error);
    return NextResponse.json(
      { error: "Failed to update rows" },
      { status: 500 }
    );
  }
}
