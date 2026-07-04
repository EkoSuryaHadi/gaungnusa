import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function serializeRows(rows: any): any {
  return JSON.parse(
    JSON.stringify(rows, (_key: string, value: any): any => {
      if (typeof value === "bigint") return Number(value);
      return value;
    }),
    (_key: string, value: any): any => {
      // Prisma returns PostgreSQL numeric/decimal as strings — convert back
      if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value) && value.length <= 20) {
        const n = Number(value);
        if (!isNaN(n)) return Number.isInteger(n) ? n : parseFloat(n.toFixed(6));
      }
      return value;
    }
  );
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { layer, table, query } = body;

    let sql: string;
    if (query) {
      sql = query;
    } else if (layer && table) {
      sql = `SELECT * FROM "${layer.toLowerCase()}"."${table.toLowerCase()}" LIMIT 1000`;
    } else {
      return NextResponse.json({ error: "layer+table or query required" }, { status: 400 });
    }

    const rows = await prisma.$queryRawUnsafe(sql);
    const safe = serializeRows(rows);
    return NextResponse.json({ rows: safe, sql });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
