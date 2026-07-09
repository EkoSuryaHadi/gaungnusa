"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { authFetch } from "@/lib/auth-client";

interface PipelineRun {
  id: number;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  rowsOutput: number | null;
  errorMessage: string | null;
  logs: string | null;
}

interface PipelineStep {
  id: number;
  order: number;
  type: string;
  config: string;
  outputLayer: string | null;
  outputTable: string | null;
}

interface Pipeline {
  id: number;
  name: string;
  description: string | null;
  status: string;
  sourceId: number;
  source: { id: number; name: string; type: string } | null;
  steps: PipelineStep[];
  runs: PipelineRun[];
  createdAt: string;
}

const STEP_ICON: Record<string, string> = {
  SOURCE: "📥", CLEAN: "🧹", VALIDATE: "✅", TRANSFORM: "🔄",
  JOIN: "🔗", FILTER: "🔍", CATEGORIZE: "🏷️", AGGREGATE: "📊",
  SORT: "↕️", PIVOT: "📐", OUTPUT: "📤",
};

export default function PipelineDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<string | null>(null);

  useEffect(() => {
    authFetch(`/api/pipelines/${params.id}`)
      .then((r) => { if (r.status === 401) { router.push("/login"); return null; } return r.json(); })
      .then((d) => { if (d) setPipeline(d); })
      .finally(() => setLoading(false));
  }, [params.id, router]);

  async function handleRun() {
    setRunning(true);
    setRunResult(null);
    try {
      const res = await authFetch(`/api/pipelines/${params.id}/run`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setRunResult(`✅ SUCCESS — ${data.rowsOutput || 0} rows written`);
        // Refresh
        const r2 = await authFetch(`/api/pipelines/${params.id}`);
        if (r2.ok) setPipeline(await r2.json());
      } else {
        setRunResult(`❌ FAILED: ${data.error || "Unknown error"}`);
      }
    } catch (e: any) {
      setRunResult(`❌ ${e.message}`);
    } finally {
      setRunning(false);
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="text-slate-400">Loading...</div></div>;
  if (!pipeline) return <div className="min-h-screen flex items-center justify-center"><div className="glass p-8 text-center"><p className="text-red-400">Pipeline not found</p><Link href="/pipelines" className="text-emerald-400">← Back</Link></div></div>;

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <Link href="/pipelines" className="text-sm text-slate-400 hover:text-white">← Pipelines</Link>
            <span className="text-slate-600">/</span>
            <span className="text-sm text-white font-medium truncate">{pipeline.name}</span>
          </div>
          {pipeline.description && <p className="text-sm text-slate-400">{pipeline.description}</p>}
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs px-3 py-1 rounded-full border ${
            pipeline.status === "ACTIVE" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
            pipeline.status === "DRAFT" ? "bg-slate-500/10 text-slate-400 border-slate-500/20" :
            "bg-amber-500/10 text-amber-400 border-amber-500/20"
          }`}>{pipeline.status}</span>
          <button
            onClick={handleRun}
            disabled={running}
            className="px-5 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400 disabled:opacity-50 transition-all"
          >
            {running ? "Running..." : "▶️ Run Pipeline"}
          </button>
        </div>
      </div>

      {runResult && (
        <div className="space-y-3">
          <div className={`p-4 rounded-xl border text-sm font-medium ${
            runResult.startsWith("✅") ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
            "bg-red-500/10 border-red-500/20 text-red-400"
          }`}>{runResult}</div>
          {runResult.startsWith("✅") && (
            <div className="flex gap-3">
              <Link
                href="/lakehouse"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500 text-white font-bold hover:bg-sky-400 transition-all text-sm"
              >
                📊 View in Lakehouse
              </Link>
              <Link
                href="/dashboards/new"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-500 text-white font-bold hover:bg-purple-400 transition-all text-sm"
              >
                📈 Create Dashboard
              </Link>
              <Link
                href={`/pipelines/new?sourceId=${pipeline.sourceId}`}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold hover:bg-amber-400 transition-all text-sm"
              >
                🔁 New Pipeline
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Steps flow */}
      <div className="glass p-6">
        <h2 className="font-bold text-white mb-4">📋 Pipeline Steps</h2>
        <div className="space-y-1">
          {pipeline.steps.map((step, i) => {
            const cfg = (() => { try { return JSON.parse(step.config); } catch { return {}; } })();
            return (
              <div key={step.id} className="flex items-center gap-4">
                <div className="w-8 text-center text-slate-500 text-xs font-mono">{i + 1}</div>
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800/50 border border-slate-700/50 flex-1">
                  <span className="text-lg">{STEP_ICON[step.type] || "⚙️"}</span>
                  <span className="text-sm font-medium text-white">{step.type}</span>
                  {step.outputLayer && <span className="text-[10px] px-2 py-0.5 rounded bg-slate-700 text-slate-400">{step.outputLayer}.{step.outputTable}</span>}
                  <span className="flex-1" />
                  <span className="text-[10px] text-slate-500">
                    {Object.entries(cfg).filter(([,v]) => v && v !== "" && v !== false).slice(0, 2).map(([k, v]) => `${k}=${v}`).join(", ")}
                  </span>
                </div>
                {i < pipeline.steps.length - 1 && <div className="text-slate-600 text-xs">▼</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Run history */}
      {pipeline.runs.length > 0 && (
        <div className="glass p-6">
          <h2 className="font-bold text-white mb-4">📜 Run History</h2>
          <div className="space-y-2">
            {pipeline.runs.slice(0, 5).map((run) => (
              <div key={run.id} className="flex items-center gap-4 px-4 py-3 rounded-xl bg-slate-800/30 border border-slate-700/30 text-sm">
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                  run.status === "SUCCESS" ? "bg-emerald-500/10 text-emerald-400" :
                  run.status === "FAILED" ? "bg-red-500/10 text-red-400" :
                  run.status === "RUNNING" ? "bg-blue-500/10 text-blue-400" :
                  "bg-slate-500/10 text-slate-400"
                }`}>{run.status}</span>
                <span className="text-slate-400 text-xs">
                  {run.startedAt ? new Date(run.startedAt).toLocaleString("id-ID") : "—"}
                </span>
                {run.rowsOutput != null && <span className="text-emerald-400 text-xs">{run.rowsOutput.toLocaleString()} rows</span>}
                {run.errorMessage && <span className="text-red-400 text-xs truncate">{run.errorMessage}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
