import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { DeletePipelineButton } from "./delete-button";
import { RunPipelineButton } from "./run-button";

export default async function PipelinesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const pipelines = await prisma.pipeline.findMany({
    where: { userId: session.id },
    include: {
      steps: { orderBy: { order: "asc" } },
      runs: { orderBy: { createdAt: "desc" }, take: 1 },
      source: { select: { name: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const statusColors: Record<string, string> = {
    DRAFT: "bg-slate-500/10 text-slate-400 border-slate-500/20",
    ACTIVE: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    PAUSED: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  };

  const runStatusColors: Record<string, string> = {
    PENDING: "text-slate-400",
    RUNNING: "text-blue-400",
    SUCCESS: "text-emerald-400",
    FAILED: "text-red-400",
  };

  function timeAgo(date: Date): string {
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

  const stepTypeLabels: Record<string, string> = {
    SOURCE: "📥 Source",
    CLEAN: "🧹 Clean",
    VALIDATE: "✅ Validate",
    TRANSFORM: "🔄 Transform",
    JOIN: "🔗 Join",
    FILTER: "🔍 Filter",
    CATEGORIZE: "🏷️ Categorize",
    AGGREGATE: "📊 Aggregate",
    SORT: "↕️ Sort",
    PIVOT: "📐 Pivot",
    OUTPUT: "📤 Output",
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">ETL Pipelines</h1>
          <p className="text-sm text-slate-400">
            {pipelines.length} pipeline{pipelines.length !== 1 ? "s" : ""} —
            visual data transformations
          </p>
        </div>
        <Link
          href="/pipelines/new"
          className="px-5 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2"
        >
          <span className="text-lg">+</span> New Pipeline
        </Link>
      </div>

      {/* Pipeline List */}
      {pipelines.length === 0 ? (
        <div className="glass p-12 text-center space-y-4">
          <div className="text-5xl">⚙️</div>
          <h3 className="text-lg font-bold text-white">No pipelines yet</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            Create your first data transformation pipeline to clean, enrich, and
            aggregate your data.
          </p>
          <Link
            href="/pipelines/new"
            className="inline-block px-5 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400 transition-all"
          >
            Build Your First Pipeline
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {pipelines.map((pipeline) => {
            const lastRun = pipeline.runs[0];
            return (
              <div
                key={pipeline.id}
                className="glass p-5 hover:border-slate-700 transition-all group space-y-4"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-white truncate">
                      {pipeline.name}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                      {pipeline.source ? `Source: ${pipeline.source.name}` : pipeline.steps?.[0]?.outputLayer ? `Lakehouse: ${pipeline.steps[0].outputLayer}` : "Lakehouse Pipeline"}
                    </p>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider shrink-0 ${
                      statusColors[pipeline.status] || statusColors.DRAFT
                    }`}
                  >
                    {pipeline.status}
                  </span>
                </div>

                {/* Description */}
                {pipeline.description && (
                  <p className="text-xs text-slate-400 line-clamp-2">
                    {pipeline.description}
                  </p>
                )}

                {/* Steps Preview */}
                {pipeline.steps.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {pipeline.steps.map((step) => (
                      <span
                        key={step.id}
                        className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300"
                      >
                        {stepTypeLabels[step.type] || step.type}
                      </span>
                    ))}
                  </div>
                )}

                {/* Meta Row */}
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{pipeline.steps.length} steps</span>
                  {lastRun ? (
                    <span className={runStatusColors[lastRun.status] || ""}>
                      {lastRun.status === "SUCCESS" ? "✅" : lastRun.status === "FAILED" ? "❌" : "⏳"}{" "}
                      {timeAgo(lastRun.createdAt)}
                    </span>
                  ) : (
                    <span className="text-slate-600">Never run</span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1 border-t border-slate-800">
                  <Link
                    href={`/pipelines/${pipeline.id}`}
                    className="flex-1 text-center py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all"
                  >
                    ✏️ Edit
                  </Link>
                  <RunPipelineButton pipelineId={pipeline.id} pipelineName={pipeline.name} />
                  <DeletePipelineButton pipelineId={pipeline.id} pipelineName={pipeline.name} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
