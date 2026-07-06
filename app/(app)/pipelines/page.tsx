"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DeletePipelineButton } from "./delete-button";
import { RunPipelineButton } from "./run-button";
import { GitBranch, ArrowRight, AlertCircle, RefreshCw } from "lucide-react";
import { authFetch } from "@/lib/auth-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PipelineSource {
  name: string;
}

interface PipelineStep {
  id: number;
  pipelineId: number;
  order: number;
  type: string;
  config: string;
  inputLayer: string | null;
  outputLayer: string | null;
  outputTable: string | null;
  positionX: number;
  positionY: number;
}

interface PipelineRun {
  id: number;
  pipelineId: number;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  duration: number | null;
  rowsInput: number | null;
  rowsOutput: number | null;
  errorMessage: string | null;
  logs: string | null;
  createdAt: string;
}

interface Pipeline {
  id: number;
  userId: number;
  sourceId: number | null;
  tenantId: number | null;
  name: string;
  description: string | null;
  schedule: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  steps: PipelineStep[];
  runs: PipelineRun[];
  source: PipelineSource | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const stepTypeLabels: Record<string, string> = {
  SOURCE: "Source",
  CLEAN: "Clean",
  VALIDATE: "Validate",
  TRANSFORM: "Transform",
  JOIN: "Join",
  FILTER: "Filter",
  CATEGORIZE: "Categorize",
  AGGREGATE: "Aggregate",
  SORT: "Sort",
  PIVOT: "Pivot",
  OUTPUT: "Output",
};

function timeAgo(date: string | Date): string {
  const now = Date.now();
  const diff = now - new Date(date).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString("id-ID");
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PipelinesPage() {
  const router = useRouter();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const handlePipelineDeleted = useCallback((id: number) => {
    setPipelines((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const fetchPipelines = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await authFetch("/api/pipelines");
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) throw new Error(`Failed to fetch pipelines (${res.status})`);
      const data = await res.json();
      setPipelines(data.pipelines ?? []);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchPipelines();
  }, [fetchPipelines]);

  // ----- Loading state -----
  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8 page-enter">
        {/* Header skeleton */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="skeleton" style={{ width: 200, height: 28, marginBottom: 8 }} />
            <div className="skeleton" style={{ width: 100, height: 16 }} />
          </div>
          <div className="skeleton" style={{ width: 140, height: 40, borderRadius: "var(--radius-md)" }} />
        </div>
        {/* Card skeletons */}
        <div className="stagger grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-5">
              <div className="skeleton" style={{ width: "60%", height: 18, marginBottom: 8 }} />
              <div className="skeleton" style={{ width: "40%", height: 14, marginBottom: 16 }} />
              <div className="skeleton" style={{ width: "100%", height: 10, marginBottom: 12 }} />
              <div className="skeleton" style={{ width: 80, height: 22, borderRadius: 20, marginBottom: 12 }} />
              <div className="skeleton" style={{ width: "100%", height: 14, marginBottom: 16 }} />
              <div className="skeleton" style={{ width: "100%", height: 32, borderRadius: "var(--radius-sm)" }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ----- Error state -----
  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8 page-enter">
        <div className="flex items-center justify-between mb-8">
          <h1
            className="text-3xl font-normal"
            style={{
              fontFamily: "var(--font-display)",
              fontStyle: "italic",
              color: "var(--gold-400)",
            }}
          >
            ETL Pipelines
          </h1>
        </div>
        <div
          className="card"
          style={{
            padding: 48,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          }}
        >
          <AlertCircle size={40} style={{ color: "var(--clay-400)" }} />
          <p
            style={{
              color: "var(--clay-400)",
              fontFamily: "var(--font-body)",
              fontSize: 14,
              fontWeight: 300,
              margin: 0,
            }}
          >
            {error}
          </p>
          <button onClick={fetchPipelines} className="btn btn-secondary">
            <RefreshCw size={16} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ----- Main render -----
  return (
    <div className="max-w-6xl mx-auto px-6 py-8 page-enter">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1
            className="text-3xl font-normal"
            style={{
              fontFamily: "var(--font-display)",
              fontStyle: "italic",
              color: "var(--gold-400)",
            }}
          >
            ETL Pipelines
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            {pipelines.length} pipeline{pipelines.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link href="/pipelines/new" className="btn btn-primary">
          + New Pipeline
        </Link>
      </div>

      {/* Empty State */}
      {pipelines.length === 0 ? (
        <div className="empty-state">
          <GitBranch size={32} style={{ color: "var(--text-muted)" }} />
          <h3>No pipelines yet</h3>
          <p
            className="text-sm max-w-md"
            style={{ color: "var(--text-muted)" }}
          >
            Create your first data transformation pipeline to clean, enrich, and
            aggregate your data.
          </p>
          <Link href="/pipelines/new" className="btn btn-primary mt-2">
            Build Your First Pipeline
          </Link>
        </div>
      ) : (
        /* Pipeline Grid */
        <div className="stagger grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {pipelines.map((pipeline) => {
            const lastRun = pipeline.runs[0];
            const isActive = pipeline.status === "ACTIVE";
            const statusClass = isActive ? "badge-active" : "badge-draft";
            const flowMod = isActive ? "active" : "draft";

            return (
              <div
                key={pipeline.id}
                className="card pipeline-card p-5 group"
              >
                {/* Pipeline name */}
                <h3
                  className="text-lg font-normal mb-1 truncate"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontStyle: "italic",
                    color: "var(--text-primary)",
                  }}
                >
                  {pipeline.name}
                </h3>

                {/* Source label */}
                {pipeline.source ? (
                  <p
                    className="text-xs mb-3 truncate"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {pipeline.source.name}
                  </p>
                ) : pipeline.steps?.[0]?.outputLayer ? (
                  <p
                    className="text-xs mb-3 truncate"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Lakehouse: {pipeline.steps[0].outputLayer}
                  </p>
                ) : null}

                {/* Mini flow diagram */}
                {pipeline.steps.length > 0 ? (
                  <div className="flex items-center gap-1.5 mb-3 py-2">
                    {pipeline.steps.map((step, i) => (
                      <div
                        key={step.id}
                        className="flex items-center gap-1.5"
                      >
                        <div
                          className={`flow-dot ${flowMod}`}
                          title={stepTypeLabels[step.type] || step.type}
                        />
                        {i < pipeline.steps.length - 1 && (
                          <div className={`flow-line ${flowMod}`} />
                        )}
                      </div>
                    ))}
                    <div className={`flow-line ${flowMod}`} />
                    <ArrowRight
                      size={10}
                      style={{
                        color: isActive
                          ? "var(--gold-400)"
                          : "var(--text-muted)",
                      }}
                    />
                  </div>
                ) : (
                  <div className="mb-3 py-2">
                    <span
                      className="text-xs italic"
                      style={{ color: "var(--text-muted)" }}
                    >
                      No steps configured
                    </span>
                  </div>
                )}

                {/* Step count + status badge */}
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className="text-xs"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {pipeline.steps.length} step
                    {pipeline.steps.length !== 1 ? "s" : ""}
                  </span>
                  <span className={`badge ${statusClass}`}>
                    {pipeline.status.toLowerCase()}
                  </span>
                  {lastRun && (
                    <span
                      className="text-[11px] ml-auto"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {lastRun.status === "SUCCESS"
                        ? "Passed"
                        : lastRun.status === "FAILED"
                          ? "Failed"
                          : "Pending"}{" "}
                      · {timeAgo(lastRun.createdAt)}
                    </span>
                  )}
                </div>

                {/* Description */}
                {pipeline.description && (
                  <p
                    className="text-xs line-clamp-2 mb-4"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {pipeline.description}
                  </p>
                )}

                {/* Actions */}
                <div
                  className="flex items-center gap-2 pt-3"
                  style={{ borderTop: "1px solid var(--border-subtle)" }}
                >
                  <RunPipelineButton
                    pipelineId={pipeline.id}
                    pipelineName={pipeline.name}
                  />
                  <Link
                    href={`/pipelines/${pipeline.id}`}
                    className="link-echo text-xs font-medium flex items-center gap-1"
                  >
                    Edit
                  </Link>
                  <DeletePipelineButton
                    pipelineId={pipeline.id}
                    pipelineName={pipeline.name}
                    onDeleted={handlePipelineDeleted}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
