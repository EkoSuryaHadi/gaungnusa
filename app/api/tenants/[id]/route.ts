import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET: Return tenant info (any authenticated user in the tenant)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const tenantId = parseInt(id, 10);

  if (isNaN(tenantId) || session.tenantId !== tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
    },
  });

  if (!tenant) {
    return NextResponse.json({ error: "Tenant tidak ditemukan." }, { status: 404 });
  }

  return NextResponse.json(tenant);
}
