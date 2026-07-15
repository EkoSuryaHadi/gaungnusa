"use client";

import { useEffect, useState } from "react";

const TOKEN = "gaung-export-2026";

interface V3Dashboard {
  total_devices: string;
  total_readings: string;
  overall_avg_temp: string;
  overall_avg_humidity: string;
  anomalous_readings: string;
  total_missing_values: string;
  devices_with_anomalies: string;
  low_battery_devices: string;
  overvoltage_devices: string;
  v3_status: string;
}

export default function V3Page() {
  const [dashboard, setDashboard] = useState<V3Dashboard | null>(null);
  const [insight, setInsight] = useState<string>("");
  const [lineage, setLineage] = useState<{ nodes: number; edges: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [dashRes, insightRes, lineageRes] = await Promise.all([
          fetch(`/api/v3?endpoint=dashboard&token=${TOKEN}`),
          fetch(`/api/v3?endpoint=insight&table=iot_device_summary&layer=gold&token=${TOKEN}`),
          fetch(`/api/lineage?token=${TOKEN}`),
        ]);

        const dash = await dashRes.json();
        const ins = await insightRes.json();
        const lin = await lineageRes.json();

        setDashboard(dash);
        setInsight(ins.narrative || "");
        setLineage({ nodes: lin.nodes?.length || 0, edges: lin.edges?.length || 0 });
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-pulse text-2xl">🔄 Memuat V3 Dashboard...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">⚡ Gaung V3</h1>
          <p className="text-green-600 flex items-center gap-1 mt-1">
            <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
            Production — DuckDB + MinIO + Dagster
          </p>
        </div>
        <div className="text-right text-sm text-gray-500">
          <div>Lineage: {lineage?.nodes} nodes · {lineage?.edges} edges</div>
          <a href="/" className="text-blue-500 hover:underline">← Kembali ke V2</a>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Devices" value={dashboard?.total_devices || "0"} icon="📡" />
        <StatCard label="Total Readings" value={dashboard?.total_readings || "0"} icon="📊" />
        <StatCard label="Avg Temperature" value={`${dashboard?.overall_avg_temp || "0"}°C`} icon="🌡️" />
        <StatCard label="Avg Humidity" value={`${dashboard?.overall_avg_humidity || "0"}%`} icon="💧" />
      </div>

      {/* Alerts */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <AlertCard
          label="Anomalies"
          value={dashboard?.anomalous_readings || "0"}
          color="red"
          icon="🚨"
        />
        <AlertCard
          label="Low Battery"
          value={dashboard?.low_battery_devices || "0"}
          color="yellow"
          icon="🔋"
        />
        <AlertCard
          label="Missing Values"
          value={dashboard?.total_missing_values || "0"}
          color="orange"
          icon="⚠️"
        />
      </div>

      {/* Auto-Insight */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-xl p-6 mb-6">
        <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
          🧠 Auto-Insight Engine
          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">ML-Powered</span>
        </h2>
        <div className="text-gray-700 leading-relaxed whitespace-pre-line text-sm">
          {insight || "Menunggu data..."}
        </div>
      </div>

      {/* Architecture */}
      <div className="grid grid-cols-4 gap-3 text-center text-sm">
        <LayerBadge layer="SOURCE" icon="📁" desc="CSV Upload" />
        <LayerBadge layer="BRONZE" icon="🥉" desc="Parquet + MinIO" />
        <LayerBadge layer="SILVER" icon="🥈" desc="dbt SCD Type 2" />
        <LayerBadge layer="GOLD" icon="🥇" desc="Incremental Views" />
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="bg-white border rounded-xl p-4 shadow-sm">
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}

function AlertCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string;
  color: string;
  icon: string;
}) {
  const bgColor = color === "red" ? "bg-red-50" : color === "yellow" ? "bg-yellow-50" : "bg-orange-50";
  const borderColor = color === "red" ? "border-red-200" : color === "yellow" ? "border-yellow-200" : "border-orange-200";
  const textColor = color === "red" ? "text-red-700" : color === "yellow" ? "text-yellow-700" : "text-orange-700";

  return (
    <div className={`${bgColor} ${borderColor} border rounded-xl p-4`}>
      <div className="text-2xl mb-1">{icon}</div>
      <div className={`text-xl font-bold ${textColor}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}

function LayerBadge({ layer, icon, desc }: { layer: string; icon: string; desc: string }) {
  return (
    <div className="bg-white border rounded-lg p-3 shadow-sm">
      <div className="text-xl">{icon}</div>
      <div className="font-semibold text-xs mt-1">{layer}</div>
      <div className="text-xs text-gray-400">{desc}</div>
    </div>
  );
}
