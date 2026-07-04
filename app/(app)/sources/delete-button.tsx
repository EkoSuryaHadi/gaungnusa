"use client";

import { useRouter } from "next/navigation";

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
      const res = await fetch(`/api/sources/${sourceId}`, { method: "DELETE" });
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
      className="px-2 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs hover:bg-red-500/20 transition-all"
      title="Delete source"
    >
      🗑️
    </button>
  );
}
