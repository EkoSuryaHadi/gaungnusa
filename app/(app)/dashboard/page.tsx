"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Database, GitBranch, BarChart3, Layers, Zap, ArrowRight } from "lucide-react";
import { authFetch } from "@/lib/auth-client";

interface DashboardData {
  session?: {
    id: number;
    name: string;
    role: string;
  };
  counts?: { bronze: number; silver: number; gold: number };
  recentPipelines?: Array<{ id: number; name: string; status: string; updatedAt: string }>;
  recentSources?: Array<{ id: number; name: string; type: string; createdAt: string }>;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authFetch("/api/dashboard")
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ maxWidth: "72rem", margin: "0 auto", padding: "32px 24px" }}>
        <div className="skeleton" style={{ width: 200, height: 32, marginBottom: 8 }} />
        <div className="skeleton" style={{ width: 160, height: 16 }} />
      </div>
    );
  }

  if (!data?.session) {
    return (
      <div style={{ maxWidth: "72rem", margin: "0 auto", padding: "32px 24px", color: "var(--text-muted)" }}>
        Loading...
      </div>
    );
  }

  const { session, counts, recentPipelines = [], recentSources = [] } = data;

  return (
    <>
      <style>{`
        .pipeline-item {
          border-left: 3px solid transparent;
          transition: border-color 200ms;
        }
        .pipeline-item:hover {
          border-left-color: var(--gold-400);
          border-color: var(--border-default);
          border-left-color: var(--gold-400);
        }
        .source-item {
          border-right: 3px solid transparent;
          transition: border-color 200ms;
        }
        .source-item:hover {
          border-right-color: var(--gold-400);
          border-color: var(--border-default);
          border-right-color: var(--gold-400);
        }
      `}</style>
      <div
        className="max-w-6xl mx-auto px-6 py-8 stagger"
        style={{ display: "flex", flexDirection: "column", gap: "40px" }}
      >
      {/* ── Hero Section ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              color: "var(--gold-400)",
              fontSize: "clamp(32px, 5vw, 52px)",
              fontWeight: 400,
              lineHeight: 1.1,
              letterSpacing: "-0.01em",
            }}
          >
            Dashboard
          </h1>
          <p
            style={{
              fontFamily: "var(--font-body)",
              color: "var(--text-secondary)",
              fontSize: "15px",
              marginTop: "6px",
              fontWeight: 300,
            }}
          >
            Welcome back, {session.name}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <span className="badge" style={{ background: "var(--gold-dim)", color: "var(--gold-400)", border: "1px solid var(--gold-glow)" }}>
            {session.role}
          </span>
          <Link
            href="/api/auth/logout"
            style={{ color: "var(--text-muted)", fontSize: "13px", fontWeight: 400, textDecoration: "none" }}
            className="link-echo"
          >
            Logout
          </Link>
        </div>
      </div>

      {/* ── Feature Cards — Asymmetric Row ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "20px",
          alignItems: "start",
        }}
      >
        <Link
          href="/sources"
          className="card echo-ring"
          style={{
            padding: "32px 28px",
            minHeight: "210px",
            textDecoration: "none",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
          }}
        >
          <div style={{ width: "44px", height: "44px", borderRadius: "var(--radius-md)", background: "var(--gold-dim)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Database size={22} style={{ color: "var(--gold-400)" }} />
          </div>
          <h3 style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)", fontSize: "22px", fontWeight: 400, marginTop: "18px", letterSpacing: "-0.01em" }}>Data Sources</h3>
          <p style={{ color: "var(--text-muted)", fontSize: "13px", marginTop: "6px", fontWeight: 300 }}>Upload & manage data</p>
        </Link>

        <Link
          href="/pipelines"
          className="card"
          style={{
            padding: "24px",
            minHeight: "180px",
            marginTop: "8px",
            textDecoration: "none",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
          }}
        >
          <div style={{ width: "40px", height: "40px", borderRadius: "var(--radius-md)", background: "var(--gold-dim)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <GitBranch size={20} style={{ color: "var(--gold-400)" }} />
          </div>
          <h3 style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)", fontSize: "20px", fontWeight: 400, marginTop: "14px", letterSpacing: "-0.01em" }}>ETL Pipelines</h3>
          <p style={{ color: "var(--text-muted)", fontSize: "13px", marginTop: "5px", fontWeight: 300 }}>Build transform pipelines</p>
        </Link>

        <Link
          href="/dashboards"
          className="card-glow"
          style={{
            padding: "28px 24px",
            minHeight: "195px",
            marginTop: "4px",
            textDecoration: "none",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
          }}
        >
          <div style={{ width: "42px", height: "42px", borderRadius: "var(--radius-md)", background: "var(--gold-dim)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <BarChart3 size={21} style={{ color: "var(--gold-400)" }} />
          </div>
          <h3 style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)", fontSize: "21px", fontWeight: 400, marginTop: "16px", letterSpacing: "-0.01em" }}>Dashboards</h3>
          <p style={{ color: "var(--text-muted)", fontSize: "13px", marginTop: "5px", fontWeight: 300 }}>Visualize your data</p>
        </Link>
      </div>

      {/* ── Lakehouse Status ── */}
      <div className="card-glow echo-ring" style={{ padding: "28px 28px 24px", display: "flex", flexDirection: "column", gap: "20px" }}>
        <div className="flex items-center justify-between">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Layers size={18} style={{ color: "var(--gold-400)" }} />
            <h2 style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)", fontSize: "20px", fontWeight: 400, letterSpacing: "-0.01em" }}>Lakehouse Status</h2>
          </div>
          <Link href="/lakehouse" className="link-echo" style={{ fontSize: "13px", display: "flex", alignItems: "center", gap: "4px" }}>
            Explore <ArrowRight size={13} style={{ color: "var(--gold-400)" }} />
          </Link>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
          {[
            { label: "Bronze", count: counts?.bronze ?? 0, color: "var(--clay-400)", dim: "var(--clay-dim)", border: "rgba(184, 92, 58, 0.2)", desc: "Raw ingested data" },
            { label: "Silver", count: counts?.silver ?? 0, color: "var(--text-secondary)", dim: "rgba(168, 154, 132, 0.08)", border: "var(--border-default)", desc: "Cleaned & validated" },
            { label: "Gold", count: counts?.gold ?? 0, color: "var(--gold-400)", dim: "var(--gold-dim)", border: "var(--gold-glow)", desc: "Aggregated views" },
          ].map((tier) => (
            <div key={tier.label} style={{ padding: "16px 18px", borderRadius: "var(--radius-md)", background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "var(--font-body)", color: tier.color, fontSize: "13px", fontWeight: 500 }}>{tier.label}</span>
                <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 500, letterSpacing: "0.03em", background: tier.dim, color: tier.color, border: `1px solid ${tier.border}` }}>
                  {tier.count}
                </span>
              </div>
              <p style={{ color: "var(--text-muted)", fontSize: "11px", fontWeight: 300 }}>{tier.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Zap size={18} style={{ color: "var(--gold-400)" }} />
          <h2 style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)", fontSize: "20px", fontWeight: 400, letterSpacing: "-0.01em" }}>Quick Actions</h2>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
          <Link href="/pipelines/new" className="btn btn-secondary" style={{ padding: "10px 22px", fontSize: "14px", fontWeight: 500 }}>
            <GitBranch size={15} style={{ color: "var(--gold-400)" }} /> Create Pipeline
          </Link>
          <Link href="/sources/new" className="btn btn-secondary" style={{ padding: "10px 22px", fontSize: "14px", fontWeight: 500 }}>
            <Database size={15} style={{ color: "var(--gold-400)" }} /> Upload Source
          </Link>
          <Link href="/lakehouse" className="btn btn-secondary" style={{ padding: "10px 22px", fontSize: "14px", fontWeight: 500 }}>
            <Layers size={15} style={{ color: "var(--gold-400)" }} /> Browse Lakehouse
          </Link>
        </div>
      </div>

      {/* ── Recent Activity ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
        {/* Recent Pipelines */}
        <div className="card" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className="flex items-center justify-between">
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <GitBranch size={16} style={{ color: "var(--gold-400)" }} />
              <h3 style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)", fontSize: "17px", fontWeight: 400, letterSpacing: "-0.01em" }}>Recent Pipelines</h3>
            </div>
            <Link href="/pipelines" className="link-echo" style={{ fontSize: "12px" }}>View all</Link>
          </div>
          {recentPipelines.length === 0 ? (
            <div style={{ padding: "24px 0", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
              No pipelines yet. <Link href="/pipelines/new" className="link-echo" style={{ marginLeft: "4px" }}>Create one</Link>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {recentPipelines.map((p) => (
                <Link key={p.id} href={`/pipelines/${p.id}`} className="pipeline-item" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: "var(--radius-md)", background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", textDecoration: "none" }}>
                  <span style={{ color: "var(--text-primary)", fontSize: "13px", fontWeight: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{p.name}</span>
                  <span className={p.status === "ACTIVE" ? "badge badge-active" : "badge badge-draft"}>{p.status}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recent Sources */}
        <div className="card" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className="flex items-center justify-between">
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Database size={16} style={{ color: "var(--gold-400)" }} />
              <h3 style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)", fontSize: "17px", fontWeight: 400, letterSpacing: "-0.01em" }}>Recent Sources</h3>
            </div>
            <Link href="/sources" className="link-echo" style={{ fontSize: "12px" }}>View all</Link>
          </div>
          {recentSources.length === 0 ? (
            <div style={{ padding: "24px 0", textAlign: "right", color: "var(--text-muted)", fontSize: "13px" }}>
              No sources yet. <Link href="/sources/new" className="link-echo" style={{ marginLeft: "4px" }}>Upload one</Link>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {recentSources.map((s) => (
                <Link key={s.id} href={`/sources/${s.id}`} className="source-item" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: "var(--radius-md)", background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", textDecoration: "none", textAlign: "right", flexDirection: "row-reverse" }}>
                  <span style={{ color: "var(--text-primary)", fontSize: "13px", fontWeight: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{s.name}</span>
                  <span style={{ fontSize: "10px", color: "var(--text-muted)", fontWeight: 400, textTransform: "uppercase", letterSpacing: "0.04em", marginRight: "10px" }}>{s.type}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
