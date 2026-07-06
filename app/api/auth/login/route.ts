import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { signSession, type SessionData } from "@/lib/auth";

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
    
    const session: SessionData = {
      id: user.id,
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role as any,
      tenantId: user.tenant?.id,
      tenantSlug: user.tenant?.slug,
    };
    
    const token = await signSession(session);
    const response = NextResponse.json({ 
      success: true, 
      session, 
      token, 
      redirectTo: "/dashboard" 
    });
    
    // Set cookie as well (best effort — may not work in all browser setups)
    response.cookies.set("gaung_session", token, {
      httpOnly: false,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: 604800,
    });
    
    return response;
  } catch (e) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
