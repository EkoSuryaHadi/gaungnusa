"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Upload,
  RefreshCw,
  AlertCircle,
  Rows3,
  Clock,
  Eye,
  Zap,
  Database,
  Sparkles,
  Cpu,
  ShoppingCart,
  DollarSign,
  Package,
  Users,
  Globe,
} from "lucide-react";
import DeleteSourceButton from "./delete-button";
import { authFetch, clearAuth } from "@/lib/auth-client";
import ProcessWizard from "../components/ProcessWizard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DataSource {
  id: number;
  name: string;
  type: string; // CSV | EXCEL | JSON | API | DATABASE
  status: string;
  fileName: string | null;
  fileSize: number | null;
  rowsCount: number | null;
  columnsCount: number | null;
  domain: string | null;         // iot | sales | finance | erp | hr | general
  domainConfidence: number | null; // 0.0-1.0
  lastSyncAt: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TYPE_LABEL: Record<string, string> = {
  CSV: "CSV",
  EXCEL: "Excel",
  JSON: "JSON",
  API: "API",
  DATABASE: "Database",
};

const DOMAIN_LABEL: Record<string, string> = {
  iot: "IoT / Sensor",
  sales: "Sales / POS",
  finance: "Finance",
  erp: "ERP / Inventory",
  hr: "HR / Payroll",
  general: "General",
};

const DOMAIN_ICON: Record<string, React.ReactNode> = {
  iot: <Cpu size={13} />,
  sales: <ShoppingCart size={13} />,
  finance: <DollarSign size={13} />,
  erp: <Package size={13} />,
  hr: <Users size={13} />,
  general: <Globe size={13} />,
};

