"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ParseResult } from "papaparse";
import { ArrowLeft, Upload, FileText, X, Eye, Check, Loader2, AlertCircle } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PreviewRow {
  [key: string]: string;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NewSourcePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- form state ----
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // ---- preview state ----
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [previewTotalRows, setPreviewTotalRows] = useState<number | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  // ---- submit state ----
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // -------------------------------------------------------------------
  // File selection helpers
  // -------------------------------------------------------------------

  const processFile = useCallback((f: File) => {
    // Accept CSV and text/csv but also allow generic fallback
    if (!f.name.endsWith(".csv") && f.type !== "text/csv" && f.type !== "application/vnd.ms-excel") {
      setError("Only CSV files are supported. Please select a .csv file.");
      return;
    }

    setError("");
    setFile(f);
    setName((prev) => prev || f.name.replace(/\.csv$/i, ""));
    setPreviewHeaders([]);
    setPreviewRows([]);
    setPreviewTotalRows(null);
    setShowPreview(false);
  }, []);

  // ---- drag & drop ----
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    const dropped = e.dataTransfer.files?.[0];
    if (dropped) processFile(dropped);
  };

  // ---- file input ----
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) processFile(selected);
    // Reset so re-selecting the same file triggers onChange
    e.target.value = "";
  };

  // ---- preview (papaparse) ----
  const handlePreview = async () => {
    if (!file) return;
    setPreviewing(true);
    setError("");

    try {
      const Papa = (await import("papaparse")).default;
      const text = await file.text();

      Papa.parse<PreviewRow>(text, {
        header: true,
        skipEmptyLines: true,
        preview: 10, // first 10 rows for preview
        complete(results: ParseResult<PreviewRow>) {
          setPreviewHeaders(results.meta.fields ?? []);
          setPreviewRows(results.data.slice(0, 5));
          setPreviewTotalRows(null); // unknown until full parse on server
          setShowPreview(true);
        },
        error(err: Error) {
          setError(`Failed to parse CSV: ${err.message}`);
        },
      });

      // Also do a quick full count
      const full = Papa.parse<PreviewRow>(text, { header: true, skipEmptyLines: true });
      setPreviewTotalRows(full.data.length);
    } catch (err: any) {
      setError(err.message || "Preview failed");
    } finally {
      setPreviewing(false);
    }
  };

  // ---- submit ----
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !name.trim()) return;

    setSubmitting(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", name.trim());

      const res = await fetch("/api/sources", {
        method: "POST",
        body: formData,
        // Do NOT set Content-Type — browser sets it with boundary
      });

      if (res.status === 401) {
        router.push("/login");
        return;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);

      router.push("/sources");
    } catch (err: any) {
      setError(err.message || "Something went wrong during upload.");
    } finally {
      setSubmitting(false);
    }
  };

  // ---- remove file ----
  const clearFile = () => {
    setFile(null);
    setPreviewHeaders([]);
    setPreviewRows([]);
    setPreviewTotalRows(null);
    setShowPreview(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
      {/* Back link */}
      <Link
        href="/sources"
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
      >
        <ArrowLeft size={16} />
        Back to Sources
      </Link>

      {/* Page title */}
      <div>
        <h1 className="text-2xl font-bold text-white">Upload Data Source</h1>
        <p className="text-sm text-slate-400 mt-1">
          Upload a CSV file to ingest into your lakehouse.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Name input */}
        <div className="space-y-1.5">
          <label htmlFor="name" className="text-sm font-semibold text-slate-300">
            Source Name
          </label>
          <input
            id="name"
            type="text"
            placeholder="e.g. Sales Q4 2025"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>

        {/* Drag-drop zone */}
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-slate-300">CSV File</label>

          {!file ? (
            /* ---- Empty drop zone ---- */
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative flex flex-col items-center justify-center gap-4 p-10 rounded-2xl border-2 border-dashed cursor-pointer transition-all ${
                dragOver
                  ? "border-emerald-400 bg-emerald-500/10"
                  : "border-slate-700 bg-slate-900/30 hover:border-slate-600 hover:bg-slate-900/50"
              }`}
            >
              <div className="p-4 rounded-full bg-slate-800 border border-slate-700">
                <Upload size={28} className="text-slate-400" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-semibold text-slate-300">
                  Drop your CSV here, or{" "}
                  <span className="text-emerald-400">browse</span>
                </p>
                <p className="text-xs text-slate-500">CSV files only (max 50 MB)</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv,application/vnd.ms-excel"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          ) : (
            /* ---- File selected ---- */
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 backdrop-blur p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <FileText size={20} className="text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{file.name}</p>
                    <p className="text-xs text-slate-400">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={clearFile}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                  title="Remove file"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Preview controls */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handlePreview}
                  disabled={previewing}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-300 hover:text-white hover:border-slate-600 disabled:opacity-50 transition-all"
                >
                  {previewing ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Eye size={14} />
                  )}
                  {showPreview ? "Refresh Preview" : "Preview Data"}
                </button>
                {previewTotalRows != null && (
                  <span className="text-xs text-slate-500">
                    {previewTotalRows.toLocaleString()} rows, {previewHeaders.length} columns
                  </span>
                )}
              </div>

              {/* Preview table */}
              {showPreview && previewHeaders.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-950/70">
                        {previewHeaders.map((h) => (
                          <th
                            key={h}
                            className="px-3 py-2 text-left font-semibold text-slate-300 whitespace-nowrap border-b border-slate-800"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, i) => (
                        <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-950/40">
                          {previewHeaders.map((h) => (
                            <td
                              key={h}
                              className="px-3 py-1.5 text-slate-400 whitespace-nowrap max-w-[200px] truncate"
                            >
                              {row[h] ?? ""}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {showPreview && previewHeaders.length === 0 && !previewing && (
                <p className="text-xs text-slate-500">No columns detected in this file.</p>
              )}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <AlertCircle size={16} className="text-red-400 shrink-0" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            href="/sources"
            className="px-5 py-2.5 rounded-xl border border-slate-700 bg-slate-900/60 text-slate-300 font-semibold hover:bg-slate-900 hover:text-white transition-all"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={!file || !name.trim() || submitting}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400 disabled:opacity-50 shadow-lg shadow-emerald-500/20 transition-all"
          >
            {submitting ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Uploading…
              </>
            ) : (
              <>
                <Check size={18} />
                Upload & Ingest
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
