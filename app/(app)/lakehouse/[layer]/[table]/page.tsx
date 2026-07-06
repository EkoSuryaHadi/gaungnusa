"use client";

import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Database,
  Layers,
  RefreshCw,
  Table2,
  Rows3,
  HardDrive,
  Calendar,
  Clock,
  ExternalLink,
  BarChart3,
} from "lucide-react";
import { authFetch } from "@/lib/auth-client";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";

// ── Types ──────────────────────────────────────────────────────────────────

interface TableData {
  table: {
    tableName: string;
    displayName: string;
    description: string | null;
    layer: string;
    rowsCount: number;
    sizeBytes: number;
  };
  columns: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
}

interface ColumnDef {
  name: string;
  type: string;
}

interface SchemaData {
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

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function layerColor(layer: string): string {
  switch (layer.toUpperCase()) {
    case "GOLD":
      return "emerald";
    case "BRONZE":
      return "amber";
    default:
      return "slate";
  }
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function TableDetailPage() {
  const router = useRouter();
  const params = useParams<{ layer: string; table: string }>();
  const layer = params?.layer ?? "";
  const table = params?.table ?? "";

  const [tableData, setTableData] = useState<TableData | null>(null);
  const [schemaData, setSchemaData] = useState<SchemaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  // ── Fetch data ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!layer || !table) return;

    async function fetchData() {
      setLoading(true);
      setError("");
      try {
        const [dataRes, schemaRes] = await Promise.all([
          authFetch(`/api/lakehouse/${layer}/${table}`),
          authFetch(`/api/lakehouse/${layer}/${table}/schema`),
        ]);

        if (!dataRes.ok) {
          const errData = await dataRes.json().catch(() => ({}));
          throw new Error(errData.error || "Failed to load table data");
        }

        const data = await dataRes.json();
        setTableData(data);

        if (schemaRes.ok) {
          const schema = await schemaRes.json();
          setSchemaData(schema);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [layer, table]);

  // ── Loading State ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-20 text-center">
        <RefreshCw className="w-8 h-8 text-slate-500 animate-spin mx-auto mb-3" />
        <p className="text-slate-500">Loading table...</p>
      </div>
    );
  }

  // ── Error State ─────────────────────────────────────────────────────────
  if (error || !tableData) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-20 text-center space-y-4">
        <div className="text-4xl">⚠️</div>
        <p className="text-red-400 text-lg">{error || "Table not found"}</p>
        <Link
          href="/lakehouse"
          className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Lakehouse
        </Link>
      </div>
    );
  }

  const { table: meta, columns, rows, totalRows } = tableData;
  const color = layerColor(meta.layer);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
      {/* Breadcrumb & Back */}
      <div className="flex items-center gap-4">
        <Link
          href="/lakehouse"
          className="text-sm text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Lakehouse
        </Link>
        <span className="text-slate-600">/</span>
        <span
          className={`text-xs font-bold px-2 py-0.5 rounded bg-${color}-500/10 text-${color}-400 uppercase`}
        >
          {meta.layer}
        </span>
        <span className="text-slate-600">/</span>
        <span className="text-sm text-white font-medium truncate">
          {meta.displayName}
        </span>
      </div>

