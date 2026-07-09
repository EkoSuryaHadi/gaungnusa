"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authFetch } from "@/lib/auth-client";
import {
  Sparkles,
  CheckCircle2,
  Loader2,
  XCircle,
  ArrowRight,
  Database,
  ShieldCheck,
  BarChart3,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

type Step = {
  id: string;
  label: string;
  icon: "pending" | "running" | "done" | "error";
};

interface ProcessWizardProps {
  sourceId: number;
  sourceName: string;
  onClose: () => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function ProcessWizard({ sourceId, sourceName, onClose }: ProcessWizardProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<"running" | "success" | "error">("running");
  const [steps, setSteps] = useState<Step[]>([
    { id: "create", label: "Membuat pipeline otomatis...", icon: "running" },
    { id: "read", label: "Membaca data dari Bronze...", icon: "pending" },
    { id: "clean", label: "Membersihkan data (deduplicate, whitespace)...", icon: "pending" },
    { id: "quality", label: "Validasi kualitas AI (13 modul)...", icon: "pending" },
    { id: "output", label: "Menyimpan ke Silver layer...", icon: "pending" },
  ]);
  const [result, setResult] = useState<{
    rows: number;
    silverTable: string;
    qualityScore?: { overall: number } | null;
    error?: string | null;
  } | null>(null);
  const [error, setError] = useState("");

  // ── Run on mount ────────────────────────────────────────────────────
  const hasRun = useRef(false);
  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;
    async function run() {
      try {
        // Step 1: creating pipeline
        updateStep("create", "done");
        updateStep("read", "running");

        const res = await authFetch(`/api/sources/${sourceId}/quick-process`, {
          method: "POST",
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || `Gagal memproses (${res.status})`);
        }

        const data = await res.json();

        if (data.status === "FAILED") {
          throw new Error(data.error || "Pipeline gagal");
        }

        // All steps done
        updateStep("read", "done");
        updateStep("clean", "done");
        updateStep("quality", "done");
        updateStep("output", "done");

        setResult({
          rows: data.rows,
          silverTable: data.silverTable,
          qualityScore: data.qualityScore,
        });
        setPhase("success");
      } catch (err: any) {
        setError(err.message || "Terjadi kesalahan");
        setPhase("error");
        // Mark current step as error
        setSteps((prev) =>
          prev.map((s) =>
            s.icon === "running" ? { ...s, icon: "error" as const } : s
          )
        );
      }
    }
    run();
  });

  function updateStep(id: string, icon: "done" | "error" | "running") {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, icon } : s))
    );
  }

  // ── DQI color ───────────────────────────────────────────────────────
  function dqiColor(score: number) {
    if (score >= 90) return { bg: "rgba(34,197,94,0.15)", text: "#4ade80", label: "Sangat Baik" };
    if (score >= 70) return { bg: "rgba(234,179,8,0.15)", text: "#eab308", label: "Baik" };
    return { bg: "rgba(239,68,68,0.15)", text: "#f87171", label: "Perlu Perhatian" };
  }

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget && phase !== "running") onClose(); }}
    >
      <div
        className="card"
        style={{
          width: "100%", maxWidth: 480, padding: "2rem",
          display: "flex", flexDirection: "column", gap: "1.5rem",
          animation: "fadeIn 0.3s ease",
        }}
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <div style={{ textAlign: "center" }}>
          {phase === "running" && (
            <Loader2
              style={{
                width: "2.5rem", height: "2.5rem", color: "var(--gold-400)",
                animation: "spin 1s linear infinite", marginBottom: "0.75rem",
              }}
            />
          )}
          {phase === "success" && (
            <CheckCircle2
              style={{
                width: "2.5rem", height: "2.5rem", color: "#4ade80", marginBottom: "0.75rem",
              }}
            />
          )}
          {phase === "error" && (
            <XCircle
              style={{
                width: "2.5rem", height: "2.5rem", color: "#f87171", marginBottom: "0.75rem",
              }}
            />
          )}
          <h2
            style={{
              fontFamily: "var(--font-display)", fontSize: "1.25rem",
              fontWeight: 500, color: "var(--text-primary)", margin: 0,
            }}
          >
            {phase === "running" && "Memproses Data..."}
            {phase === "success" && "Selesai!"}
            {phase === "error" && "Gagal"}
          </h2>
          <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", margin: "0.25rem 0 0" }}>
            {phase === "running" && sourceName}
            {phase === "success" && `${result?.rows ?? 0} baris berhasil diproses ke Silver`}
            {phase === "error" && error}
          </p>
        </div>

        {/* ── Progress Steps ──────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {steps.map((step) => (
            <div
              key={step.id}
              style={{
                display: "flex", alignItems: "center", gap: "0.75rem",
                padding: "0.5rem 0.75rem", borderRadius: "var(--radius-md)",
                background:
                  step.icon === "running"
                    ? "rgba(212,168,83,0.08)"
                    : "transparent",
                transition: "all 0.3s ease",
              }}
            >
              {step.icon === "done" && (
                <CheckCircle2 style={{ width: "1rem", height: "1rem", color: "#4ade80", flexShrink: 0 }} />
              )}
              {step.icon === "running" && (
                <Loader2 style={{ width: "1rem", height: "1rem", color: "var(--gold-400)", flexShrink: 0, animation: "spin 1s linear infinite" }} />
              )}
              {step.icon === "error" && (
                <XCircle style={{ width: "1rem", height: "1rem", color: "#f87171", flexShrink: 0 }} />
              )}
              {step.icon === "pending" && (
                <div style={{ width: "1rem", height: "1rem", borderRadius: "50%", border: "2px solid var(--border-subtle)", flexShrink: 0 }} />
              )}
              <span
                style={{
                  fontSize: "0.875rem",
                  color:
                    step.icon === "done"
                      ? "var(--text-secondary)"
                      : step.icon === "running"
                        ? "var(--gold-400)"
                        : step.icon === "error"
                          ? "#f87171"
                          : "var(--text-muted)",
                  fontWeight: step.icon === "running" ? 500 : 400,
                }}
              >
                {step.label}
              </span>
            </div>
          ))}
        </div>

        {/* ── Success Result ───────────────────────────────────────── */}
        {phase === "success" && result && (
          <div
            style={{
              display: "flex", flexDirection: "column", gap: "0.75rem",
              padding: "1rem", borderRadius: "var(--radius-md)",
              background: "var(--gold-dim)", border: "1px solid rgba(212,168,83,0.15)",
            }}
          >
            {/* DQI Score */}
            {result.qualityScore && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <span
                  style={{
                    padding: "0.5rem 0.75rem", borderRadius: "var(--radius-md)",
                    fontSize: "1.5rem", fontWeight: 700, fontFamily: "var(--font-display)",
                    background: dqiColor(result.qualityScore.overall).bg,
                    color: dqiColor(result.qualityScore.overall).text,
                  }}
                >
                  {Math.round(result.qualityScore.overall)}
                </span>
                <div>
                  <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-primary)" }}>
                    Skor Kualitas Data
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    {dqiColor(result.qualityScore.overall).label}
                  </div>
                </div>
              </div>
            )}

            {/* Rows */}
            <div style={{ display: "flex", gap: "1.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                <Database style={{ width: "0.875rem", height: "0.875rem", color: "var(--text-muted)" }} />
                <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                  {result.rows.toLocaleString("id-ID")} baris
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                <ShieldCheck style={{ width: "0.875rem", height: "0.875rem", color: "var(--text-muted)" }} />
                <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>Silver Layer</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Actions ──────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: "0.75rem" }}>
          {phase === "success" && result && (
            <>
              <button
                onClick={() => {
                  onClose();
                  router.push(`/lakehouse/silver/${result.silverTable}`);
                }}
                className="btn btn-primary"
                style={{ flex: 1, justifyContent: "center", gap: "0.375rem" }}
              >
                <BarChart3 style={{ width: "1rem", height: "1rem" }} />
                Lihat Data
                <ArrowRight style={{ width: "0.875rem", height: "0.875rem" }} />
              </button>
              <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1, justifyContent: "center" }}>
                Tutup
              </button>
            </>
          )}
          {phase === "error" && (
            <>
              <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1, justifyContent: "center" }}>
                Tutup
              </button>
              <Link
                href={`/pipelines/new?sourceId=${sourceId}&sourceName=${encodeURIComponent(sourceName)}`}
                className="btn btn-secondary"
                style={{ flex: 1, justifyContent: "center", textDecoration: "none" }}
              >
                Mode Lanjutan
              </Link>
            </>
          )}
          {phase === "running" && (
            <p style={{ width: "100%", textAlign: "center", fontSize: "0.75rem", color: "var(--text-muted)", margin: 0 }}>
              Mohon tunggu, proses memakan waktu beberapa detik...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
