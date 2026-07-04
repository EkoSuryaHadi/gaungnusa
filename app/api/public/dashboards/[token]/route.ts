import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const dashboard = await prisma.dashboard.findFirst({
    where: { shareToken: token, isPublic: true },
    include: { widgets: { orderBy: { createdAt: "asc" } } },
  });

  if (!dashboard) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Load data for each widget
  const widgetsWithData = await Promise.all(
    dashboard.widgets.map(async (w) => {
      const cfg = JSON.parse(w.config || "{}");
      const layer = cfg.layer || (cfg.dataSource ? cfg.dataSource.split("/")[0].toLowerCase() : null);
      const table = cfg.table || (cfg.dataSource ? cfg.dataSource.split("/").slice(1).join("/") : null);
      let rows: any[] = [];

      if (layer && table) {
        try {
          let query: string;
          if (w.type === "KPI" && cfg.xField && cfg.yField) {
            const agg = cfg.yField.toUpperCase();
            query = `SELECT ${agg}("${cfg.xField}") as "${cfg.xField}" FROM "${layer}"."${table}"`;
          } else {
            query = `SELECT * FROM "${layer}"."${table}" LIMIT 1000`;
          }
          rows = await prisma.$queryRawUnsafe(query);
          // Convert BigInt
          rows = JSON.parse(JSON.stringify(rows, (_, v) => typeof v === "bigint" ? Number(v) : v));
        } catch {}
      }
      return { id: w.id, type: w.type, title: w.title, cfg, rows };
    })
  );

  return NextResponse.json({ name: dashboard.name, widgets: widgetsWithData });
}
