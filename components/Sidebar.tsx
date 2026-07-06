"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Database,
  GitBranch,
  Network,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  LogOut,
} from "lucide-react";
import TenantSelector from "@/components/TenantSelector";

const NAV_ITEMS = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/sources", icon: Database, label: "Data Sources" },
  { href: "/pipelines", icon: GitBranch, label: "ETL Pipelines" },
  { href: "/lakehouse", icon: Network, label: "Lakehouse" },
  { href: "/dashboards", icon: BarChart3, label: "Dashboards" },
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
        className="fixed top-4 left-4 z-50 lg:hidden flex items-center justify-center w-9 h-9"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          color: "var(--text-secondary)",
          borderRadius: "var(--radius-sm)",
        }}
        aria-label="Toggle sidebar"
      >
        {collapsed ? (
          <ChevronRight size={16} />
        ) : (
          <ChevronLeft size={16} />
        )}
      </button>

      {/* Overlay (mobile) */}
      {!collapsed && (
        <div
          className="fixed inset-0 z-30 lg:hidden"
          style={{ background: "rgba(13, 13, 12, 0.72)" }}
          onClick={() => setCollapsed(true)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full z-40 flex flex-col transition-all duration-300
          ${collapsed ? "-translate-x-full lg:translate-x-0 lg:w-16" : "translate-x-0 w-60 lg:w-56"}`}
        style={{
          background: "var(--bg-elevated)",
          borderRight: "1px solid var(--border-subtle)",
        }}
      >
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex absolute items-center justify-center w-6 h-6"
          style={{
            top: "14px",
            right: "10px",
            zIndex: 50,
            background: "transparent",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
          }}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight size={13} />
          ) : (
            <ChevronLeft size={13} />
          )}
        </button>

        {/* Brand */}
        <Link
          href="/dashboard"
          className="flex items-center no-underline"
          style={{
            padding: collapsed ? "18px 0 18px 0" : "22px 24px 18px 22px",
            borderBottom: "1px solid var(--border-subtle)",
            justifyContent: collapsed ? "center" : "flex-start",
          }}
        >
          {collapsed ? (
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "18px",
                fontWeight: 400,
                fontStyle: "italic",
                color: "var(--gold-400)",
                letterSpacing: "-0.02em",
              }}
            >
              G
            </span>
          ) : (
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "23px",
                fontWeight: 400,
                fontStyle: "italic",
                color: "var(--gold-400)",
                letterSpacing: "-0.01em",
                lineHeight: 1,
              }}
            >
              Gaung
            </span>
          )}
        </Link>

        {!collapsed && <TenantSelector />}

        {/* Navigation */}
        <nav
          className="flex-1 overflow-y-auto"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "2px",
            padding: collapsed ? "14px 0" : "16px 10px 16px 0",
          }}
        >
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setCollapsed(true)}
                className="flex items-center no-underline transition-colors duration-200"
                style={{
                  fontFamily: "var(--font-body)",
                  fontWeight: active ? 500 : 400,
                  fontSize: "14px",
                  color: active ? "var(--gold-400)" : "var(--text-muted)",
                  background: active ? "var(--gold-dim)" : "transparent",
                  borderLeft: active
                    ? "2px solid var(--gold-500)"
                    : "2px solid transparent",
                  paddingLeft: active ? "14px" : "16px",
                  paddingRight: collapsed ? "0" : "14px",
                  paddingTop: "10px",
                  paddingBottom: "10px",
                  borderRadius: "0 var(--radius-sm) var(--radius-sm) 0",
                  justifyContent: collapsed ? "center" : "flex-start",
                  gap: collapsed ? "0" : "12px",
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    e.currentTarget.style.color = "var(--text-secondary)";
                    e.currentTarget.style.background =
                      "rgba(168, 154, 132, 0.04)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    e.currentTarget.style.color = "var(--text-muted)";
                    e.currentTarget.style.background = "transparent";
                  }
                }}
              >
                <Icon
                  size={collapsed ? 19 : 17}
                  style={{
                    flexShrink: 0,
                    opacity: active ? 1 : 0.5,
                    transition: "opacity 200ms",
                  }}
                />
                {!collapsed && (
                  <span className="truncate">{item.label}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div
          style={{
            borderTop: "1px solid var(--border-subtle)",
            padding: collapsed ? "14px 0" : "14px 18px 16px 18px",
            display: "flex",
            justifyContent: collapsed ? "center" : "flex-start",
            alignItems: "center",
            gap: collapsed ? "0" : "10px",
          }}
        >
          <div
            className="echo-ring"
            style={{
              width: "20px",
              height: "20px",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              position: "relative",
            }}
          >
            <div
              style={{
                width: "5px",
                height: "5px",
                borderRadius: "50%",
                background: "var(--gold-400)",
                opacity: 0.65,
              }}
            />
          </div>
          {collapsed ? (
            <Link
              href="/api/auth/logout"
              className="btn btn-ghost"
              style={{ padding: "4px 6px" }}
              title="Sign out"
            >
              <LogOut size={13} />
            </Link>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flex: 1 }}>
              <span
                style={{
                  fontSize: "11px",
                  color: "var(--text-muted)",
                  fontFamily: "var(--font-body)",
                  fontWeight: 300,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                Connected
              </span>
              <Link
                href="/api/auth/logout"
                className="btn btn-ghost"
                style={{ padding: "4px 8px" }}
                title="Sign out"
              >
                <LogOut size={14} />
              </Link>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
