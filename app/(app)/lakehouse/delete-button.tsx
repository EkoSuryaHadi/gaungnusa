"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { authFetch } from "@/lib/auth-client";

export default function LakehouseDeleteButton({
  layer,
  tableName,
  displayName,
  onDeleted,
}: {
  layer: string;
  tableName: string;
  displayName: string;
  onDeleted?: (tableName: string) => void;
}) {
  const router = useRouter();

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Hapus tabel "${displayName}" dari layer ${layer}?\n\nIni akan menghapus seluruh data tabel secara permanen.`)) return;
    try {
      const res = await authFetch(`/api/lakehouse/${layer.toLowerCase()}/${tableName}`, { method: "DELETE" });
      if (res.ok) {
        onDeleted?.(tableName);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Gagal menghapus tabel");
      }
    } catch {
      alert("Gagal menghapus tabel");
    }
  }

  return (
    <button
      onClick={handleDelete}
      className="btn btn-ghost"
      style={{
        padding: "4px 8px",
        position: "absolute",
        top: "10px",
        right: "10px",
        zIndex: 2,
      }}
      title="Hapus tabel"
    >
      <Trash2 size={14} />
    </button>
  );
}
