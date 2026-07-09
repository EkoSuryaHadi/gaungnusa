"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { authFetch } from "@/lib/auth-client";

export function DeletePipelineButton({
  pipelineId,
  pipelineName,
  onDeleted,
  onRefresh,
}: {
  pipelineId: number;
  pipelineName: string;
  onDeleted?: (id: number) => void;
  onRefresh?: () => void;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm(`Delete "${pipelineName}"?`)) return;
    setDeleting(true);
    try {
      const res = await authFetch(`/api/pipelines/${pipelineId}`, { method: "DELETE" });
      if (res.ok) {
        // Instant UI: remove from local state
        onDeleted?.(pipelineId);
        // Background: re-fetch from server
        setTimeout(() => {
          onRefresh?.();
          router.refresh();
        }, 300);
      } else {
        const data = await res.json();
        alert(data.error || "Failed to delete");
      }
    } catch {
      alert("Failed to delete pipeline");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      className="btn btn-ghost text-xs p-1.5"
      title="Delete"
    >
      {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
    </button>
  );
}