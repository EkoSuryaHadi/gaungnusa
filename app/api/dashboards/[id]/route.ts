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
    where: { id: parseInt(id), userId: session.userId, ...(session.tenantId ? { tenantId: session.tenantId } : {}) },
    include: { widgets: { orderBy: { createdAt: "asc" } } },
  });

  if (!dashboard) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(dashboard);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { name, description, layout, isPublic, widgets } = body;

  // Delete old widgets, recreate
  if (widgets) {
    await prisma.dashboardWidget.deleteMany({ where: { dashboardId: parseInt(id) } });
  }

  const dashboard = await prisma.dashboard.update({
    where: { id: parseInt(id) },
    data: {
      ...(name && { name }),
      ...(description !== undefined && { description }),
      ...(layout !== undefined && { layout: typeof layout === "string" ? layout : JSON.stringify(layout) }),
      ...(isPublic !== undefined && { isPublic }),
      ...(widgets && {
        widgets: {
          create: widgets.map((w: any) => ({
            type: w.type || "TEXT",
            title: w.title || "Untitled",
            config: typeof w.config === "string" ? w.config : JSON.stringify(w.config || {}),
            gridX: w.gridX || 0,
            gridY: w.gridY || 0,
            gridW: w.gridW || 4,
            gridH: w.gridH || 3,
          })),
        },
      }),
    },
    include: { widgets: { orderBy: { createdAt: "asc" } } },
  });

  return NextResponse.json(dashboard);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.dashboard.deleteMany({
    where: { id: parseInt(id), userId: session.userId, ...(session.tenantId ? { tenantId: session.tenantId } : {}) },
  });

  return NextResponse.json({ success: true });
}
