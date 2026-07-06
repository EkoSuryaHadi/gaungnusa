import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ layer: string; table: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { layer, table } = await params;
  const layerLower = layer.toLowerCase();
  const tableLower = table.toLowerCase();
  const column = req.nextUrl.searchParams.get("column");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "100");

  if (!column) return NextResponse.json({ error: "column is required" }, { status: 400 });

  try {
    const query = `SELECT DISTINCT "${column}" as value FROM "${layerLower}"."${tableLower}" WHERE "${column}" IS NOT NULL ORDER BY "${column}" LIMIT ${limit}`;
    const rows = await prisma.$queryRawUnsafe<{ value: string }[]>(query);
    const values = rows.map((r) => r.value);
    return NextResponse.json({ values, sql: query });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
