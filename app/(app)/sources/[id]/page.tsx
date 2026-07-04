"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
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
        // Preview already included in API response
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

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-slate-400">Loading source...</div>
    </div>
  );

  if (error || !source) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="glass p-8 text-center space-y-3">
        <p className="text-red-400">{error || "Source not found"}</p>
        <Link href="/sources" className="text-emerald-400 text-sm">← Back to Sources</Link>
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <Link href="/sources" className="text-sm text-slate-400 hover:text-white">← Sources</Link>
            <span className="text-slate-600">/</span>
            <span className="text-sm text-white font-medium truncate">{source.name}</span>
          </div>
          <p className="text-sm text-slate-400">
            {source.fileName && <span>{source.fileName} · </span>}
            {source.type} · {source.status}
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href={`/pipelines/new?sourceId=${source.id}&sourceName=${encodeURIComponent(source.name)}`}
            className="px-5 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400 transition-all text-sm"
          >
            ⚡ Create Pipeline
          </Link>
          <DeleteSourceButton
            sourceId={source.id}
            sourceName={source.name}
            onDeleted={() => router.push("/sources")}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="glass p-4 text-center">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Rows</p>
          <p className="text-xl font-bold text-white">{source.rowsCount?.toLocaleString() ?? "—"}</p>
        </div>
        <div className="glass p-4 text-center">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Columns</p>
          <p className="text-xl font-bold text-white">{source.columnsCount ?? "—"}</p>
        </div>
        <div className="glass p-4 text-center">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Size</p>
          <p className="text-xl font-bold text-white">{formatBytes(source.fileSize)}</p>
        </div>
        <div className="glass p-4 text-center">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Uploaded</p>
          <p className="text-sm font-bold text-white">{new Date(source.createdAt).toLocaleDateString("id-ID")}</p>
        </div>
      </div>

      {/* Data Preview */}
      <div className="glass p-6">
        <h2 className="font-bold text-white mb-1">📋 Data Preview</h2>
        {preview?.totalRows != null && (
          <p className="text-xs text-slate-400 mb-4">
            Showing first {Math.min(preview.rows.length, 100)} of {preview.totalRows.toLocaleString()} rows
          </p>
        )}

        {preview?.error ? (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {preview.error}
          </div>
        ) : preview && preview.columns.length > 0 ? (
          <div className="overflow-auto max-h-[600px] rounded-xl border border-slate-700/50">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-800/80 sticky top-0 z-10">
                  <th className="px-3 py-2 text-slate-400 font-medium border-r border-slate-700/30 w-12">#</th>
                  {preview.columns.map((col) => (
                    <th key={col} className="px-3 py-2 text-slate-300 font-medium border-r border-slate-700/30 whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, i) => (
                  <tr key={i} className="border-t border-slate-800/50 hover:bg-slate-800/30">
                    <td className="px-3 py-1.5 text-slate-500 border-r border-slate-700/30">{i + 1}</td>
                    {preview.columns.map((col) => {
                      const val = row[col];
                      return (
                        <td key={col} className="px-3 py-1.5 text-slate-300 border-r border-slate-700/30 max-w-[250px] truncate">
                          {val == null ? <span className="text-slate-600 italic">null</span> : String(val)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-500 italic">No preview data available for this source.</p>
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
