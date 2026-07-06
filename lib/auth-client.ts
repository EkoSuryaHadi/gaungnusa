"use client";

const STORAGE_KEY = "gaung_auth";

interface StoredAuth {
  token: string;
  session: {
    id: number;
    userId: number;
    name: string;
    email: string;
    role: string;
    tenantId?: number;
    tenantSlug?: string;
  };
  ts: number;
}

export function storeAuth(token: string, session: any) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ token, session, ts: Date.now() })
  );
}

export function getStoredAuth(): StoredAuth | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as StoredAuth;
    // Expire after 7 days
    if (Date.now() - data.ts > 7 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function getStoredToken(): string | null {
  return getStoredAuth()?.token ?? null;
}

export function clearAuth() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Fetch wrapper that automatically includes Authorization header from localStorage.
 * Use this instead of raw fetch() for all protected API calls.
 */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(url, { ...options, headers });
}
