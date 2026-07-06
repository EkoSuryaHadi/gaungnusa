import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pipelines = await prisma.pipeline.findMany({
    where: { userId: session.userId },
    include: {
      steps: { orderBy: { order: "asc" } },
      runs: { orderBy: { createdAt: "desc" }, take: 1 },
      source: { select: { name: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ pipelines });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { name, description, sourceId, steps } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Pipeline name is required" }, { status: 400 });
    }

    if (!steps || steps.length === 0) {
      return NextResponse.json({ error: "At least one step is required" }, { status: 400 });
    }

    // Validate Gold layer: OUTPUT to GOLD requires preceding AGGREGATE, JOIN, or PIVOT
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

    const pipeline = await prisma.pipeline.create({
      data: {
        userId: session.userId,
        tenantId: session.tenantId ?? null,
        name: name.trim(),
        description: description || null,
        sourceId: sourceId && typeof sourceId === "number" ? sourceId : null,
        status: "DRAFT",
        steps: {
          create: steps.map((step: any) => ({
            order: step.order,
            type: step.type,
            config: typeof step.config === "string" ? step.config : JSON.stringify(step.config),
            inputLayer: step.inputLayer || null,
            outputLayer: step.outputLayer || null,
            outputTable: step.outputTable || null,
          })),
        },
      },
      include: {
        steps: { orderBy: { order: "asc" } },
      },
    });

    return NextResponse.json(pipeline, { status: 201 });
  } catch (error: any) {
    console.error("Pipeline create error:", error);
    return NextResponse.json({ error: error.message || "Failed to create pipeline" }, { status: 500 });
  }
}
