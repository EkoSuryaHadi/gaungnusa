import { cookies, headers } from "next/headers";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export type Role = "ADMIN" | "ANALYST" | "VIEWER";

export interface SessionData {
  id: number;
  userId: number;
  name: string;
  email: string;
  role: Role;
  tenantId?: number;
  tenantSlug?: string;
}

export const COOKIE_NAME = "gaung_session";
const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET too short");
  return new TextEncoder().encode(secret);
}

export async function signSession(data: SessionData): Promise<string> {
  return await new SignJWT(data as unknown as JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL}s`)
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionData | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
    if (typeof payload.id !== "number" || typeof payload.role !== "string") return null;
    return {
      id: payload.id as number,
      userId: payload.id as number,
      name: (payload.name as string) || "",
      email: (payload.email as string) || "",
      role: payload.role as Role,
      tenantId: payload.tenantId as number | undefined,
      tenantSlug: payload.tenantSlug as string | undefined,
    };
  } catch {
    return null;
  }
}

export async function setSession(data: SessionData): Promise<void> {
  const token = await signSession(data);
  const c = await cookies();
  c.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

/**
 * Extract token from: cookie (priority) OR Authorization: Bearer header (fallback)
 */
async function getToken(): Promise<string | null> {
  // 1. Try Authorization header first (explicit, set by authFetch)
  try {
    const h = await headers();
    const authHeader = h.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      return authHeader.slice(7);
    }
  } catch {
    // headers() might throw in some contexts
  }

  // 2. Fallback to cookie
  const c = await cookies();
  const cookie = c.get(COOKIE_NAME);
  if (cookie?.value) return cookie.value;

  return null;
}

export async function getSession(): Promise<SessionData | null> {
  const token = await getToken();
  if (!token) return null;
  return await verifySessionToken(token);
}

export async function destroySession(): Promise<void> {
  const c = await cookies();
  c.delete(COOKIE_NAME);
}
