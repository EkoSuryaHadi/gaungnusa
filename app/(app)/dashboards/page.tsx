"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, Pencil, Clock, Plus, AlertCircle, RefreshCw } from "lucide-react";
import DeleteButton from "./delete-button";
import { authFetch } from "@/lib/auth-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Dashboard {
  id: number;
  name: string;
  description: string | null;
  updatedAt: string;
  widgets: { id: number }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(date: string): string {
  const now = Date.now();
  const diff = now - new Date(date).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "baru saja";
  if (mins < 60) return `${mins}m lalu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}j lalu`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}h lalu`;
  return new Date(date).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
  });
}

// Asymmetric card weight assignment — not uniform, not predictable
// Pattern: glow (heavy, span-2), echo (medium), card (light), card (light), echo (medium), glow (heavy)
function getCardWeight(index: number): {
  className: string;
  span: number;
} {
  const p = index % 6;
  if (p === 0 || p === 5) return { className: "card-glow", span: 2 };
  if (p === 1 || p === 4) return { className: "card echo-ring", span: 1 };
  return { className: "card", span: 1 };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DashboardsPage() {
  const router = useRouter();
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const handleDashboardDeleted = useCallback((id: number) => {
    setDashboards((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const fetchDashboards = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await authFetch("/api/dashboards");
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) throw new Error(`Failed to fetch dashboards (${res.status})`);
      const data = await res.json();
      setDashboards(data.dashboards ?? data ?? []);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchDashboards();
  }, [fetchDashboards]);

  // ----- Loading skeleton -----
  if (loading) {
    return (
      <>
        <style>{`
          .dash-grid {
            display: grid;
            grid-template-columns: 1fr;
            grid-auto-rows: minmax(140px, auto);
            gap: 16px;
          }
          @media (min-width: 640px) {
            .dash-grid { grid-template-columns: repeat(2, 1fr); gap: 20px; }
          }
          @media (min-width: 1024px) {
            .dash-grid { grid-template-columns: repeat(3, 1fr); gap: 24px; }
          }
          @media (min-width: 1280px) {
            .dash-grid { grid-template-columns: repeat(4, 1fr); }
          }
        `}</style>

        <div
          className="page-enter"
          style={{
            maxWidth: "1280px",
            margin: "0 auto",
            padding: "36px 24px",
            display: "flex",
            flexDirection: "column",
            gap: "36px",
          }}
        >
          {/* Header skeleton */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "16px",
            }}
          >
            <div>
              <div className="skeleton" style={{ width: 200, height: 34, marginBottom: 8 }} />
              <div className="skeleton" style={{ width: 160, height: 16 }} />
            </div>
            <div className="skeleton" style={{ width: 150, height: 40, borderRadius: "var(--radius-md)" }} />
          </div>
          <hr className="divider" />
          {/* Card skeletons */}
          <div className="dash-grid stagger">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
                <div className="skeleton" style={{ width: "60%", height: 18 }} />
                <div className="skeleton" style={{ width: "80%", height: 14 }} />
                <div className="skeleton" style={{ width: "80%", height: 14 }} />
                <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 14, borderTop: "1px solid var(--border-subtle)" }}>
                  <div className="skeleton" style={{ width: 80, height: 12 }} />
                  <div className="skeleton" style={{ width: 60, height: 12 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }

  // ----- Error state -----
  if (error) {
    return (
      <div
        className="page-enter"
        style={{
          maxWidth: "1280px",
          margin: "0 auto",
          padding: "36px 24px",
          display: "flex",
          flexDirection: "column",
          gap: "36px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "16px",
          }}
        >
          <div>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "34px",
                fontWeight: 400,
                color: "var(--gold-400)",
                lineHeight: 1.15,
                margin: 0,
                letterSpacing: "-0.01em",
              }}
            >
              Dashboards
            </h1>
          </div>
        </div>
        <div
          className="card"
          style={{
            padding: 48,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          }}
        >
          <AlertCircle size={40} style={{ color: "var(--clay-400)" }} />
          <p
            style={{
              color: "var(--clay-400)",
              fontSize: 14,
              margin: 0,
            }}
          >
            {error}
          </p>
          <button onClick={fetchDashboards} className="btn btn-secondary">
            <RefreshCw size={16} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ----- Main render -----
  return (
    <>
      {/* Dashboard-card-specific styles — hover border, actions reveal */}
      <style>{`
        .dash-card {
          position: relative;
          overflow: hidden;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          transition: transform 280ms cubic-bezier(0.2, 0, 0, 1),
                      box-shadow 280ms cubic-bezier(0.2, 0, 0, 1);
        }
        .dash-card::before {
          content: '';
          position: absolute;
          left: 0;
          top: 16px;
          bottom: 16px;
          width: 3px;
          background: var(--gold-400);
          border-radius: 0 3px 3px 0;
          transform: scaleY(0);
          transform-origin: top;
          transition: transform 280ms cubic-bezier(0.2, 0, 0, 1);
        }
        .dash-card:hover::before {
          transform: scaleY(1);
        }
        .dash-card:hover {
          transform: translateY(-3px);
        }

        /* Quick-actions — hidden, reveal on hover */
        .dash-actions {
          position: absolute;
          top: 14px;
          right: 14px;
          z-index: 2;
          display: flex;
          gap: 4px;
          opacity: 0;
          transform: translateY(-6px);
          transition: opacity 200ms cubic-bezier(0.2, 0, 0, 1),
                      transform 200ms cubic-bezier(0.2, 0, 0, 1);
        }
        .dash-card:hover .dash-actions {
          opacity: 1;
          transform: translateY(0);
        }

        .dash-action {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: var(--radius-sm);
          background: var(--bg-elevated);
          border: 1px solid var(--border-default);
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 160ms;
          text-decoration: none;
        }
        .dash-action:hover {
          color: var(--text-primary);
          border-color: var(--border-strong);
          background: var(--bg-surface);
          box-shadow: var(--shadow-card);
        }
        .dash-action--danger:hover {
          color: var(--clay-400);
          border-color: rgba(184, 92, 58, 0.25);
          background: rgba(184, 92, 58, 0.08);
        }

        /* Card overlay link — covers entire card for navigation */
        .dash-overlay {
          position: absolute;
          inset: 0;
          z-index: 1;
          text-decoration: none;
        }

        /* Masonry-style grid */
        .dash-grid {
          display: grid;
          grid-template-columns: 1fr;
          grid-auto-rows: minmax(140px, auto);
          gap: 16px;
        }
        @media (min-width: 640px) {
          .dash-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 20px;
          }
        }
        @media (min-width: 1024px) {
          .dash-grid {
            grid-template-columns: repeat(3, 1fr);
            gap: 24px;
          }
        }
        @media (min-width: 1280px) {
          .dash-grid {
            grid-template-columns: repeat(4, 1fr);
          }
        }

        /* Heavy card spans 2 rows */
        .dash-card--span2 {
          grid-row: span 2;
        }
      `}</style>

      <div
        className="page-enter"
        style={{
          maxWidth: "1280px",
          margin: "0 auto",
          padding: "36px 24px",
          display: "flex",
          flexDirection: "column",
          gap: "36px",
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "16px",
          }}
        >
          <div>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "34px",
                fontWeight: 400,
                color: "var(--gold-400)",
                lineHeight: 1.15,
                margin: 0,
                letterSpacing: "-0.01em",
              }}
            >
              Dashboards
            </h1>
            <p
              style={{
                color: "var(--text-secondary)",
                fontSize: "14px",
                marginTop: "6px",
              }}
            >
              {dashboards.length} dashboard{dashboards.length !== 1 ? "s" : ""}
              {dashboards.length > 0 && (
                <span style={{ color: "var(--text-muted)" }}>
                  {" "}
                  &middot; Terakhir diperbarui{" "}
                  {timeAgo(dashboards[0].updatedAt)}
                </span>
              )}
            </p>
          </div>
          <Link href="/dashboards/new" className="btn btn-primary">
            <Plus size={16} />
            Dashboard Baru
          </Link>
        </div>

        {/* ── Divider ── */}
        <hr className="divider" />

        {/* ── Empty State ── */}
        {dashboards.length === 0 ? (
          <div className="empty-state">
            <h3>Belum ada dashboard</h3>
            <p
              style={{
                color: "var(--text-muted)",
                fontSize: "14px",
                maxWidth: "360px",
                position: "relative",
                lineHeight: 1.6,
              }}
            >
              Mulai visualisasikan data Anda dengan grafik, KPI, dan tabel
              interaktif.
            </p>
            <Link
              href="/dashboards/new"
              className="btn btn-primary"
              style={{ position: "relative" }}
            >
              <Plus size={16} />
              Buat Dashboard Pertama
            </Link>
          </div>
        ) : (
          /* ── Dashboard Grid ── */
          <div className="dash-grid stagger">
            {dashboards.map((dashboard, i) => {
              const { className, span } = getCardWeight(i);
              return (
                <div
                  key={dashboard.id}
                  className={`dash-card ${className}${span === 2 ? " dash-card--span2" : ""}`}
                >
                  {/* Full-card navigation overlay */}
                  <Link
                    href={`/dashboards/${dashboard.id}`}
                    className="dash-overlay"
                    aria-label={dashboard.name}
                  />

                  {/* Quick actions — reveal on hover */}
                  <div className="dash-actions">
                    <Link
                      href={`/dashboards/new?edit=${dashboard.id}`}
                      className="dash-action"
                      data-tooltip="Edit"
                    >
                      <Pencil size={14} />
                    </Link>
                    <DeleteButton
                      dashboardId={dashboard.id}
                      dashboardName={dashboard.name}
                      onDeleted={handleDashboardDeleted}
                    />
                  </div>

                  {/* Title */}
                  <h3
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: span === 2 ? "20px" : "17px",
                      fontWeight: 400,
                      color: "var(--text-primary)",
                      lineHeight: 1.3,
                      margin: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      paddingRight: "64px",
                      position: "relative",
                      zIndex: 0,
                    }}
                  >
                    {dashboard.name}
                  </h3>

                  {/* Description */}
                  {dashboard.description ? (
                    <p
                      style={{
                        color: "var(--text-muted)",
                        fontSize: "13px",
                        lineHeight: 1.55,
                        margin: 0,
                        display: "-webkit-box",
                        WebkitLineClamp: span === 2 ? 3 : 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                        flex: 1,
                        position: "relative",
                        zIndex: 0,
                      }}
                    >
                      {dashboard.description}
                    </p>
                  ) : (
                    <p
                      style={{
                        color: "var(--text-muted)",
                        fontSize: "13px",
                        fontStyle: "italic",
                        margin: 0,
                        flex: 1,
                        opacity: 0.5,
                        position: "relative",
                        zIndex: 0,
                      }}
                    >
                      Tanpa deskripsi
                    </p>
                  )}

                  {/* Meta row — widgets + time */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingTop: "14px",
                      borderTop: "1px solid var(--border-subtle)",
                      fontSize: "12px",
                      color: "var(--text-muted)",
                      position: "relative",
                      zIndex: 0,
                    }}
                  >
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <BarChart3
                        size={14}
                        style={{ color: "var(--gold-dim)" }}
                      />
                      {dashboard.widgets.length} widget
                      {dashboard.widgets.length !== 1 ? "s" : ""}
                    </span>
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                      }}
                    >
                      <Clock size={13} style={{ opacity: 0.6 }} />
                      {timeAgo(dashboard.updatedAt)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
