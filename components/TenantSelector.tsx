"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/auth-client";

interface TenantInfo {
  tenantId?: number;
  tenantSlug?: string;
}

export default function TenantSelector() {
  const [tenant, setTenant] = useState<TenantInfo>({});

  useEffect(() => {
    authFetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => {
        if (data.session) {
          setTenant({
            tenantId: data.session.tenantId,
            tenantSlug: data.session.tenantSlug,
          });
        }
      })
      .catch(() => {});
  }, []);

  if (!tenant.tenantSlug) return null;

  return (
    <div className="px-5 py-3 border-b border-slate-800/50">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-md bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-[10px] font-bold text-indigo-400 shrink-0">
          {tenant.tenantSlug.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">Tenant</p>
          <p className="text-xs text-slate-300 truncate font-medium">{tenant.tenantSlug}</p>
        </div>
      </div>
    </div>
  );
}
