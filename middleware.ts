import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth";

// Only protect API routes — page auth is handled by client-side AuthGuard
const PROTECTED_API_PREFIXES = ["/api/sources", "/api/pipelines", "/api/dashboards", "/api/dashboard", "/api/lakehouse", "/api/tenants"];
const PUBLIC_API_PREFIXES = ["/api/export", "/api/auth", "/api/public", "/api/webhook", "/api/metabase"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only run for protected API routes
  const isProtectedApi = PROTECTED_API_PREFIXES.some(p => pathname.startsWith(p));
  const isPublicApi = PUBLIC_API_PREFIXES.some(p => pathname.startsWith(p));
  if (!isProtectedApi || isPublicApi) return NextResponse.next();

  // Allow POST to /api/tenants (tenant registration) without auth
  if (pathname === "/api/tenants" && request.method === "POST") {
    return NextResponse.next();
  }

  // Check session cookie + Authorization header
  const cookieToken = request.cookies.get(COOKIE_NAME)?.value;
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const token = cookieToken || bearerToken;

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const session = await verifySessionToken(token);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
