"use client";

import { useRouter } from "next/navigation";

export function DeletePipelineButton({
  pipelineId,
  pipelineName,
}: {
  pipelineId: number;
  pipelineName: string;
}) {
  const router = useRouter();

  async function handleDelete() {
    if (!confirm(`Delete "${pipelineName}"?`)) return;
    await fetch(`/api/pipelines/${pipelineId}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <button
      onClick={handleDelete}
      className="py-1.5 px-2.5 rounded-lg text-xs font-medium bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all"
      title="Delete"
    >
      🗑️
    </button>
  );
}