      {/* Header */}
      <div className="glass p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-lg bg-${color}-500/10 border border-${color}-500/20`}
            >
              <Database className={`w-5 h-5 text-${color}-400`} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">
                {meta.displayName}
              </h1>
              <p className="text-xs text-slate-500 font-mono">
                {meta.tableName}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Context-aware flow button */}
            {meta.layer.toUpperCase() === "BRONZE" && (
              <Link
                href={`/pipelines/new?sourceTable=${meta.tableName}&sourceLayer=BRONZE&targetLayer=SILVER`}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-slate-400 text-slate-950 font-bold text-sm hover:brightness-110 shadow-lg shadow-amber-500/20 transition-all"
              >
                <Layers className="w-4 h-4" />
                ⬆️ Process to Silver
              </Link>
            )}
            {meta.layer.toUpperCase() === "SILVER" && (
              <Link
                href={`/pipelines/new?sourceTable=${meta.tableName}&sourceLayer=SILVER&targetLayer=GOLD`}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-slate-400 to-emerald-500 text-slate-950 font-bold text-sm hover:brightness-110 shadow-lg shadow-emerald-500/20 transition-all"
              >
                <Layers className="w-4 h-4" />
                ⬆️ Process to Gold
              </Link>
            )}
            {/* Custom pipeline (all layers) */}
            <Link
              href={`/pipelines/new?sourceTable=${meta.tableName}&sourceLayer=${meta.layer.toUpperCase()}`}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800/50 border border-slate-700/50 text-slate-400 text-xs font-medium hover:bg-slate-700/50 hover:text-slate-300 transition-all"
            >
              <Layers className="w-3.5 h-3.5" />
              Custom Pipeline
            </Link>
          </div>
          <Link
            href={`/dashboards/new?table=${meta.tableName}&layer=${meta.layer}`}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 text-sm font-medium hover:bg-purple-500/20 transition-all"
          >
            <BarChart3 className="w-4 h-4" />
            Create Dashboard
          </Link>
        </div>

        {meta.description && (
          <p className="text-sm text-slate-400">{meta.description}</p>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <p className="text-xs text-slate-500 mb-1">Total Rows</p>
            <div className="flex items-center gap-1.5">
              <Rows3 className="w-4 h-4 text-slate-400" />
              <span className="text-lg font-bold text-white">
                {formatNumber(totalRows)}
              </span>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <p className="text-xs text-slate-500 mb-1">Columns</p>
            <div className="flex items-center gap-1.5">
              <Table2 className="w-4 h-4 text-slate-400" />
              <span className="text-lg font-bold text-white">
                {columns.length}
              </span>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <p className="text-xs text-slate-500 mb-1">Size</p>
            <div className="flex items-center gap-1.5">
              <HardDrive className="w-4 h-4 text-slate-400" />
              <span className="text-lg font-bold text-white">
                {formatBytes(meta.sizeBytes)}
              </span>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <p className="text-xs text-slate-500 mb-1">Layer</p>
            <span
              className={`inline-block text-xs font-bold px-2 py-1 rounded bg-${color}-500/10 text-${color}-400 uppercase`}
            >
              {meta.layer}
            </span>
          </div>
        </div>
      </div>

      {/* Schema Section */}
      {schemaData && schemaData.columns.length > 0 && (
        <div className="glass p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Schema</h2>
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                Created: {formatDate(schemaData.createdAt)}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                Updated: {formatDate(schemaData.updatedAt)}
              </span>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Column Name</TableHead>
                <TableHead>Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schemaData.columns.map((col, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-sm text-slate-200">
                    {col.name}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-slate-500">
                    {col.type}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Data Table */}
      <div className="glass p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Data</h2>
          <p className="text-xs text-slate-500">
            Showing {rows.length} of {formatNumber(totalRows)} rows
          </p>
        </div>

        {columns.length > 0 && rows.length > 0 ? (
          <div className="overflow-x-auto -mx-2">
            <div className="inline-block min-w-full align-middle px-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 text-slate-600">#</TableHead>
                    {columns.map((col) => (
                      <TableHead
                        key={col}
                        className="whitespace-nowrap"
                      >
                        {col}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-slate-600 text-xs">
                        {i + 1}
                      </TableCell>
                      {columns.map((col) => (
                        <TableCell
                          key={col}
                          className="whitespace-nowrap max-w-[300px] truncate"
                          title={row[col] === null ? "null" : String(row[col])}
                        >
                          {row[col] === null ? (
                            <span className="text-slate-700 italic">null</span>
                          ) : (
                            String(row[col])
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 rounded-xl bg-slate-950 border border-slate-800">
            <Table2 className="w-10 h-10 text-slate-700 mx-auto mb-3" />
            <p className="text-slate-500">No data available</p>
            <p className="text-xs text-slate-600 mt-1">
              Run a pipeline to populate this table
            </p>
            <Link
              href={`/pipelines/new?sourceTable=${meta.tableName}&sourceLayer=${meta.layer.toUpperCase()}`}
              className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium hover:bg-emerald-500/20 transition-all"
            >
              <Layers className="w-3.5 h-3.5" />
              Create Pipeline
            </Link>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="flex items-center gap-3">
        <Link
          href="/lakehouse"
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-900/60 text-slate-400 text-sm hover:bg-slate-800 hover:text-white transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Explorer
        </Link>
        <Link
          href={`/pipelines/new?sourceTable=${meta.tableName}&sourceLayer=${meta.layer.toUpperCase()}`}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-500 text-slate-950 text-sm font-bold hover:bg-emerald-400 transition-all"
        >
          <ExternalLink className="w-4 h-4" />
          New Pipeline
        </Link>
      </div>
    </div>
  );
}
