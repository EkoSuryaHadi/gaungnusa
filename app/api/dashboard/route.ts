import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantFilter = session.tenantId ? { tenantId: session.tenantId } : {};

  const [silverCount, bronzeCount, goldCount, recentPipelines, recentSources] = await Promise.all([
    prisma.lakehouseTable.count({ where: { layer: "SILVER", ...tenantFilter } }),
    prisma.lakehouseTable.count({ where: { layer: "BRONZE", ...tenantFilter } }),
    prisma.lakehouseTable.count({ where: { layer: "GOLD", ...tenantFilter } }),
    prisma.pipeline.findMany({
      where: { userId: session.userId, ...tenantFilter },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, name: true, status: true, updatedAt: true },
    }),
    prisma.dataSource.findMany({
      where: { userId: session.userId, ...tenantFilter },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { id: true, name: true, type: true, createdAt: true },
    }),
  ]);

  return NextResponse.json({
    session,
    counts: { bronze: bronzeCount, silver: silverCount, gold: goldCount },
    recentPipelines,
    recentSources,
  });
}
