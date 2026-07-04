import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { setSession } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Email dan password wajib diisi." }, { status: 400 });
    }
    
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: { tenant: true },
    });
    if (!user) {
      return NextResponse.json({ error: "Akun tidak ditemukan." }, { status: 404 });
    }
    
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return NextResponse.json({ error: "Password salah." }, { status: 401 });
    }
    
    const session = {
      id: user.id,
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role as any,
      tenantId: user.tenant?.id,
      tenantSlug: user.tenant?.slug,
    };
    await setSession(session);
    
    return NextResponse.json({ success: true, session, redirectTo: "/dashboard" });
  } catch (e) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
