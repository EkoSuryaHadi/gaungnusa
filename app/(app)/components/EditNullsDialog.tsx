"use client";

import { useState } from "react";
import { X, Save, AlertTriangle } from "lucide-react";
import { authFetch } from "@/lib/auth-client";

interface NullRow {
  rowIndex: number;
  deviceId: string;
  timestamp: string;
  columns: { name: string; currentValue: unknown }[];
}

interface EditNullsDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  layer: string;
  table: string;
  nullRows: NullRow[];
}

export default function EditNullsDialog({
  open,
  onClose,
  onSaved,
  layer,
  table,
  nullRows,
}: EditNullsDialogProps) {
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  function handleChange(rowIndex: number, colName: string, value: string) {
    setEditValues((prev) => ({
      ...prev,
      [`${rowIndex}|${colName}`]: value,
    }));
  }

  async function handleSave() {
    setSaving(true);
    setError("");

    // Build rows payload
    const rows = nullRows.map((nr) => {
      const values: Record<string, unknown> = {};
      for (const col of nr.columns) {
        const key = `${nr.rowIndex}|${col.name}`;
        if (editValues[key]) {
          values[col.name] = parseFloat(editValues[key]) || editValues[key];
        }
      }
      return { deviceId: nr.deviceId, timestamp: nr.timestamp, values };
    }).filter(r => Object.keys(r.values).length > 0);

    if (rows.length === 0) {
      setError("Isi minimal satu nilai yang kosong.");
      setSaving(false);
      return;
    }

    try {
      const res = await authFetch(
        `/api/lakehouse/${layer}/${table}/rows`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows }),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Gagal menyimpan");
      }

      onSaved();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative glass border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Edit Data Kosong</h2>
              <p className="text-xs text-slate-400">
                {nullRows.length} baris memiliki data null — isi nilainya
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Table */}
        <div className="overflow-auto flex-1 p-5">
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50 text-left">
                  <th className="py-2 pr-4 text-slate-500 font-medium">Device</th>
                  <th className="py-2 pr-4 text-slate-500 font-medium whitespace-nowrap">
                    Timestamp
                  </th>
                  {nullRows[0]?.columns.map((col) => (
                    <th
                      key={col.name}
                      className="py-2 pr-4 text-slate-500 font-medium"
                    >
                      {col.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {nullRows.map((nr) => (
                  <tr
                    key={nr.rowIndex}
                    className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors"
                  >
                    <td className="py-2 pr-4 text-slate-300 font-mono text-xs">
                      {nr.deviceId}
                    </td>
                    <td className="py-2 pr-4 text-slate-400 text-xs whitespace-nowrap">
                      {new Date(nr.timestamp).toLocaleString("id-ID", {
                        timeZone: "Asia/Makassar",
                        dateStyle: "short",
                        timeStyle: "medium",
                      })}
                    </td>
                    {nr.columns.map((col) => (
                      <td key={col.name} className="py-2 pr-4">
                        {col.currentValue === null ? (
                          <input
                            type="text"
                            placeholder="Isi nilai..."
                            className="w-28 px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-white text-xs focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-all"
                            value={
                              editValues[`${nr.rowIndex}|${col.name}`] || ""
                            }
                            onChange={(e) =>
                              handleChange(
                                nr.rowIndex,
                                col.name,
                                e.target.value
                              )
                            }
                          />
                        ) : (
                          <span className="text-slate-300 text-xs">
                            {String(col.currentValue)}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-700/50">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-700 text-slate-400 text-sm hover:bg-slate-800 transition-colors"
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-500 text-slate-950 text-sm font-bold hover:bg-emerald-400 disabled:opacity-50 transition-all"
          >
            <Save className="w-4 h-4" />
            {saving ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </div>
    </div>
  );
}
