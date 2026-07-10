import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { signSession, type SessionData } from "@/lib/auth";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function POST(request: Request) {
  try {
    const { orgName, adminName, email, password } = await request.json();

    // Validate required fields
    if (!orgName || !adminName || !email || !password) {
      return NextResponse.json(
        { error: "Semua field wajib diisi." },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password minimal 6 karakter." },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existingUser) {
      return NextResponse.json(
        { error: "Email sudah terdaftar. Silakan gunakan email lain." },
        { status: 409 }
      );
    }

    // Generate unique slug from org name
    let baseSlug = slugify(orgName);
    if (!baseSlug) baseSlug = "tenant";

    let slug = baseSlug;
    let counter = 1;
    while (true) {
      const existing = await prisma.tenant.findUnique({ where: { slug } });
      if (!existing) break;
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create tenant and admin user in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: orgName.trim(), slug },
      });

      const user = await tx.user.create({
        data: {
          name: adminName.trim(),
          email: normalizedEmail,
          password: hashedPassword,
          role: "ADMIN",
          tenantId: tenant.id,
        },
      });

      return { tenant, user };
    });

    // Generate JWT session
    const session: SessionData = {
      id: result.user.id,
      userId: result.user.id,
      name: result.user.name,
      email: result.user.email,
      role: "ADMIN",
      tenantId: result.tenant.id,
      tenantSlug: result.tenant.slug,
    };

    const token = await signSession(session);

    const response = NextResponse.json({
      success: true,
      token,
      session,
      tenant: {
        id: result.tenant.id,
        name: result.tenant.name,
        slug: result.tenant.slug,
      },
    });

    // Set cookie as well — flags must match setSession() in lib/auth.ts
    response.cookies.set("gaung_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 604800,
    });

    return response;
  } catch (e: any) {
    console.error("Tenant registration error:", e);
    return NextResponse.json(
      { error: "Terjadi kesalahan server. Silakan coba lagi." },
      { status: 500 }
    );
  }
}
