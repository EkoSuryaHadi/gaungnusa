import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// PUT: Update user role (ADMIN only, same tenant)
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, userId } = await params;
  const tenantId = parseInt(id, 10);
  const targetUserId = parseInt(userId, 10);

  if (isNaN(tenantId) || session.tenantId !== tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { role } = await request.json();

    if (!["ADMIN", "ANALYST", "VIEWER"].includes(role)) {
      return NextResponse.json(
        { error: "Role tidak valid." },
        { status: 400 }
      );
    }

    // Verify target user belongs to the same tenant
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser || targetUser.tenantId !== tenantId) {
      return NextResponse.json({ error: "User tidak ditemukan." }, { status: 404 });
    }

    const updated = await prisma.user.update({
      where: { id: targetUserId },
      data: { role },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    return NextResponse.json(updated);
  } catch (e: any) {
    console.error("Update user error:", e);
    return NextResponse.json(
      { error: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}

// DELETE: Remove user from tenant — set tenantId to null (ADMIN only, can't remove self)
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, userId } = await params;
  const tenantId = parseInt(id, 10);
  const targetUserId = parseInt(userId, 10);

  if (isNaN(tenantId) || session.tenantId !== tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Cannot remove self
  if (targetUserId === session.userId) {
    return NextResponse.json(
      { error: "Anda tidak dapat menghapus akun sendiri." },
      { status: 400 }
    );
  }

  try {
    // Verify target user belongs to the same tenant
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser || targetUser.tenantId !== tenantId) {
      return NextResponse.json({ error: "User tidak ditemukan." }, { status: 404 });
    }

    // Remove from tenant (set tenantId to null)
    await prisma.user.update({
      where: { id: targetUserId },
      data: { tenantId: null },
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("Delete user error:", e);
    return NextResponse.json(
      { error: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}
