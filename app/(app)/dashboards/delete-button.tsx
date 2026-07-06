"use client";

import { Trash2 } from "lucide-react";
import { authFetch } from "@/lib/auth-client";

export default function DeleteButton({
  dashboardId,
  dashboardName,
  onDeleted,
}: {
  dashboardId: number;
  dashboardName: string;
  onDeleted?: (id: number) => void;
}) {
  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Hapus dashboard "${dashboardName}"?`)) return;
    try {
      const res = await authFetch(`/api/dashboards/${dashboardId}`, { method: "DELETE" });
      if (res.ok) {
        onDeleted?.(dashboardId);
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Gagal menghapus dashboard");
      }
    } catch {
      alert("Gagal menghapus dashboard");
    }
  }

  return (
    <button
      onClick={handleDelete}
      className="dash-action dash-action--danger"
      data-tooltip="Hapus"
    >
      <Trash2 size={14} />
    </button>
  );
}
