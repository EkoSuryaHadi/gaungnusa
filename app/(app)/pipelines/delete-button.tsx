"use client";

import { Trash2 } from "lucide-react";
import { authFetch } from "@/lib/auth-client";

export function DeletePipelineButton({
  pipelineId,
  pipelineName,
  onDeleted,
}: {
  pipelineId: number;
  pipelineName: string;
  onDeleted?: (id: number) => void;
}) {
  async function handleDelete() {
    if (!confirm(`Delete "${pipelineName}"?`)) return;
    try {
      const res = await authFetch(`/api/pipelines/${pipelineId}`, { method: "DELETE" });
      if (res.ok) {
        onDeleted?.(pipelineId);
      } else {
        const data = await res.json();
        alert(data.error || "Failed to delete");
      }
    } catch {
      alert("Failed to delete pipeline");
    }
  }

  return (
    <button
      onClick={handleDelete}
      className="btn btn-ghost text-xs p-1.5"
      title="Delete"
    >
      <Trash2 size={14} />
    </button>
  );
}