"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Database,
  Layers,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  ArrowRight,
  Table2,
  Rows3,
  Columns3,
  HardDrive,
  BarChart3,
} from "lucide-react";

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

interface TablePreview {
  columns: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
}

interface ColumnDef {
  name: string;
  type: string;
}

interface TableSchema {
  tableName: string;
  displayName: string;
  description: string | null;
  layer: string;
  columns: ColumnDef[];
  rowsCount: number;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const LAYERS: { key: Layer; label: string; color: string; desc: string }[] = [
  {
    key: "bronze",
    label: "Bronze",
    color: "amber",
    desc: "Raw / Ingested",
  },
  {
    key: "silver",
    label: "Silver",
    color: "slate",
    desc: "Cleaned & Validated",
  },
  {
    key: "gold",
    label: "Gold",
    color: "emerald",
    desc: "Aggregated & KPIs",
  },
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
  const [expandedTable, setExpandedTable] = useState<string | null>(null);
  // expanded state
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<TablePreview | null>(null);
  const [schemaData, setSchemaData] = useState<ColumnDef[] | null>(null);

  // ── Auth check ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => {
        if (!data.session) {
          router.push("/login");
        }
      })
      .catch(() => router.push("/login"));
  }, [router]);

  // ── Fetch tables for active tab ─────────────────────────────────────────
  const fetchTables = useCallback(async (layer: Layer) => {
    setLoading(true);
    setError("");
    setExpandedTable(null);
    setPreviewData(null);
    setSchemaData(null);
    try {
      const res = await fetch(`/api/lakehouse/${layer}`);
      if (!res.ok) throw new Error("Failed to load tables");
      const data = await res.json();
      setTables(data.tables || []);
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

  // ── Toggle expand ───────────────────────────────────────────────────────
  async function handleToggleTable(tableName: string) {
    if (expandedTable === tableName) {
      setExpandedTable(null);
      setPreviewData(null);
      setSchemaData(null);
      return;
    }
    setExpandedTable(tableName);
    setPreviewLoading(true);
    setPreviewData(null);
    setSchemaData(null);

    try {
      const [previewRes, schemaRes] = await Promise.all([
        fetch(`/api/lakehouse/${activeTab}/${tableName}`),
        fetch(`/api/lakehouse/${activeTab}/${tableName}/schema`),
      ]);

      if (previewRes.ok) {
        const preview = await previewRes.json();
        setPreviewData(preview);
      }
      if (schemaRes.ok) {
        const schema = await schemaRes.json();
        setSchemaData(schema.columns || []);
      }
    } catch {
      // ignore
    } finally {
      setPreviewLoading(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <Database className="w-5 h-5 text-emerald-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">Lakehouse Explorer</h1>
          </div>
          <p className="text-sm text-slate-400">
            Browse your data across Silver, Bronze, and Gold layers
          </p>
        </div>
        <Link
          href="/dashboard"
          className="text-sm text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
        >
          <ArrowRight className="w-4 h-4" /> Dashboard
        </Link>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-slate-800">
        {LAYERS.map((layer) => (
          <button
            key={layer.key}
            onClick={() => setActiveTab(layer.key)}
            className={`px-6 py-3 text-sm font-medium transition-all flex items-center gap-2 border-b-2 ${
              activeTab === layer.key
                ? "border-emerald-500 text-white"
                : "border-transparent text-slate-500 hover:text-slate-300"
            }`}
          >
            <Layers className="w-4 h-4" />
            {layer.label}
            <span className="text-xs opacity-60 hidden sm:inline">
              {layer.desc}
            </span>
          </button>
        ))}
      </div>

      {/* Refresh / Error */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => fetchTables(activeTab)}
          disabled={loading}
          className="text-sm text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
        {error && (
          <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1">
            {error}
          </p>
        )}
      </div>

      {/* Tables List */}
      {loading ? (
        <div className="text-center py-20">
          <RefreshCw className="w-8 h-8 text-slate-500 animate-spin mx-auto mb-3" />
          <p className="text-slate-500">Loading {activeTab} tables...</p>
        </div>
      ) : tables.length === 0 ? (
        <div className="text-center py-20">
          <Table2 className="w-12 h-12 text-slate-700 mx-auto mb-4" />
          <p className="text-slate-500 text-lg font-medium">No tables yet</p>
          <p className="text-slate-600 text-sm mt-1">
            Create a pipeline to populate the {activeTab} layer
          </p>
          <Link
            href="/pipelines/new"
            className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium hover:bg-emerald-500/20 transition-all"
          >
            Create Pipeline <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {tables.map((table) => (
            <div
              key={table.id}
              className="rounded-xl bg-slate-950 border border-slate-800 overflow-hidden transition-all"
            >
              {/* Table Card Header */}
              <button
                onClick={() => handleToggleTable(table.tableName)}
                className="w-full text-left p-4 flex items-center justify-between hover:bg-slate-900/50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`p-2 rounded-lg shrink-0 ${
                      activeTab === "gold"
                        ? "bg-emerald-500/10 border border-emerald-500/20"
                        : activeTab === "bronze"
                        ? "bg-amber-500/10 border border-amber-500/20"
                        : "bg-slate-500/10 border border-slate-500/20"
                    }`}
                  >
                    <Table2
                      className={`w-4 h-4 ${
                        activeTab === "gold"
                          ? "text-emerald-400"
                          : activeTab === "bronze"
                          ? "text-amber-400"
                          : "text-slate-400"
                      }`}
                    />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-white truncate">
                      {table.displayName}
                    </h3>
                    {table.description && (
                      <p className="text-xs text-slate-500 truncate">
                        {table.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4 sm:gap-6 shrink-0">
                  <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400">
                    <Rows3 className="w-3.5 h-3.5" />
                    {formatNumber(table.rowsCount)}
                  </div>
                  <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400">
                    <Columns3 className="w-3.5 h-3.5" />
                    {table.columnsCount}
                  </div>
                  <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-400">
                    <HardDrive className="w-3.5 h-3.5" />
                    {formatBytes(table.sizeBytes)}
                  </div>
                  {expandedTable === table.tableName ? (
                    <ChevronDown className="w-4 h-4 text-slate-500" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-500" />
                  )}
                </div>
              </button>

              {/* Mobile metadata row */}
              <div className="sm:hidden flex items-center gap-4 px-4 pb-3 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <Rows3 className="w-3 h-3" />
                  {formatNumber(table.rowsCount)}
                </span>
                <span className="flex items-center gap-1">
                  <Columns3 className="w-3 h-3" />
                  {table.columnsCount}
                </span>
                <span className="flex items-center gap-1">
                  <HardDrive className="w-3 h-3" />
                  {formatBytes(table.sizeBytes)}
                </span>
              </div>

              {/* Expanded Content */}
              {expandedTable === table.tableName && (
                <div className="border-t border-slate-800 p-4 space-y-5 bg-slate-900/30">
                  {previewLoading ? (
                    <div className="text-center py-6">
                      <RefreshCw className="w-5 h-5 text-slate-500 animate-spin mx-auto" />
                    </div>
                  ) : (
                    <>
                      {/* Data Preview */}
                      <div>
                        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                          Data Preview
                          {previewData && (
                            <span className="ml-2 font-normal normal-case text-slate-600">
                              (showing {previewData.rows.length} of{" "}
                              {formatNumber(previewData.totalRows)} rows)
                            </span>
                          )}
                        </h4>
                        {previewData &&
                        previewData.columns.length > 0 &&
                        previewData.rows.length > 0 ? (
                          <div className="overflow-x-auto rounded-lg border border-slate-800">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-slate-950/80">
                                  {previewData.columns.map((col) => (
                                    <th
                                      key={col}
                                      className="text-left px-3 py-2 font-medium text-slate-400 whitespace-nowrap border-r border-slate-800 last:border-r-0"
                                    >
                                      {col}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {previewData.rows.map(
                                  (row: Record<string, unknown>, i: number) => (
                                    <tr
                                      key={i}
                                      className="border-t border-slate-800 hover:bg-slate-800/30"
                                    >
                                      {previewData.columns.map((col) => (
                                        <td
                                          key={col}
                                          className="px-3 py-1.5 text-slate-300 whitespace-nowrap border-r border-slate-800 last:border-r-0 max-w-[250px] truncate"
                                        >
                                          {row[col] === null
                                            ? "—"
                                            : String(row[col])}
                                        </td>
                                      ))}
                                    </tr>
                                  )
                                )}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="text-sm text-slate-600 bg-slate-950 rounded-lg p-4 border border-slate-800">
                            No data available yet. Run a pipeline to populate
                            this table.
                          </p>
                        )}
                      </div>

                      {/* Schema & Actions */}
                      <div className="grid gap-5 md:grid-cols-2">
                        {/* Schema */}
                        <div>
                          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                            Schema
                          </h4>
                          {schemaData && schemaData.length > 0 ? (
                            <div className="rounded-lg border border-slate-800 overflow-hidden">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-slate-950/80">
                                    <th className="text-left px-3 py-2 font-medium text-slate-400">
                                      Column
                                    </th>
                                    <th className="text-left px-3 py-2 font-medium text-slate-400">
                                      Type
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {schemaData.map((col, i) => (
                                    <tr
                                      key={i}
                                      className="border-t border-slate-800"
                                    >
                                      <td className="px-3 py-1.5 text-slate-300 font-mono text-xs">
                                        {col.name}
                                      </td>
                                      <td className="px-3 py-1.5 text-slate-500 font-mono text-xs">
                                        {col.type}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p className="text-sm text-slate-600 bg-slate-950 rounded-lg p-4 border border-slate-800">
                              No schema defined.
                            </p>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="space-y-3">
                          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                            Actions
                          </h4>
                          <Link
                            href={`/lakehouse/${activeTab}/${table.tableName}`}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800/50 border border-slate-700 text-slate-300 text-sm font-medium hover:bg-slate-700/50 hover:text-white transition-all"
                          >
                            <Table2 className="w-4 h-4" />
                            Open Full Table View
                          </Link>
                          {/* Context-aware flow button */}
                          {activeTab === "bronze" && (
                            <Link
                              href={`/pipelines/new?sourceTable=${table.tableName}&sourceLayer=BRONZE&targetLayer=SILVER`}
                              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-slate-400 text-slate-950 font-bold text-sm hover:brightness-110 shadow-lg shadow-amber-500/20 transition-all"
                            >
                              <Layers className="w-4 h-4" />
                              ⬆️ Process to Silver
                            </Link>
                          )}
                          {activeTab === "silver" && (
                            <Link
                              href={`/pipelines/new?sourceTable=${table.tableName}&sourceLayer=SILVER&targetLayer=GOLD`}
                              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-slate-400 to-emerald-500 text-slate-950 font-bold text-sm hover:brightness-110 shadow-lg shadow-emerald-500/20 transition-all"
                            >
                              <Layers className="w-4 h-4" />
                              ⬆️ Process to Gold
                            </Link>
                          )}
                          {/* Generic pipeline (all layers) */}
                          <Link
                            href={`/pipelines/new?sourceTable=${table.tableName}&sourceLayer=${activeTab.toUpperCase()}`}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium hover:bg-emerald-500/20 transition-all"
                          >
                            <Layers className="w-4 h-4" />
                            Custom Pipeline
                          </Link>
                          <Link
                            href={`/dashboards/new?table=${table.tableName}&layer=${activeTab}`}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 text-sm font-medium hover:bg-purple-500/20 transition-all"
                          >
                            <BarChart3 className="w-4 h-4" />
                            Create Dashboard
                          </Link>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
