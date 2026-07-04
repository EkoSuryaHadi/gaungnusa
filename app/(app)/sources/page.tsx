"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Upload, Database, Globe, FileText, RefreshCw, AlertCircle } from "lucide-react";
import DeleteSourceButton from "./delete-button";

// ---------------------------------------------------------------------------
// Types matching the API response shape
// ---------------------------------------------------------------------------

interface DataSource {
  id: number;
  name: string;
  type: string; // CSV | EXCEL | JSON | API | DATABASE
  status: string; // ACTIVE | ERROR | ARCHIVED
  fileName: string | null;
  fileSize: number | null;
  rowsCount: number | null;
  columnsCount: number | null;
  lastSyncAt: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TYPE_ICON: Record<string, string> = {
  CSV: "📄",
  EXCEL: "📊",
  JSON: "📋",
  API: "🔌",
  DATABASE: "🗄️",
};

const TYPE_LABEL: Record<string, string> = {
  CSV: "CSV",
  EXCEL: "Excel",
  JSON: "JSON",
  API: "API",
  DATABASE: "Database",
};

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "—";
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

function statusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    ACTIVE: { label: "Active", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
    ERROR: { label: "Error", cls: "bg-red-500/10 text-red-400 border-red-500/20" },
    ARCHIVED: { label: "Archived", cls: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
  };
  const s = map[status] ?? map.ACTIVE;
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${s.cls}`}>
      {s.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SourcesPage() {
  const router = useRouter();
  const [sources, setSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const handleSourceDeleted = useCallback((id: number) => {
    setSources((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const fetchSources = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/sources");
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
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-8 w-48 bg-slate-800 rounded animate-pulse" />
            <div className="h-4 w-72 bg-slate-800 rounded mt-2 animate-pulse" />
          </div>
          <div className="h-10 w-36 bg-slate-800 rounded-xl animate-pulse" />
        </div>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border border-slate-800 bg-slate-900/40 backdrop-blur p-6 space-y-3">
              <div className="h-5 w-32 bg-slate-800 rounded animate-pulse" />
              <div className="h-4 w-24 bg-slate-800 rounded animate-pulse" />
              <div className="h-3 w-full bg-slate-800 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ----- Error state -----
  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Data Sources</h1>
            <p className="text-sm text-slate-400 mt-1">Manage your ingested datasets</p>
          </div>
        </div>
        <div className="glass p-8 text-center space-y-4">
          <AlertCircle className="mx-auto text-red-400" size={40} />
          <p className="text-red-400">{error}</p>
          <button
            onClick={fetchSources}
            className="px-5 py-2 rounded-xl bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400 transition-all"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ----- Main render -----
  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Data Sources</h1>
          <p className="text-sm text-slate-400 mt-1">
            {sources.length} source{sources.length !== 1 ? "s" : ""} connected
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchSources}
            className="p-2.5 rounded-xl border border-slate-700 bg-slate-900/60 text-slate-400 hover:text-white hover:border-slate-600 transition-all"
            title="Refresh"
          >
            <RefreshCw size={18} />
          </button>
          <Link
            href="/sources/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 transition-all"
          >
            <Upload size={18} />
            Upload New
          </Link>
        </div>
      </div>

      {/* Empty state */}
      {sources.length === 0 && (
        <div className="glass p-12 text-center space-y-4">
          <div className="text-5xl">📥</div>
          <h2 className="text-lg font-bold text-white">No data sources yet</h2>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            Upload a CSV file, connect to an API, or link a database to start building your data lakehouse.
          </p>
          <Link
            href="/sources/new"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400 transition-all"
          >
            <Upload size={18} />
            Add Your First Source
          </Link>
        </div>
      )}

      {/* Source Cards Grid */}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {sources.map((src) => (
          <div
            key={src.id}
            className="rounded-2xl border border-slate-800 bg-slate-900/40 backdrop-blur p-6 space-y-4 hover:border-emerald-500/30 transition-all group hover:-translate-y-1"
          >
            {/* Header row */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="text-3xl">{TYPE_ICON[src.type] ?? "📄"}</div>
                <div>
                  <h3 className="font-bold text-white text-sm leading-tight line-clamp-1">
                    {src.name}
                  </h3>
                  <p className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">
                    {TYPE_LABEL[src.type] ?? src.type}
                  </p>
                </div>
              </div>
              {statusBadge(src.status)}
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/50">
                <p className="text-slate-500">Size</p>
                <p className="text-slate-300 font-mono">{formatBytes(src.fileSize)}</p>
              </div>
              <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/50">
                <p className="text-slate-500">Rows</p>
                <p className="text-slate-300 font-mono">
                  {src.rowsCount != null ? src.rowsCount.toLocaleString() : "—"}
                </p>
              </div>
              <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/50">
                <p className="text-slate-500">Columns</p>
                <p className="text-slate-300 font-mono">
                  {src.columnsCount != null ? src.columnsCount : "—"}
                </p>
              </div>
              <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/50">
                <p className="text-slate-500">Last Sync</p>
                <p className="text-slate-300 text-[10px] leading-tight">
                  {formatDate(src.lastSyncAt)}
                </p>
              </div>
            </div>

            {/* File name + Actions */}
            {src.fileName && (
              <p className="text-[11px] text-slate-500 truncate flex items-center gap-1.5">
                <FileText size={12} />
                {src.fileName}
              </p>
            )}

            {/* Action buttons */}
            <div className="flex gap-2 pt-1">
              <Link
                href={`/pipelines/new?sourceId=${src.id}&sourceName=${encodeURIComponent(src.name)}`}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/20 transition-all"
              >
                ⚡ Create Pipeline
              </Link>
              <Link
                href={`/sources/${src.id}`}
                className="px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-slate-400 text-xs font-semibold hover:bg-slate-700/50 hover:text-slate-300 transition-all"
              >
                Preview
              </Link>
              <DeleteSourceButton sourceId={src.id} sourceName={src.name} onDeleted={handleSourceDeleted} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
