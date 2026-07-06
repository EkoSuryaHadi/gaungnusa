"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Loader2 } from "lucide-react";

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
      const res = await fetch(`/api/pipelines/${pipelineId}/run`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        setResult(`${data.rowsOutput || 0} rows`);
        router.refresh();
      } else {
        setResult(data.error || "Failed");
      }
    } catch (e: any) {
      setResult(e.message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex-1 relative">
      <button
        onClick={handleRun}
        disabled={running}
        className="btn btn-secondary w-full justify-center text-xs py-1.5 px-3"
        title={`Run ${pipelineName}`}
      >
        {running ? (
          <>
            <Loader2 size={12} className="animate-spin" />
            Running...
          </>
        ) : result ? (
          result
        ) : (
          <>
            <Play size={12} />
            Run
          </>
        )}
      </button>
    </div>
  );
}
