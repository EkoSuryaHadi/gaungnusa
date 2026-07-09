"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ParseResult } from "papaparse";
import { ArrowLeft, Upload, FileSpreadsheet, Check, Loader2, X, ArrowRight, Database, Zap } from "lucide-react";
import { authFetch } from "@/lib/auth-client";

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

  // ---- derived: is this an Excel file? ----
  const isExcel = useMemo(() => {
    if (!file) return false;
    const lower = file.name.toLowerCase();
    return (
      lower.endsWith(".xlsx") ||
      lower.endsWith(".xls") ||
      file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.type === "application/vnd.ms-excel"
    );
  }, [file]);

  // ---- preview state ----
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [previewTotalRows, setPreviewTotalRows] = useState<number | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  // ---- submit state ----
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ id: number; name: string; rows: number; columns: number } | null>(null);

  // -------------------------------------------------------------------
  // File selection helpers
  // -------------------------------------------------------------------

  const processFile = useCallback((f: File) => {
    const lower = f.name.toLowerCase();
    const isExcelFile =
      lower.endsWith(".xlsx") ||
      lower.endsWith(".xls") ||
      f.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      f.type === "application/vnd.ms-excel";
    const isCsvFile =
      lower.endsWith(".csv") ||
      f.type === "text/csv";

    if (!isCsvFile && !isExcelFile) {
      setError("Only CSV and Excel (.xlsx, .xls) files are supported.");
      return;
    }

    setError("");
    setFile(f);
    setName((prev) => prev || f.name.replace(/\.(csv|xlsx|xls)$/i, ""));
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

  // ---- preview (papaparse for CSV, info-only for Excel) ----
  const handlePreview = async () => {
    if (!file) return;
    setPreviewing(true);
    setError("");

    // Excel files: no client-side parsing — show info preview
    if (isExcel) {
      setPreviewHeaders([]);
      setPreviewRows([]);
      setPreviewTotalRows(null);
      setShowPreview(true);
      setPreviewing(false);
      return;
    }

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

      // Ensure correct MIME type for Excel files (browsers can misdetect)
      let uploadFile = file;
      if (isExcel) {
        const mimeType = file.name.toLowerCase().endsWith(".xls")
          ? "application/vnd.ms-excel"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        uploadFile = new File([file], file.name, { type: mimeType });
      }
      formData.append("file", uploadFile);
      formData.append("name", name.trim());

      const res = await authFetch("/api/sources", {
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

      // API returns { source: {...}, pipeline: {...} }
      const src = data.source;
      setSuccess({
        id: src.id,
        name: src.name,
        rows: src.rowsCount ?? 0,
        columns: src.columnsCount ?? 0,
      });
      setSubmitting(false);

      // Bronze auto-ingest runs in background via upload API — no extra pipeline needed.
      // User can use "Proses Cepat" from Sources page for Silver processing.
    } catch (err: any) {
      setError(err.message || "Something went wrong during upload.");
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

  // ---- reset for new upload ----
  const resetForm = () => {
    setName("");
    setFile(null);
    setPreviewHeaders([]);
    setPreviewRows([]);
    setPreviewTotalRows(null);
    setShowPreview(false);
    setError("");
    setSuccess(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 page-enter" style={{ fontFamily: "var(--font-body)" }}>
      {/* ── Back link ── */}
      <Link
        href="/sources"
        className="btn btn-ghost mb-8"
        style={{ padding: "6px 14px", fontSize: "13px" }}
      >
        <ArrowLeft size={16} style={{ color: "var(--text-secondary)" }} />
        <span style={{ color: "var(--text-secondary)" }}>Back to Sources</span>
      </Link>

      {/* ── Page header ── */}
      <div className="mb-10" style={{ textAlign: "center" }}>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "32px",
            fontWeight: 400,
            fontStyle: "italic",
            color: "var(--gold-400)",
            lineHeight: 1.25,
          }}
        >
          Upload Data Source
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "14px", marginTop: "6px" }}>
          Upload a CSV or Excel file to ingest into your lakehouse.
        </p>
      </div>

      {/* ── Form ── */}
      {success ? (
        /* ── Success Screen ── */
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Success banner */}
          <div
            className="card"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "20px",
              padding: "40px 32px",
              textAlign: "center",
              borderColor: "rgba(94, 178, 127, 0.25)",
              background: "rgba(94, 178, 127, 0.04)",
            }}
          >
            {/* Checkmark circle */}
            <div
              style={{
                width: "72px",
                height: "72px",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(94, 178, 127, 0.12)",
                border: "2px solid rgba(94, 178, 127, 0.25)",
              }}
            >
              <Check size={36} style={{ color: "var(--sage-400)", strokeWidth: 3 }} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <h2 style={{
                fontFamily: "var(--font-display)",
                fontSize: "20px",
                fontWeight: 400,
                fontStyle: "italic",
                color: "var(--gold-400)",
                margin: 0,
              }}>
                Data Ingested Successfully
              </h2>
              <p style={{ color: "var(--text-secondary)", fontSize: "14px", margin: 0 }}>
                Your data is now available in the Bronze layer of the lakehouse.
              </p>
            </div>

            {/* Source summary */}
            <div
              style={{
                display: "flex",
                gap: "32px",
                padding: "16px 24px",
                borderRadius: "var(--radius-md)",
                background: "var(--bg-root)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Database size={16} style={{ color: "var(--gold-400)" }} />
                <span style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 500 }}>
                  {success.name}
                </span>
              </div>
              <div style={{ width: "1px", background: "var(--border-subtle)" }} />
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                <span style={{ fontSize: "16px", fontWeight: 600, color: "var(--gold-400)" }}>
                  {success.rows.toLocaleString()}
                </span>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Rows</span>
              </div>
              <div style={{ width: "1px", background: "var(--border-subtle)" }} />
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                <span style={{ fontSize: "16px", fontWeight: 600, color: "var(--gold-400)" }}>
                  {success.columns}
                </span>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Columns</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            {/* Primary: View Source in Sources page */}
            <Link
              href="/sources"
              className="btn btn-primary"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                padding: "14px 24px",
                fontSize: "15px",
                fontWeight: 500,
                boxShadow: "0 0 24px rgba(212, 168, 83, 0.2)",
              }}
            >
              <Zap size={18} />
              Continue to Sources
              <ArrowRight size={16} />
            </Link>

            {/* Secondary actions row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "16px",
              }}
            >
              <Link
                href="/sources"
                className="btn btn-secondary"
                style={{ fontSize: "13px", padding: "10px 20px" }}
              >
                <ArrowLeft size={14} />
                Back to Sources
              </Link>
              <button
                onClick={resetForm}
                className="btn btn-ghost"
                style={{ fontSize: "13px", padding: "10px 20px", color: "var(--text-muted)" }}
              >
                <Upload size={14} />
                Upload Another File
              </button>
            </div>
          </div>
        </div>
      ) : (
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        {/* Source name input */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <label
            htmlFor="name"
            style={{
              fontSize: "13px",
              fontWeight: 500,
              color: "var(--text-secondary)",
              letterSpacing: "0.02em",
            }}
          >
            Source Name
          </label>
          <input
            id="name"
            type="text"
            placeholder="e.g. Sales Q4 2025"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="input"
          />
        </div>

        {/* ── Drag & drop upload area ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <label
            style={{
              fontSize: "13px",
              fontWeight: 500,
              color: "var(--text-secondary)",
              letterSpacing: "0.02em",
            }}
          >
            Data File
          </label>

          {!file ? (
            /* ---- Empty drop zone ---- */
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="card-glow"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "16px",
                padding: "48px 24px",
                cursor: "pointer",
                borderStyle: "dashed",
                borderColor: dragOver
                  ? "var(--gold-400)"
                  : "var(--gold-600)",
                borderWidth: "2px",
                transition: "all 220ms cubic-bezier(0.2, 0, 0, 1)",
                background: dragOver
                  ? "rgba(212, 168, 83, 0.06)"
                  : undefined,
                minHeight: "220px",
              }}
            >
              {/* Large Upload icon */}
              <div
                style={{
                  width: "64px",
                  height: "64px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "var(--gold-dim)",
                  border: "1px solid rgba(212, 168, 83, 0.12)",
                }}
              >
                <Upload size={28} style={{ color: "var(--gold-400)" }} />
              </div>

              {/* CTA text */}
              <div style={{ textAlign: "center" }}>
                <p
                  style={{
                    fontSize: "15px",
                    fontWeight: 500,
                    color: "var(--text-primary)",
                    margin: 0,
                  }}
                >
                  Drag &amp; drop CSV or Excel file here
                </p>
                <p
                  style={{
                    fontSize: "12px",
                    color: "var(--text-muted)",
                    marginTop: "4px",
                  }}
                >
                  Supports .csv, .xlsx, .xls (max 50 MB)
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={handleFileChange}
                style={{ display: "none" }}
              />
            </div>
          ) : (
            /* ---- File selected card ---- */
            <div className="card" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* File info row */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "var(--radius-md)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "rgba(212, 168, 83, 0.08)",
                      border: "1px solid rgba(212, 168, 83, 0.15)",
                    }}
                  >
                    <FileSpreadsheet size={20} style={{ color: "var(--gold-400)" }} />
                  </div>
                  <div>
                    <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-primary)", margin: 0 }}>
                      {file.name}
                    </p>
                    <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: 0 }}>
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={clearFile}
                  className="btn btn-ghost"
                  style={{ padding: "6px", borderRadius: "var(--radius-md)" }}
                  title="Remove file"
                >
                  <X size={18} style={{ color: "var(--text-muted)" }} />
                </button>
              </div>

              {/* Preview controls */}
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <button
                  type="button"
                  onClick={handlePreview}
                  disabled={previewing}
                  className="btn btn-secondary"
                  style={{ fontSize: "13px", padding: "7px 14px" }}
                >
                  {previewing ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <FileSpreadsheet size={14} />
                  )}
                  {showPreview ? "Refresh Preview" : "Preview Data"}
                </button>
                {previewTotalRows != null && (
                  <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    {previewTotalRows.toLocaleString()} rows, {previewHeaders.length} columns
                  </span>
                )}
              </div>

              {/* ── Preview mini table (CSV only) ── */}
              {showPreview && !isExcel && previewHeaders.length > 0 && (
                <div
                  className="card"
                  style={{
                    overflow: "hidden",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                      <thead>
                        <tr
                          style={{
                            background: "var(--bg-root)",
                          }}
                        >
                          {previewHeaders.map((h) => (
                            <th
                              key={h}
                              style={{
                                padding: "8px 12px",
                                textAlign: "left",
                                fontWeight: 500,
                                color: "var(--text-secondary)",
                                whiteSpace: "nowrap",
                                borderBottom: "1px solid var(--border-subtle)",
                                fontFamily: "var(--font-body)",
                              }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, i) => (
                          <tr
                            key={i}
                            style={{
                              borderBottom: "1px solid rgba(168, 154, 132, 0.06)",
                              transition: "background 150ms",
                            }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLElement).style.background = "var(--bg-root)";
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLElement).style.background = "";
                            }}
                          >
                            {previewHeaders.map((h) => (
                              <td
                                key={h}
                                style={{
                                  padding: "6px 12px",
                                  color: "var(--text-muted)",
                                  whiteSpace: "nowrap",
                                  maxWidth: "200px",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {row[h] ?? ""}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Excel file preview info ── */}
              {showPreview && isExcel && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "16px 20px",
                    borderRadius: "var(--radius-md)",
                    background: "rgba(212, 168, 83, 0.05)",
                    border: "1px solid rgba(212, 168, 83, 0.12)",
                  }}
                >
                  <span style={{ fontSize: "22px" }}>📊</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }}>
                      Excel file detected
                    </span>
                    <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                      Rows and columns will be parsed on upload
                    </span>
                  </div>
                </div>
              )}

              {showPreview && !isExcel && previewHeaders.length === 0 && !previewing && (
                <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                  No columns detected in this file.
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Error ── */}
        {error && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "12px 16px",
              borderRadius: "var(--radius-md)",
              background: "rgba(184, 92, 58, 0.08)",
              border: "1px solid rgba(184, 92, 58, 0.18)",
            }}
          >
            <div
              style={{
                width: "20px",
                height: "20px",
                borderRadius: "50%",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(184, 92, 58, 0.15)",
              }}
            >
              <span style={{ color: "var(--clay-400)", fontSize: "13px", fontWeight: 700, lineHeight: 1 }}>!</span>
            </div>
            <p style={{ fontSize: "13px", color: "var(--clay-400)", margin: 0 }}>{error}</p>
          </div>
        )}

        {/* ── Actions ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "12px",
            paddingTop: "8px",
          }}
        >
          <Link href="/sources" className="btn btn-secondary">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={!file || !name.trim() || submitting}
            className="btn btn-primary"
            style={{
              boxShadow: !file || !name.trim() || submitting
                ? undefined
                : "0 0 24px rgba(212, 168, 83, 0.2)",
            }}
          >
            {submitting ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Check size={18} />
                Upload &amp; Ingest
              </>
            )}
          </button>
        </div>
      </form>
      )}
    </div>
  );
}
