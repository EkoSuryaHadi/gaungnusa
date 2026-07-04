import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pipelines = await prisma.pipeline.findMany({
    where: {
      userId: session.userId,
      ...(session.tenantId ? { tenantId: session.tenantId } : {}),
    },
    include: {
      steps: { orderBy: { order: "asc" } },
      source: true,
      runs: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(pipelines);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, description, sourceId, steps } = body;

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const pipeline = await prisma.pipeline.create({
    data: {
      userId: session.userId,
      tenantId: session.tenantId ?? null,
      ...(sourceId ? { sourceId: parseInt(sourceId) } : {}),
      name,
      description: description || null,
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
