"use client";

import { useEffect, useState, useCallback } from "react";

const TOKEN = "gaung-export-2026";
const API = "/api/v3";

interface Insight {
  type: string;
  title: string;
  severity: string;
  [key: string]: any;
}

interface PipelineStatus {
  layer: string;
  icon: string;
  label: string;
  status: "idle" | "running" | "done" | "error";
  rows?: number;
  time?: string;
  insight?: string;
}

export default function V3Page() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pipeline, setPipeline] = useState<PipelineStatus[]>([
    { layer: "source", icon: "📁", label: "Upload CSV", status: "idle" },
    { layer: "bronze", icon: "🥉", label: "Bronze (MinIO)", status: "idle" },
    { layer: "silver", icon: "🥈", label: "Silver (dbt SCD2)", status: "idle" },
    { layer: "gold", icon: "🥇", label: "Gold (Dashboard)", status: "idle" },
    { layer: "insight", icon: "🧠", label: "Auto-Insight AI", status: "idle" },
  ]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [narrative, setNarrative] = useState("");
  const [tableName, setTableName] = useState("");
  const [summary, setSummary] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const updateStep = (i: number, update: Partial<PipelineStatus>) => {
    setPipeline((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...update } : s)));
  };

  const handleUpload = useCallback(async () => {
    if (!file) return;
    setUploading(true);
    setError("");
    setInsights([]);
    setNarrative("");

    const sourceName = file.name.replace(/\.(csv|xlsx|xls)$/i, "").replace(/[^a-zA-Z0-9_]/g, "_");
    setTableName(sourceName);

    // Step 1: Upload → Bronze
    updateStep(0, { status: "running" });
    updateStep(1, { status: "running" });

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("sourceName", sourceName);
      formData.append("token", TOKEN);

      const uploadRes = await fetch(`/api/v3/upload`, {
        method: "POST",
        body: formData,
      });
      const bronze = await uploadRes.json();

      if (bronze.error) throw new Error(bronze.error);

      updateStep(1, {
        status: "done",
        rows: bronze.rows,
        time: bronze.time,
      });

      // Step 2: Run dbt → Silver
      updateStep(2, { status: "running" });
      const silverRes = await fetch(`${API}/pipeline?step=silver&table=${sourceName}&token=${TOKEN}`);
      const silver = await silverRes.json();

      if (silver.error) throw new Error(silver.error);

      updateStep(2, {
        status: "done",
        rows: silver.rows,
        time: silver.time,
      });

      // Step 3: Run dbt → Gold
      updateStep(3, { status: "running" });
      const goldRes = await fetch(`${API}/pipeline?step=gold&table=${sourceName}&token=${TOKEN}`);
      const gold = await goldRes.json();

      if (gold.error) throw new Error(gold.error);

      updateStep(3, {
        status: "done",
        rows: gold.rows,
        time: gold.time,
      });

      // Step 4: Auto-Insight
      updateStep(4, { status: "running" });
      const insightRes = await fetch(`${API}?endpoint=insight&table=${sourceName}&layer=bronze&token=${TOKEN}`);
      const insight = await insightRes.json();

      setInsights(insight.insights || []);
      setNarrative(insight.narrative || "");

      updateStep(4, {
        status: "done",
        insight: `${insight.insights_count || 0} insight ditemukan`,
      });

      // Get summary
      const dashRes = await fetch(`${API}?endpoint=dashboard&token=${TOKEN}`);
      const dash = await dashRes.json();
      setSummary(dash);
    } catch (e: any) {
      setError(e.message);
      updateStep(1, { status: "error" });
      updateStep(2, { status: "idle" });
      updateStep(3, { status: "idle" });
      updateStep(4, { status: "idle" });
    }
    setUploading(false);
  }, [file]);

  const pipelineRunning = pipeline.some((s) => s.status === "running");
  const pipelineDone = pipeline.every((s) => s.status === "done");

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold">⚡ Gaung V3</h1>
        <p className="text-gray-500 mt-1">Upload CSV → Lakehouse → Auto-Insight dalam hitungan detik</p>
      </div>

      {/* Upload Area */}
      <div className="bg-white border-2 border-dashed border-gray-300 rounded-2xl p-8 mb-6 text-center hover:border-blue-400 transition-colors">
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="hidden"
          id="v3-upload"
        />
        <label htmlFor="v3-upload" className="cursor-pointer">
          <div className="text-4xl mb-3">📤</div>
          <div className="text-lg font-medium">
            {file ? file.name : "Klik untuk upload CSV atau Excel"}
          </div>
          <div className="text-sm text-gray-400 mt-1">
            {file ? `${(file.size / 1024).toFixed(1)} KB` : "Maks 50MB · CSV, XLSX"}
          </div>
        </label>

        {file && !pipelineRunning && (
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="mt-4 px-8 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 transition-all"
          >
            🚀 Proses dengan V3 Lakehouse
          </button>
        )}
      </div>

      {/* Pipeline Progress */}
      <div className="bg-white border rounded-2xl p-6 mb-6">
        <h2 className="font-semibold text-lg mb-4">⚙️ Pipeline Status</h2>
        <div className="space-y-3">
          {pipeline.map((step, i) => (
            <div
              key={step.layer}
              className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                step.status === "running"
                  ? "bg-blue-50 border border-blue-200 animate-pulse"
                  : step.status === "done"
                  ? "bg-green-50 border border-green-200"
                  : step.status === "error"
                  ? "bg-red-50 border border-red-200"
                  : "bg-gray-50 border border-gray-100"
              }`}
            >
              <div className="text-2xl w-10 text-center">{step.icon}</div>
              <div className="flex-1">
                <div className="font-medium text-sm">{step.label}</div>
                {step.status === "running" && (
                  <div className="text-xs text-blue-600">Memproses...</div>
                )}
                {step.status === "done" && step.rows && (
                  <div className="text-xs text-green-600">
                    {step.rows.toLocaleString()} baris · {step.time}
                  </div>
                )}
                {step.status === "done" && step.insight && (
                  <div className="text-xs text-purple-600">{step.insight}</div>
                )}
                {step.status === "error" && (
                  <div className="text-xs text-red-600">Gagal</div>
                )}
              </div>
              <div className="text-lg">
                {step.status === "idle" && "○"}
                {step.status === "running" && "⏳"}
                {step.status === "done" && "✅"}
                {step.status === "error" && "❌"}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-red-700 text-sm">
          ❌ {error}
        </div>
      )}

      {/* Auto-Insight */}
      {pipelineDone && narrative && (
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
            🧠 Auto-Insight Engine
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
              ML-Powered
            </span>
          </h2>
          {insights.map((ins, i) => (
            <div
              key={i}
              className={`inline-block px-3 py-1.5 rounded-lg text-sm mr-2 mb-2 ${
                ins.severity === "critical"
                  ? "bg-red-100 text-red-700"
                  : ins.severity === "warning"
                  ? "bg-yellow-100 text-yellow-700"
                  : "bg-blue-100 text-blue-700"
              }`}
            >
              {ins.title}
            </div>
          ))}
          <div className="text-gray-700 leading-relaxed whitespace-pre-line mt-3 text-sm">
            {narrative}
          </div>
        </div>
      )}

      {/* Summary Stats */}
      {pipelineDone && Object.keys(summary).length > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          <MiniStat label="Baris" value={summary.total_readings || "?"} />
          <MiniStat label="Kolom" value={summary.total_devices || "?"} />
          <MiniStat label="Anomali" value={summary.anomalous_readings || "0"} alert />
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="bg-white border rounded-xl p-3 text-center">
      <div className={`text-xl font-bold ${alert ? "text-red-600" : ""}`}>{value}</div>
      <div className="text-xs text-gray-400">{label}</div>
    </div>
  );
}
