import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const dashboard = await prisma.dashboard.findFirst({
    where: { id: parseInt(id), userId: session.userId },
    include: { widgets: true },
  });

  if (!dashboard) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Build CSV with all widget data
  const rows: string[] = [];
  rows.push(`Dashboard: ${dashboard.name}`);
  rows.push(`Exported: ${new Date().toISOString()}`);
  rows.push("");

  for (const widget of dashboard.widgets) {
    const cfg = JSON.parse(widget.config || "{}");
    const layer = cfg.layer || (cfg.dataSource ? cfg.dataSource.split("/")[0].toLowerCase() : null);
    const table = cfg.table || (cfg.dataSource ? cfg.dataSource.split("/").slice(1).join("/") : null);

    rows.push(`--- ${widget.type}: ${widget.title} ---`);

    if (layer && table) {
      try {
        let query: string;
        if (widget.type === "KPI" && cfg.xField && cfg.yField) {
          const agg = cfg.yField.toUpperCase();
          query = `SELECT ${agg}("${cfg.xField}") as "${cfg.xField}" FROM "${layer}"."${table}"`;
        } else {
          query = `SELECT * FROM "${layer}"."${table}" LIMIT 1000`;
        }

        const data = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(query);
        if (data.length > 0) {
          const cols = Object.keys(data[0]);
          rows.push(cols.join(","));
          for (const row of data) {
            rows.push(cols.map((c) => {
              const v = row[c];
              if (v === null || v === undefined) return "";
              const s = String(v);
              return s.includes(",") || s.includes('"') || s.includes("\n")
                ? `"${s.replace(/"/g, '""')}"`
                : s;
            }).join(","));
          }
        } else {
          rows.push("(no data)");
        }
      } catch (e: any) {
        rows.push(`(error: ${e.message})`);
      }
    } else {
      rows.push(`Type: ${widget.type}, Config: ${widget.config}`);
    }
    rows.push("");
  }

  return new NextResponse(rows.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${dashboard.name.replace(/[^a-zA-Z0-9]/g, "_")}_export.csv"`,
    },
  });
}
