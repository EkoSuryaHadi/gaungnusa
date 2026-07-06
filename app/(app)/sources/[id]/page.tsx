"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Pencil, Trash2, FileSpreadsheet, Rows3, Columns3, Clock, HardDrive } from "lucide-react";
import DeleteSourceButton from "../delete-button";

interface DataSource {
  id: number;
  name: string;
  type: string;
  status: string;
  fileName: string | null;
  fileSize: number | null;
  rowsCount: number | null;
  columnsCount: number | null;
  lastSyncAt: string | null;
  createdAt: string;
}

interface PreviewData {
  columns: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
  error?: string;
}

export default function SourceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [source, setSource] = useState<DataSource | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/sources/${params.id}`);
        if (res.status === 401) { router.push("/login"); return; }
        if (!res.ok) throw new Error(`Source fetch failed: ${res.status}`);
        const data = await res.json();
        setSource(data);
        if (data.preview) {
          setPreview({ columns: data.preview.columns, rows: data.preview.rows, totalRows: data.rowsCount || 0 });
        } else {
          setPreview({ columns: [], rows: [], totalRows: 0, error: "No preview available" });
        }
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [params.id, router]);

  // ── Loading skeleton ──
  if (loading) return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "32px 24px" }}>
      {/* Header skeleton */}
      <div style={{ marginBottom: 32 }}>
        <div className="skeleton" style={{ width: 100, height: 12, marginBottom: 16 }} />
        <div className="skeleton" style={{ width: 340, height: 36, marginBottom: 8 }} />
        <div className="skeleton" style={{ width: 180, height: 12 }} />
      </div>
      {/* Stats skeleton */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card" style={{ padding: "20px 24px" }}>
            <div className="skeleton" style={{ width: 48, height: 10, marginBottom: 10 }} />
            <div className="skeleton" style={{ width: "60%", height: 24 }} />
          </div>
        ))}
      </div>
      {/* Table skeleton */}
      <div className="card" style={{ padding: 24 }}>
        <div className="skeleton" style={{ width: 140, height: 16, marginBottom: 16 }} />
        <div className="skeleton" style={{ width: "100%", height: 320, borderRadius: 6 }} />
      </div>
    </div>
  );

  // ── Error state ──
  if (error || !source) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 24px" }}>
      <div
        className="card"
        style={{
          maxWidth: 420,
          width: "100%",
          padding: "40px 32px",
          textAlign: "center",
          borderColor: "var(--clay-dim)",
          background: "var(--bg-surface)",
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 18,
            fontStyle: "italic",
            color: "var(--clay-400)",
            marginBottom: 8,
          }}
        >
          {error || "Source not found"}
        </p>
        <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 20 }}>
          The source you are looking for could not be loaded.
        </p>
        <Link href="/sources" className="btn btn-secondary">
          <ArrowLeft size={15} />
          Back to Sources
        </Link>
      </div>
    </div>
  );

  return (
    <div className="page-enter" style={{ maxWidth: 1400, margin: "0 auto", padding: "32px 24px" }}>
      {/* ═══ Header ═══ */}
      <div
        className="stagger"
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 32,
          flexWrap: "wrap",
          gap: 20,
        }}
      >
        <div>
          {/* Breadcrumb */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Link
              href="/sources"
              style={{
                fontSize: 13,
                color: "var(--text-muted)",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                transition: "color 180ms",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
            >
              <ArrowLeft size={14} />
              Sources
            </Link>
            <span style={{ color: "var(--border-strong)", fontSize: 13 }}>/</span>
            <span style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 400, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {source.name}
            </span>
          </div>

          {/* Source name */}
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 32,
              fontWeight: 400,
              fontStyle: "italic",
              color: "var(--gold-400)",
              margin: 0,
              lineHeight: 1.2,
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {source.name}
          </h1>

          {/* Subtitle */}
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 6, marginBottom: 0 }}>
            {source.fileName && <span>{source.fileName} · </span>}
            {source.type} · {source.status}
          </p>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link
            href={`/pipelines/new?sourceId=${source.id}&sourceName=${encodeURIComponent(source.name)}`}
            className="btn btn-primary"
          >
            <FileSpreadsheet size={15} />
            Create Pipeline
          </Link>
          <Link
            href={`/sources/${source.id}/edit`}
            className="btn btn-secondary"
          >
            <Pencil size={15} />
            Edit
          </Link>
          <DeleteSourceButton
            sourceId={source.id}
            sourceName={source.name}
            onDeleted={() => router.push("/sources")}
          />
        </div>
      </div>

      {/* ═══ Source Info Card ═══ */}
      <div
        className="card-raised"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 0,
          marginBottom: 24,
          overflow: "hidden",
        }}
      >
        {/* Type badge */}
        <div style={{ padding: "24px 28px", borderRight: "1px solid var(--border-subtle)" }}>
          <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 10 }}>
            Type
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <FileSpreadsheet size={18} style={{ color: "var(--gold-400)", flexShrink: 0 }} />
            <span style={{ fontSize: 16, fontWeight: 500, color: "var(--text-primary)" }}>
              {source.type}
            </span>
          </div>
        </div>

        {/* Row count */}
        <div style={{ padding: "24px 28px", borderRight: "1px solid var(--border-subtle)" }}>
          <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 10 }}>
            Rows
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Rows3 size={18} style={{ color: "var(--sage-400)", flexShrink: 0 }} />
            <span style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 400, fontStyle: "italic", color: "var(--text-primary)" }}>
              {source.rowsCount?.toLocaleString() ?? "—"}
            </span>
          </div>
        </div>

        {/* Column count */}
        <div style={{ padding: "24px 28px", borderRight: "1px solid var(--border-subtle)" }}>
          <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 10 }}>
            Columns
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Columns3 size={18} style={{ color: "var(--sage-400)", flexShrink: 0 }} />
            <span style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 400, fontStyle: "italic", color: "var(--text-primary)" }}>
              {source.columnsCount ?? "—"}
            </span>
          </div>
        </div>

        {/* Size + Created */}
        <div style={{ padding: "24px 28px" }}>
          <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 10 }}>
            Size
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <HardDrive size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
            <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>
              {formatBytes(source.fileSize)}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Clock size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              {new Date(source.createdAt).toLocaleDateString("id-ID")}
            </span>
          </div>
        </div>
      </div>

      {/* ═══ Data Preview ═══ */}
      <div className="card" style={{ padding: "24px 28px" }}>
        {/* Preview header */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 18,
              fontWeight: 400,
              fontStyle: "italic",
              color: "var(--text-primary)",
              margin: 0,
            }}
          >
            Data Preview
          </h2>
          {preview?.totalRows != null && (
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
              Showing first {Math.min(preview.rows.length, 100)} of {preview.totalRows.toLocaleString()} rows
            </p>
          )}
        </div>

        {/* Error */}
        {preview?.error ? (
          <div
            style={{
              padding: "20px 24px",
              borderRadius: "var(--radius-md)",
              background: "rgba(184, 92, 58, 0.08)",
              border: "1px solid var(--clay-dim)",
              color: "var(--clay-400)",
              fontSize: 13,
            }}
          >
            {preview.error}
          </div>
        ) : preview && preview.columns.length > 0 ? (
          <div
            style={{
              overflow: "auto",
              maxHeight: 600,
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ position: "sticky", top: 0, zIndex: 10 }}>
                  <th
                    style={{
                      padding: "8px 12px",
                      background: "var(--bg-root)",
                      color: "var(--text-muted)",
                      fontWeight: 500,
                      fontSize: 10,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      textAlign: "left",
                      borderBottom: "1px solid var(--border-default)",
                      borderRight: "1px solid var(--border-subtle)",
                      width: 48,
                    }}
                  >
                    #
                  </th>
                  {preview.columns.map((col) => (
                    <th
                      key={col}
                      style={{
                        padding: "8px 12px",
                        background: "var(--bg-root)",
                        color: "var(--text-muted)",
                        fontWeight: 500,
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        textAlign: "left",
                        borderBottom: "1px solid var(--border-default)",
                        borderRight: "1px solid var(--border-subtle)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, i) => (
                  <tr
                    key={i}
                    style={{
                      background: i % 2 === 0 ? "var(--bg-surface)" : "var(--bg-root)",
                      transition: "background 120ms",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-elevated)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 0 ? "var(--bg-surface)" : "var(--bg-root)")}
                  >
                    <td
                      style={{
                        padding: "6px 12px",
                        color: "var(--text-muted)",
                        borderBottom: "1px solid var(--border-subtle)",
                        borderRight: "1px solid var(--border-subtle)",
                        fontSize: 11,
                      }}
                    >
                      {i + 1}
                    </td>
                    {preview.columns.map((col) => {
                      const val = row[col];
                      return (
                        <td
                          key={col}
                          style={{
                            padding: "6px 12px",
                            color: val == null ? "var(--text-muted)" : "var(--text-primary)",
                            fontStyle: val == null ? "italic" : undefined,
                            borderBottom: "1px solid var(--border-subtle)",
                            borderRight: "1px solid var(--border-subtle)",
                            maxWidth: 250,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {val == null ? "null" : String(val)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ fontSize: 13, color: "var(--text-muted)", fontStyle: "italic" }}>
            No preview data available for this source.
          </p>
        )}
      </div>
    </div>
  );

}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
