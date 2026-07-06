"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Database,
  Layers,
  HardDrive,
  RefreshCw,
  ArrowRight,
  Trash2,
  Sparkles,
} from "lucide-react";
import { authFetch } from "@/lib/auth-client";
import LakehouseDeleteButton from "./delete-button";

// ── Types ──────────────────────────────────────────────────────────────────

type Layer = "silver" | "bronze" | "gold";

interface LakehouseTableSummary {
  id: number;
  tableName: string;
  displayName: string;
  description: string | null;
  rowsCount: number;
  sizeBytes: number;
  columnsCount: number;
  createdAt: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const LAYERS: { key: Layer; label: string }[] = [
  { key: "bronze",  label: "Bronze" },
  { key: "silver",  label: "Silver" },
  { key: "gold",    label: "Gold"   },
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0);
  return `${size} ${units[i]}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString("id-ID");
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function LakehousePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Layer>("bronze");
  const [tables, setTables] = useState<LakehouseTableSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [layerCounts, setLayerCounts] = useState<Record<Layer, number>>({
    bronze: 0,
    silver: 0,
    gold: 0,
  });

  const handleTableDeleted = useCallback((tableName: string) => {
    setTables((prev) => prev.filter((t) => t.tableName !== tableName));
    setLayerCounts((prev) => ({
      ...prev,
      [activeTab]: Math.max(0, prev[activeTab] - 1),
    }));
  }, [activeTab]);

  // ── Gold metric previews ──────────────────────────────────────────────────
  const [goldPreviews, setGoldPreviews] = useState<
    Record<string, Record<string, unknown> | null>
  >({});
  const [goldPreviewsLoading, setGoldPreviewsLoading] = useState(false);

  function formatColumnLabel(name: string): string {
    return name
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function formatKpiValue(value: unknown): string {
    if (value === null || value === undefined) return "—";
    if (typeof value === "bigint") return Number(value).toLocaleString();
    if (typeof value === "number") {
      if (Number.isInteger(value)) return value.toLocaleString();
      return value.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      });
    }
    if (typeof value === "string") return value;
    return String(value);
  }

  const fetchGoldPreview = useCallback(
    async (tableName: string) => {
      try {
        const res = await authFetch(`/api/lakehouse/gold/${tableName}`);
        if (!res.ok) return null;
        const data = await res.json();
        const rows = data.rows || [];
        return rows.length > 0 ? (rows[0] as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    },
    []
  );

  useEffect(() => {
    if (activeTab !== "gold" || tables.length === 0) {
      setGoldPreviews({});
      return;
    }
    let cancelled = false;
    setGoldPreviewsLoading(true);
    async function load() {
      const previews: Record<string, Record<string, unknown> | null> = {};
      for (const t of tables) {
        if (cancelled) return;
        previews[t.tableName] = await fetchGoldPreview(t.tableName);
      }
      if (!cancelled) {
        setGoldPreviews(previews);
        setGoldPreviewsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [activeTab, tables, fetchGoldPreview]);

  // ── Auth check ──────────────────────────────────────────────────────────
  useEffect(() => {
    authFetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => {
        if (!data.session) {
          router.push("/login");
        }
      })
      .catch(() => router.push("/login"));
  }, [router]);

  // ── Fetch layer counts on mount ─────────────────────────────────────────
  useEffect(() => {
    async function fetchCounts() {
      const counts: Record<Layer, number> = { bronze: 0, silver: 0, gold: 0 };
      for (const layer of LAYERS) {
        try {
          const res = await authFetch(`/api/lakehouse/${layer.key}`);
          if (res.ok) {
            const data = await res.json();
            counts[layer.key] = (data.tables || []).length;
          }
        } catch {
          /* ignore individual layer fetch failures */
        }
      }
      setLayerCounts(counts);
    }
    fetchCounts();
  }, []);

  // ── Fetch tables for active tab ─────────────────────────────────────────
  const fetchTables = useCallback(async (layer: Layer) => {
    setLoading(true);
    setError("");
    try {
      const res = await authFetch(`/api/lakehouse/${layer}`);
      if (!res.ok) throw new Error("Failed to load tables");
      const data = await res.json();
      setTables(data.tables || []);
      // update count for the active layer
      setLayerCounts((prev) => ({
        ...prev,
        [layer]: (data.tables || []).length,
      }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setTables([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTables(activeTab);
  }, [activeTab, fetchTables]);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        maxWidth: "72rem",
        margin: "0 auto",
        padding: "2rem 1.5rem 4rem",
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: "2rem",
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              marginBottom: "0.375rem",
            }}
          >
            <div
              style={{
                padding: "0.5rem",
                borderRadius: "var(--radius-md)",
                background: "var(--gold-dim)",
                border: "1px solid rgba(212,168,83,0.15)",
              }}
            >
              <Database
                style={{ width: "1.25rem", height: "1.25rem", color: "var(--gold-400)" }}
              />
            </div>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.75rem",
                fontStyle: "italic",
                color: "var(--gold-400)",
                fontWeight: 400,
                margin: 0,
              }}
            >
              Lakehouse Explorer
            </h1>
          </div>
          <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", margin: 0 }}>
            Browse your data across Bronze, Silver, and Gold layers
          </p>
        </div>
        <Link
          href="/dashboard"
          style={{
            fontSize: "0.875rem",
            color: "var(--text-secondary)",
            display: "flex",
            alignItems: "center",
            gap: "0.25rem",
            textDecoration: "none",
          }}
        >
          <ArrowRight style={{ width: "1rem", height: "1rem" }} />
          Dashboard
        </Link>
      </div>

      {/* ── Pill Tab Navigation ─────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          marginBottom: "2rem",
        }}
      >
        {LAYERS.map((layer) => {
          const isActive = activeTab === layer.key;
          return (
            <button
              key={layer.key}
              className="btn btn-ghost"
              onClick={() => setActiveTab(layer.key)}
              style={{
                position: "relative",
                padding: "0.5rem 1.25rem",
                borderBottom: isActive
                  ? "2px solid var(--gold-500)"
                  : "2px solid transparent",
                borderRadius: "2rem",
                fontWeight: isActive ? 500 : 400,
                color: isActive ? "var(--gold-400)" : "var(--text-secondary)",
              }}
            >
              <Layers style={{ width: "1rem", height: "1rem" }} />
              {layer.label}
              <span
                className="badge badge-draft"
                style={{ marginLeft: "0.375rem" }}
              >
                {layerCounts[layer.key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Refresh / Error ────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <button
          onClick={() => fetchTables(activeTab)}
          disabled={loading}
          className="btn btn-ghost"
          style={{
            fontSize: "0.8125rem",
            padding: "0.375rem 0.75rem",
            opacity: loading ? 0.5 : 1,
          }}
        >
          <RefreshCw
            style={{
              width: "0.875rem",
              height: "0.875rem",
              ...(loading ? { animation: "spin 1s linear infinite" } : {}),
            }}
          />
          Refresh
        </button>
        {error && (
          <p
            style={{
              fontSize: "0.8125rem",
              color: "var(--clay-400)",
              background: "var(--clay-dim)",
              border: "1px solid rgba(184,92,58,0.2)",
              borderRadius: "var(--radius-md)",
              padding: "0.25rem 0.75rem",
              margin: 0,
            }}
          >
            {error}
          </p>
        )}
      </div>

      {/* ── Loading State ──────────────────────────────────────────── */}
      {loading && (
        <div style={{ textAlign: "center", padding: "5rem 0" }}>
          <RefreshCw
            style={{
              width: "2rem",
              height: "2rem",
              color: "var(--text-muted)",
              animation: "spin 1s linear infinite",
              marginBottom: "0.75rem",
            }}
          />
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
            Loading {activeTab} tables…
          </p>
        </div>
      )}

      {/* ── Empty State ────────────────────────────────────────────── */}
      {!loading && tables.length === 0 && !error && activeTab !== "gold" && (
        <div className="empty-state">
          <Database
            style={{
              width: "2.5rem",
              height: "2.5rem",
              color: "var(--text-muted)",
              position: "relative",
              zIndex: 1,
            }}
          />
          <h3>No tables yet</h3>
          <p
            style={{
              fontSize: "0.875rem",
              color: "var(--text-muted)",
              maxWidth: "20rem",
              position: "relative",
              zIndex: 1,
            }}
          >
            Create a pipeline to populate the {activeTab} layer
          </p>
          <Link
            href="/pipelines/new"
            className="btn btn-primary"
            style={{ position: "relative", zIndex: 1, textDecoration: "none" }}
          >
            Create Pipeline
            <ArrowRight style={{ width: "0.875rem", height: "0.875rem" }} />
          </Link>
        </div>
      )}

      {/* ── Gold Empty State ───────────────────────────────────────── */}
      {!loading && tables.length === 0 && !error && activeTab === "gold" && (
        <div
          className="empty-state"
          style={{ borderColor: "rgba(212,168,83,0.15)" }}
        >
          <Sparkles
            style={{
              width: "2.5rem",
              height: "2.5rem",
              color: "var(--gold-400)",
              position: "relative",
              zIndex: 1,
            }}
          />
          <h3 style={{ color: "var(--gold-400)" }}>No Gold Metrics yet</h3>
          <p
            style={{
              fontSize: "0.875rem",
              color: "var(--text-muted)",
              maxWidth: "20rem",
              position: "relative",
              zIndex: 1,
            }}
          >
            Run an aggregation pipeline to create Gold-layer business metrics
          </p>
          <Link
            href="/pipelines/new"
            className="btn btn-primary"
            style={{ position: "relative", zIndex: 1, textDecoration: "none" }}
          >
            Create Pipeline
            <ArrowRight style={{ width: "0.875rem", height: "0.875rem" }} />
          </Link>
        </div>
      )}

      {/* ── Card Grid: Bronze & Silver ──────────────────────────────── */}
      {!loading && tables.length > 0 && activeTab !== "gold" && (
        <div
          className="stagger"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: "1rem",
          }}
        >
          {tables.map((table) => (
            <Link
              key={table.id}
              href={`/lakehouse/${activeTab}/${table.tableName}`}
              className="card pipeline-card"
              style={{
                display: "block",
                padding: "1.25rem",
                textDecoration: "none",
                cursor: "pointer",
                position: "relative",
              }}
            >
              <LakehouseDeleteButton
                layer={activeTab}
                tableName={table.tableName}
                displayName={table.displayName}
                onDeleted={handleTableDeleted}
              />
              {/* Table name */}
              <h3
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "1.0625rem",
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  margin: "0 0 0.75rem",
                  lineHeight: 1.4,
                }}
              >
                {table.displayName}
              </h3>

              {/* Metadata row */}
              <div
                style={{
                  display: "flex",
                  gap: "0.875rem",
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.3125rem",
                    fontSize: "0.8125rem",
                    color: "var(--text-muted)",
                  }}
                >
                  <Database
                    style={{ width: "0.8125rem", height: "0.8125rem", opacity: 0.6 }}
                  />
                  {formatNumber(table.rowsCount)}
                </span>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.3125rem",
                    fontSize: "0.8125rem",
                    color: "var(--text-muted)",
                  }}
                >
                  <Layers
                    style={{ width: "0.8125rem", height: "0.8125rem", opacity: 0.6 }}
                  />
                  {table.columnsCount}
                </span>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.3125rem",
                    fontSize: "0.8125rem",
                    color: "var(--text-muted)",
                  }}
                >
                  <HardDrive
                    style={{ width: "0.8125rem", height: "0.8125rem", opacity: 0.6 }}
                  />
                  {formatBytes(table.sizeBytes)}
                </span>
              </div>

              {/* Description (if present) */}
              {table.description && (
                <p
                  style={{
                    fontSize: "0.8125rem",
                    color: "var(--text-muted)",
                    margin: "0.625rem 0 0",
                    lineHeight: 1.5,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {table.description}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}

      {/* ── Card Grid: Gold Metrics ─────────────────────────────────── */}
      {!loading && tables.length > 0 && activeTab === "gold" && (
        <div
          className="stagger"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: "1rem",
          }}
        >
          {tables.map((table) => {
            const preview = goldPreviews[table.tableName];
            const kpis: { label: string; value: unknown }[] = preview
              ? Object.entries(preview)
                  .slice(0, 3)
                  .map(([k, v]) => ({ label: formatColumnLabel(k), value: v }))
              : [];

            const createdAt = new Date(table.createdAt).toLocaleDateString(
              "en-GB",
              { day: "numeric", month: "short", year: "numeric" }
            );

            return (
              <Link
                key={table.id}
                href={`/lakehouse/gold/${table.tableName}`}
                style={{
                  display: "block",
                  textDecoration: "none",
                  cursor: "pointer",
                  position: "relative",
                  background: "#1a1917",
                  border: "1px solid rgba(212,168,83,0.2)",
                  borderRadius: "var(--radius-lg, 0.75rem)",
                  padding: "1.25rem",
                  boxShadow: "0 0 40px rgba(212,168,83,0.04), 0 0 80px rgba(212,168,83,0.02)",
                  transition: "border-color 0.2s, box-shadow 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor =
                    "rgba(212,168,83,0.35)";
                  e.currentTarget.style.boxShadow =
                    "0 0 50px rgba(212,168,83,0.08), 0 0 100px rgba(212,168,83,0.04)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor =
                    "rgba(212,168,83,0.2)";
                  e.currentTarget.style.boxShadow =
                    "0 0 40px rgba(212,168,83,0.04), 0 0 80px rgba(212,168,83,0.02)";
                }}
              >
                <LakehouseDeleteButton
                  layer="gold"
                  tableName={table.tableName}
                  displayName={table.displayName}
                  onDeleted={handleTableDeleted}
                />

                {/* Header: Gold icon + table name */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    marginBottom: "0.75rem",
                  }}
                >
                  <span style={{ fontSize: "1.25rem" }}>🥇</span>
                  <h3
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "1.0625rem",
                      fontWeight: 500,
                      color: "var(--gold-400)",
                      margin: 0,
                      lineHeight: 1.4,
                    }}
                  >
                    {table.displayName}
                  </h3>
                </div>

                {/* KPI preview */}
                {goldPreviewsLoading && !preview && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      padding: "0.75rem 0",
                      color: "var(--text-muted)",
                      fontSize: "0.8125rem",
                    }}
                  >
                    <RefreshCw
                      style={{
                        width: "0.875rem",
                        height: "0.875rem",
                        animation: "spin 1s linear infinite",
                      }}
                    />
                    Loading metrics…
                  </div>
                )}

                {!goldPreviewsLoading && kpis.length > 0 && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: `repeat(${Math.min(kpis.length, 3)}, 1fr)`,
                      gap: "0.5rem",
                      marginBottom: "0.5rem",
                    }}
                  >
                    {kpis.map((kpi) => (
                      <div
                        key={kpi.label}
                        style={{
                          background: "rgba(212,168,83,0.08)",
                          border: "1px solid rgba(212,168,83,0.12)",
                          borderRadius: "var(--radius-md, 0.5rem)",
                          padding: "0.5rem 0.625rem",
                          textAlign: "center",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "1.125rem",
                            fontWeight: 700,
                            color: "var(--gold-400)",
                            lineHeight: 1.2,
                            fontFamily: "var(--font-display)",
                          }}
                        >
                          {formatKpiValue(kpi.value)}
                        </div>
                        <div
                          style={{
                            fontSize: "0.625rem",
                            color: "var(--text-muted)",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            marginTop: "0.125rem",
                          }}
                        >
                          {kpi.label}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!goldPreviewsLoading && kpis.length === 0 && (
                  <div
                    style={{
                      padding: "0.75rem 0",
                      color: "var(--text-muted)",
                      fontSize: "0.8125rem",
                      fontStyle: "italic",
                    }}
                  >
                    No data available
                  </div>
                )}

                {/* Created date */}
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-muted)",
                    marginTop: "0.5rem",
                    opacity: 0.7,
                  }}
                >
                  Created: {createdAt}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
