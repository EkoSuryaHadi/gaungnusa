import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tables = await prisma.lakehouseTable.findMany({
    where: {
      ...(session.tenantId ? { tenantId: session.tenantId } : {}),
    },
    orderBy: [{ layer: "asc" }, { tableName: "asc" }],
  });

  return NextResponse.json(tables);
}
