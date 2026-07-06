import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dashboards = await prisma.dashboard.findMany({
    where: {
      userId: session.userId,
      ...(session.tenantId ? { tenantId: session.tenantId } : {}),
    },
    include: {
      widgets: { select: { id: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ dashboards });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, description } = body;

  if (!name) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }

  const dashboard = await prisma.dashboard.create({
    data: {
      userId: session.userId,
      tenantId: session.tenantId ?? null,
      name,
      description: description || null,
    },
    include: { widgets: true },
  });

  return NextResponse.json(dashboard);
}
