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

  // Validate Gold layer: OUTPUT to GOLD requires preceding AGGREGATE, JOIN, or PIVOT
  if (steps && steps.length > 0) {
    const goldOutputs = steps.filter((s: any) => (s.outputLayer === "GOLD" || (s.config && typeof s.config === "string" && JSON.parse(s.config).outputLayer === "GOLD") || (s.config && typeof s.config === "object" && s.config.outputLayer === "GOLD")) && s.type === "OUTPUT");
    for (const goldOut of goldOutputs) {
      const hasPrecedingTransform = steps.some(
        (s: any) => (s.type === "AGGREGATE" || s.type === "JOIN" || s.type === "PIVOT") && s.order < goldOut.order
      );
      if (!hasPrecedingTransform) {
        return NextResponse.json(
          { error: "OUTPUT to GOLD layer requires a preceding AGGREGATE, JOIN, or PIVOT step. Add one before the OUTPUT step." },
          { status: 400 }
        );
      }
    }
  }

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
  const parsedId = parseInt(id);
  
  const deleted = await prisma.pipeline.deleteMany({
    where: { id: parsedId, userId: session.userId, ...(session.tenantId ? { tenantId: session.tenantId } : {}) },
  });
  
  // Fallback: legacy pipelines with NULL tenantId
  if (deleted.count === 0 && session.tenantId) {
    await prisma.pipeline.updateMany({
      where: { id: parsedId, userId: session.userId, tenantId: null },
      data: { tenantId: session.tenantId },
    });
    await prisma.pipeline.deleteMany({
      where: { id: parsedId, userId: session.userId, tenantId: session.tenantId },
    });
  }

  return NextResponse.json({ success: true });
}
