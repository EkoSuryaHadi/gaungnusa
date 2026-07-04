"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import TenantSelector from "@/components/TenantSelector";

const NAV_ITEMS = [
  { href: "/dashboard", icon: "🏠", label: "Dashboard" },
  { href: "/sources", icon: "📥", label: "Data Sources" },
  { href: "/pipelines", icon: "⚙️", label: "ETL Pipelines" },
  { href: "/lakehouse", icon: "🏗️", label: "Lakehouse" },
  { href: "/dashboards", icon: "📊", label: "Dashboards" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="fixed top-4 left-4 z-50 lg:hidden p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 transition-colors"
        aria-label="Toggle sidebar"
      >
        {collapsed ? "☰" : "✕"}
      </button>

      {/* Overlay (mobile) */}
      {!collapsed && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setCollapsed(true)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full z-40 transition-all duration-300 flex flex-col
          ${collapsed ? "-translate-x-full lg:translate-x-0 lg:w-16" : "translate-x-0 w-60 lg:w-56"}`}
        style={{
          backgroundColor: "rgba(15, 23, 42, 0.95)",
          backdropFilter: "blur(16px)",
          borderRight: "1px solid rgba(51, 65, 85, 0.5)",
        }}
      >
        {/* Brand */}
        <Link
          href="/dashboard"
          className="flex items-center gap-3 px-5 py-5 border-b border-slate-800/50 hover:no-underline"
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-indigo-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
            G
          </div>
          {!collapsed && (
            <span className="font-bold text-white text-lg tracking-tight">Gaung</span>
          )}
        </Link>

        {/* Tenant Selector */}
        <TenantSelector />

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setCollapsed(true)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all group
                  ${active
                    ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent"
                  }`}
              >
                <span className="text-lg shrink-0">{item.icon}</span>
                {!collapsed && <span className="truncate">{item.label}</span>}
                {active && !collapsed && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        {!collapsed && (
          <div className="px-5 py-4 border-t border-slate-800/50">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-slate-500">Connected</span>
            </div>
          </div>
        )}
      </aside>

      {/* Desktop collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="hidden lg:flex fixed left-[13.5rem] top-[1.35rem] z-50 w-5 h-5 rounded-full bg-slate-700 border border-slate-600 text-[10px] text-slate-400 hover:text-white hover:bg-slate-600 items-center justify-center transition-all"
        style={{ transform: collapsed ? "translateX(-12.5rem)" : "none" }}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? "→" : "←"}
      </button>
    </>
  );
}
