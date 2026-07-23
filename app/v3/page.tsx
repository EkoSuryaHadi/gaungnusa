"use client";

import { useEffect, useState } from "react";

const TOKEN = "gaung-export-2026";

interface TableInfo {
  name: string;
  rows: number;
  layer: string;
}

interface InsightResult {
  insights: any[];
  narrative: string;
  rows_analyzed: number;
}

export default function V3Dashboard() {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [insight, setInsight] = useState<InsightResult | null>(null);
  const [lineage, setLineage] = useState<{ nodes: number; edges: number }>({ nodes: 0, edges: 0 });
  const [loading, setLoading] = useState(true);
  const [insightLoading, setInsightLoading] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [tablesRes, lineageRes] = await Promise.all([
          fetch(`/api/v3/tables?token=${TOKEN}`),
          fetch(`/api/lineage?token=${TOKEN}`),
        ]);
        const tablesData = await tablesRes.json();
        const lineageData = await lineageRes.json();

        setTables(tablesData.tables || []);
        setLineage({ nodes: lineageData.nodes?.length || 0, edges: lineageData.edges?.length || 0 });
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    }
    load();
  }, []);

  async function runInsight(tableName: string) {
    setSelectedTable(tableName);
    setInsightLoading(true);
    try {
      const res = await fetch(`/api/v3?endpoint=insight&table=${tableName}&token=${TOKEN}`);
      const data = await res.json();
      setInsight(data);
    } catch (e) {
      console.error(e);
    }
    setInsightLoading(false);
  }

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin text-4xl mb-4">⚡</div>
        <div className="text-xl">Memuat Gaung V3...</div>
      </div>
    );
  }

  const totalRows = tables.reduce((sum, t) => sum + t.rows, 0);
  const goldTables = tables.filter((t) => t.layer === "gold");
  const silverTables = tables.filter((t) => t.layer === "silver");
  const bronzeTables = tables.filter((t) => t.layer === "bronze");

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">⚡ Gaung V3</h1>
          <p className="text-green-600 flex items-center gap-1 mt-1">
            <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
            Full V3 — DuckDB + MinIO + Dagster
          </p>
        </div>
        <div className="text-right text-sm text-gray-500">
          <div>
            {tables.length} tabel · {totalRows.toLocaleString()} baris
          </div>
          <div>
            Lineage: {lineage.nodes} nodes · {lineage.edges} edges
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-8">
        <StatCard label="Total Tabel" value={tables.length.toString()} icon="📊" />
        <StatCard label="Total Baris" value={totalRows.toLocaleString()} icon="📋" />
        <StatCard
          label="🥇 Gold"
          value={goldTables.length.toString()}
          sub={`${goldTables.reduce((s, t) => s + t.rows, 0).toLocaleString()} rows`}
          icon="🥇"
        />
        <StatCard
          label="🥈 Silver"
          value={silverTables.length.toString()}
          sub={`${silverTables.reduce((s, t) => s + t.rows, 0).toLocaleString()} rows`}
          icon="🥈"
        />
      </div>

      {/* Tables Grid */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          🗄️ Data Lakehouse
          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">33 tables migrated</span>
        </h2>

        {["gold", "silver", "bronze"].map((layer) => {
          const layerTables = tables.filter((t) => t.layer === layer);
          if (layerTables.length === 0) return null;
          const icons: Record<string, string> = { gold: "🥇", silver: "🥈", bronze: "🥉" };
          return (
            <div key={layer} className="mb-4">
              <h3 className="text-sm font-medium text-gray-500 mb-2 uppercase">
                {icons[layer]} {layer} Layer
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {layerTables.map((t) => (
                  <button
                    key={t.name}
                    onClick={() => runInsight(t.name)}
                    className={`text-left p-3 rounded-xl border transition-all text-sm hover:border-blue-300 hover:bg-blue-50 ${
                      selectedTable === t.name
                        ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200"
                        : "border-gray-200 bg-white"
                    }`}
                  >
                    <div className="font-medium truncate">{t.name}</div>
                    <div className="text-xs text-gray-400">{t.rows.toLocaleString()} rows</div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Auto-Insight Panel */}
      {selectedTable && (
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-2xl p-6">
          <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
            🧠 Auto-Insight: {selectedTable}
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">ML</span>
          </h2>
          {insightLoading ? (
            <div className="animate-pulse text-gray-500">Menganalisis...</div>
          ) : insight ? (
            <>
              {insight.insights?.map((ins: any, i: number) => (
                <span
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
                </span>
              ))}
              <div className="text-gray-700 whitespace-pre-line text-sm mt-3">
                {insight.narrative}
              </div>
              <div className="text-xs text-gray-400 mt-2">
                {insight.rows_analyzed?.toLocaleString()} rows analyzed
              </div>
            </>
          ) : (
            <div className="text-gray-400 text-sm">Klik run insight untuk analisis</div>
          )}
        </div>
      )}

      {/* Upload CTA */}
      <div className="mt-8 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-6 text-center">
        <h3 className="text-lg font-semibold mb-2">📤 Upload Data Baru</h3>
        <p className="text-sm text-gray-500 mb-4">
          Drag &amp; drop CSV, Excel — langsung diproses Bronze → Silver → Gold + Auto-Insight
        </p>
        <a
          href="/v3/upload"
          className="inline-block px-6 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-all"
        >
          🚀 Upload &amp; Proses
        </a>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  sub,
}: {
  label: string;
  value: string;
  icon: string;
  sub?: string;
}) {
  return (
    <div className="bg-white border rounded-xl p-4 shadow-sm">
      <div className="text-2xl mb-1">{icon}</div>
      <div className={`font-bold ${sub ? "text-xl" : "text-2xl"}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}
