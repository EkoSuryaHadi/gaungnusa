"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { authFetch } from "@/lib/auth-client";

export default function DeleteSourceButton({
  sourceId,
  sourceName,
  onDeleted,
}: {
  sourceId: number;
  sourceName: string;
  onDeleted?: (id: number) => void;
}) {
  const router = useRouter();

  async function handleDelete() {
    if (!confirm(`Delete source "${sourceName}"? This cannot be undone.`)) return;

    try {
      const res = await authFetch(`/api/sources/${sourceId}`, { method: "DELETE" });
      if (res.ok) {
        onDeleted?.(sourceId);
        router.refresh();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to delete");
      }
    } catch {
      alert("Failed to delete source");
    }
  }

  return (
    <button
      onClick={handleDelete}
      className="btn btn-danger"
      style={{ padding: "6px 10px", fontSize: 13 }}
      title="Delete source"
    >
      <Trash2 size={15} />
    </button>
  );
}