const DOMAIN_COLOR: Record<string, { bg: string; fg: string }> = {
  iot: { bg: "rgba(59,130,246,0.15)", fg: "#60a5fa" },
  sales: { bg: "rgba(34,197,94,0.15)", fg: "#4ade80" },
  finance: { bg: "rgba(250,204,21,0.15)", fg: "#facc15" },
  erp: { bg: "rgba(168,85,247,0.15)", fg: "#c084fc" },
  hr: { bg: "rgba(236,72,153,0.15)", fg: "#f472b6" },
  general: { bg: "rgba(148,163,184,0.15)", fg: "#94a3b8" },
};

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "\u2014";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SourcesPage() {
  const router = useRouter();
  const [sources, setSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [processSource, setProcessSource] = useState<{ id: number; name: string } | null>(null);

  const handleSourceDeleted = useCallback((id: number) => {
    setSources((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const fetchSources = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await authFetch("/api/sources");
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) throw new Error(`Failed to fetch sources (${res.status})`);
      const data = await res.json();
      setSources(data.sources ?? data ?? []);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  // ----- Loading skeleton -----
  if (loading) {
    return (
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px" }}>
        {/* Header skeleton */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 32,
          }}
        >
          <div>
            <div
              className="skeleton"
              style={{ width: 200, height: 28, marginBottom: 8 }}
            />
            <div className="skeleton" style={{ width: 160, height: 16 }} />
          </div>
          <div
            className="skeleton"
            style={{ width: 140, height: 40, borderRadius: "var(--radius-md)" }}
          />
        </div>
        {/* Card skeletons */}
        <div
          className="stagger"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 16,
          }}
        >
          {[1, 2, 3].map((i) => (
            <div key={i} className="card" style={{ padding: 20 }}>
              <div
                className="skeleton"
                style={{ width: "60%", height: 18, marginBottom: 12 }}
              />
              <div
                className="skeleton"
                style={{
                  width: 80,
                  height: 22,
                  borderRadius: 20,
                  marginBottom: 16,
                }}
              />
              <div style={{ display: "flex", gap: 16 }}>
                <div className="skeleton" style={{ flex: 1, height: 14 }} />
                <div className="skeleton" style={{ flex: 1, height: 14 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ----- Error state -----
  if (error) {
    return (
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 32,
          }}
        >
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 28,
              fontWeight: 400,
              fontStyle: "italic",
              color: "var(--gold-400)",
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            Data Sources
          </h1>
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
              fontFamily: "var(--font-body)",
              fontSize: 14,
              fontWeight: 300,
              margin: 0,
            }}
          >
            {error}
          </p>
          <button onClick={fetchSources} className="btn btn-secondary">
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
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 32,
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 28,
              fontWeight: 400,
              fontStyle: "italic",
              color: "var(--gold-400)",
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            Data Sources
          </h1>
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 14,
              color: "var(--text-muted)",
              marginTop: 4,
              fontWeight: 300,
            }}
          >
            {sources.length} source{sources.length !== 1 ? "s" : ""} connected
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={fetchSources}
            className="btn btn-ghost"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
          <Link href="/sources/new/database" className="btn btn-secondary">
            <Database size={16} />
            Connect DB
          </Link>
          <Link href="/sources/new" className="btn btn-primary">
            <Upload size={16} />
            Upload New
          </Link>
        </div>
      </div>

      {/* Empty state */}
      {sources.length === 0 && (
        <div className="empty-state">
          <h3>Belum ada data source</h3>
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 14,
              color: "var(--text-muted)",
              fontWeight: 300,
              maxWidth: 360,
              position: "relative",
              margin: 0,
            }}
          >
            Upload CSV atau connect API
          </p>
          <Link
            href="/sources/new/database"
            className="btn btn-secondary"
            style={{ position: "relative" }}
          >
            <Database size={16} />
            Connect Database
          </Link>
          <Link
            href="/sources/new"
            className="btn btn-primary"
            style={{ position: "relative" }}
          >
            <Upload size={16} />
            Upload Source
          </Link>
        </div>
      )}

      {/* Source Cards Grid */}
      {sources.length > 0 && (
        <div
          className="stagger"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 16,
          }}
        >
          {sources.map((src) => (
            <div
              key={src.id}
              className="card pipeline-card source-card"
              style={{
                padding: 20,
                display: "flex",
                flexDirection: "column",
                gap: 14,
                position: "relative",
              }}
            >
              {/* Source name + type badge */}
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <h3
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 16,
                    fontWeight: 500,
                    color: "var(--text-primary)",
                    margin: 0,
                    lineHeight: 1.3,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {src.name}
                </h3>
                <span
                  className="badge badge-draft"
                  style={{ flexShrink: 0 }}
                >
                  {TYPE_LABEL[src.type] ?? src.type}
                </span>
              </div>

              {/* Domain badge (auto-classified) */}
              {src.domain && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "3px 10px",
                      borderRadius: "var(--radius-sm)",
                      fontSize: 12,
                      fontWeight: 400,
                      fontFamily: "var(--font-body)",
                      background: DOMAIN_COLOR[src.domain]?.bg ?? DOMAIN_COLOR.general.bg,
                      color: DOMAIN_COLOR[src.domain]?.fg ?? DOMAIN_COLOR.general.fg,
                    }}
                  >
                    {DOMAIN_ICON[src.domain] ?? DOMAIN_ICON.general}
                    {DOMAIN_LABEL[src.domain] ?? DOMAIN_LABEL.general}
                    {src.domainConfidence != null && (
                      <span style={{ opacity: 0.7, fontSize: 10 }}>
                        {Math.round(src.domainConfidence * 100)}%
                      </span>
                    )}
                  </span>
                </div>
              )}

              {/* Meta: row count + created time */}
              <div
                style={{
                  display: "flex",
                  gap: 20,
                  fontSize: 13,
                  fontFamily: "var(--font-body)",
                  fontWeight: 300,
                }}
              >
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    color: "var(--text-muted)",
                  }}
                >
                  <Rows3 size={14} />
                  {src.rowsCount != null
                    ? src.rowsCount.toLocaleString()
                    : "\u2014"}
                </span>
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    color: "var(--text-muted)",
                  }}
                >
                  <Clock size={14} />
                  {formatDate(src.createdAt)}
                </span>
              </div>

              {/* Action buttons — always visible */}
              <div
                className="source-card-actions"
                style={{
                  display: "flex",
                  gap: 8,
                  paddingTop: 10,
                  borderTop: "1px solid var(--border-subtle)",
                }}
              >
                <button
                  onClick={() => setProcessSource({ id: src.id, name: src.name })}
                  className="btn btn-primary"
                  style={{ padding: "6px 8px", fontSize: 12, gap: 4, flex: 1, justifyContent: "center" }}
                  title="Proses otomatis ke Silver"
                >
                  <Sparkles size={14} />
                  Proses Cepat
                </button>
                <Link
                  href={`/sources/${src.id}`}
                  className="btn btn-ghost"
                  style={{ padding: "6px 10px", fontSize: 12, gap: 5, flex: 1, justifyContent: "center" }}
                  title="View details"
                >
                  <Eye size={14} />
                  View
                </Link>
                <Link
                  href={`/pipelines/new?sourceId=${src.id}&sourceName=${encodeURIComponent(src.name)}`}
                  className="btn btn-ghost"
                  style={{ padding: "6px 12px", fontSize: 12, gap: 5, flex: 1, justifyContent: "center" }}
                  title="Create pipeline from this source"
                >
                  <Zap size={14} />
                  Pipeline
                </Link>
                <DeleteSourceButton
                  sourceId={src.id}
                  sourceName={src.name}
                  onDeleted={handleSourceDeleted}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
    {/* ── Quick Process Wizard Modal ───────────────────────────── */}
    {processSource && (
      <ProcessWizard
        sourceId={processSource.id}
        sourceName={processSource.name}
        onClose={() => setProcessSource(null)}
      />
    )}
    </>
  );
}
