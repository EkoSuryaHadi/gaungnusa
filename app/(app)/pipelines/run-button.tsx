"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RunPipelineButton({
  pipelineId,
  pipelineName,
}: {
  pipelineId: number;
  pipelineName: string;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleRun() {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch(`/api/pipelines/${pipelineId}/run`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setResult(`✅ ${data.rowsOutput || 0} rows`);
        router.refresh();
      } else {
        setResult(`❌ ${data.error || "Failed"}`);
      }
    } catch (e: any) {
      setResult(`❌ ${e.message}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex-1 relative">
      <button
        onClick={handleRun}
        disabled={running}
        className="w-full py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 transition-all disabled:opacity-50"
        title={`Run ${pipelineName}`}
      >
        {running ? "⏳ Running..." : result || "▶️ Run"}
      </button>
    </div>
  );
}
