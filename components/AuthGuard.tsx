"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getStoredAuth } from "@/lib/auth-client";

const PUBLIC_PATHS = ["/login", "/register"];

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
      setReady(true);
      return;
    }

    const auth = getStoredAuth();
    if (!auth) {
      router.replace("/login");
      return;
    }
    setReady(true);
  }, [pathname, router]);

  if (!ready && !PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return null;
  }

  return <>{children}</>;
}
