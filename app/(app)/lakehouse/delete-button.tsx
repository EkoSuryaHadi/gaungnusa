"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { authFetch } from "@/lib/auth-client";

export default function LakehouseDeleteButton({
  layer,
  tableName,
  displayName,
  onDeleted,
  onRefresh,
}: {
  layer: string;
  tableName: string;
  displayName: string;
  onDeleted?: (tableName: string) => void;
  onRefresh?: () => void;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Hapus tabel "${displayName}" dari layer ${layer}?\n\nIni akan menghapus seluruh data tabel secara permanen.`)) return;
    setDeleting(true);
    try {
      const res = await authFetch(`/api/lakehouse/${layer.toLowerCase()}/${tableName}`, { method: "DELETE" });
      if (res.ok) {
        // Instant UI: remove from local state
        onDeleted?.(tableName);
        // Background: re-fetch from server
        setTimeout(() => {
          onRefresh?.();
          router.refresh();
        }, 300);
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Gagal menghapus tabel");
      }
    } catch {
      alert("Gagal menghapus tabel");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
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
      {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
    </button>
  );
}
