import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Simple token for Power BI access
const EXPORT_TOKEN = "gaung-export-2026";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  
  // Simple shared token authentication
  const token = url.searchParams.get("token") || "";
  if (token !== EXPORT_TOKEN) {
    return Response.json({ error: "Invalid or missing token" }, { status: 401 });
  }

  const layer = (url.searchParams.get("layer") || "silver").toLowerCase();
  const table = url.searchParams.get("table");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "1000"), 5000);

  if (!table) {
    return Response.json({ error: "Missing table parameter" }, { status: 400 });
  }

  if (!["bronze", "silver", "gold"].includes(layer)) {
    return Response.json({ error: "Invalid layer" }, { status: 400 });
  }

  try {
    const rows: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM "${layer}"."${table}" LIMIT ${limit}`
    );

    const output = { table: `${layer}.${table}`, rows, count: rows.length };
    const body = JSON.stringify(output, (_, v) =>
      typeof v === "bigint" ? Number(v) : v
    );

    return new Response(body, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
