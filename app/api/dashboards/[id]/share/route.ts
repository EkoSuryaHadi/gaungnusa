import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

// Toggle sharing — generate or revoke shareToken
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const dashboard = await prisma.dashboard.findFirst({
    where: { id: parseInt(id), userId: session.userId },
  });

  if (!dashboard) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (dashboard.shareToken) {
    // Revoke sharing
    await prisma.dashboard.update({
      where: { id: dashboard.id },
      data: { isPublic: false, shareToken: null },
    });
    return NextResponse.json({ shared: false, url: null });
  } else {
    // Enable sharing
    const token = crypto.randomBytes(16).toString("hex");
    await prisma.dashboard.update({
      where: { id: dashboard.id },
      data: { isPublic: true, shareToken: token },
    });
    return NextResponse.json({
      shared: true,
      shareUrl: `/share/${token}`,
    });
  }
}
