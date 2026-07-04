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
  const pipeline = await prisma.pipeline.findFirst({
    where: { id: parseInt(id), userId: session.userId, ...(session.tenantId ? { tenantId: session.tenantId } : {}) },
    include: {
      steps: { orderBy: { order: "asc" } },
      source: true,
      runs: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });

  if (!pipeline) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(pipeline);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { name, description, sourceId, steps, status, schedule } = body;

  // Delete existing steps & re-create
  await prisma.pipelineStep.deleteMany({ where: { pipelineId: parseInt(id) } });

  const pipeline = await prisma.pipeline.update({
    where: { id: parseInt(id) },
    data: {
      ...(name && { name }),
      ...(description !== undefined && { description }),
      ...(sourceId && { sourceId: parseInt(sourceId) }),
      ...(status && { status }),
      ...(schedule !== undefined && { schedule }),
      steps: {
        create: (steps || []).map((s: any, idx: number) => ({
          order: s.order || idx,
          type: s.type,
          config: typeof s.config === "string" ? s.config : JSON.stringify(s.config || {}),
          inputLayer: s.inputLayer || null,
          outputLayer: s.outputLayer || null,
          outputTable: s.outputTable || null,
          positionX: s.positionX || (200 + idx * 300),
          positionY: s.positionY || 100,
        })),
      },
    },
    include: { steps: true },
  });

  return NextResponse.json(pipeline);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.pipeline.deleteMany({
    where: { id: parseInt(id), userId: session.userId, ...(session.tenantId ? { tenantId: session.tenantId } : {}) },
  });

  return NextResponse.json({ success: true });
}
