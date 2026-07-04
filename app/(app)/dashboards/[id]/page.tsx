"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  LineChart, Line,
  AreaChart, Area,
} from "recharts";

interface Widget {
  id: number;
  type: string;
  title: string;
  config: string;
  gridX: number;
  gridY: number;
  gridW: number;
  gridH: number;
}

interface Dashboard {
  id: number;
  name: string;
  description: string | null;
  metabaseId?: number | null;
  metabaseUrl?: string | null;
  sourceTable?: string | null;
  sourceLayer?: string | null;
  widgets: Widget[];
}

const CHART_COLORS = ["#10b981", "#f59e0b", "#3b82f6", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

export default function DashboardViewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [widgetData, setWidgetData] = useState<Record<number, { rows: any[]; sql: string }>>({});
  const [dataLoading, setDataLoading] = useState(false);

  const [shareInfo, setShareInfo] = useState<{ isPublic: boolean; shareUrl: string | null } | null>(null);
  const [showShareCopied, setShowShareCopied] = useState(false);

  useEffect(() => {
    fetch("/api/dashboards/" + params.id)
      .then((r) => { if (r.status === 401) { router.push("/login"); return null; } return r.json(); })
      .then((d: Dashboard | null) => {
        if (d) {
          setDashboard(d);
          loadWidgetData(d);
        }
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));

    // Load share info
    fetch(`/api/dashboards/${params.id}/share`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          setShareInfo({
            isPublic: data.isPublic,
            shareUrl: data.shareUrl ? `${window.location.origin}${data.shareUrl}` : null,
          });
        }
      })
      .catch(() => {});
  }, [params.id, router]);

  async function loadWidgetData(d: Dashboard) {
    setDataLoading(true);
    const data: Record<number, { rows: any[]; sql: string }> = {};

    for (const w of d.widgets) {
      const cfg = parseConfig(w.config);
      if (cfg.layer && cfg.table) {
        try {
          let query = cfg.query || null;
          if (!query && w.type === "KPI" && (cfg.kpiField || cfg.xField || cfg.aggregation)) {
            const qLayer = `"${cfg.layer.toLowerCase()}"`;
            const qTable = `"${cfg.table}"`;
            const field = cfg.kpiField || cfg.xField;
            const agg = (cfg.aggregation || cfg.yField || "SUM").toUpperCase();

            // Build WHERE clause from filter
            let whereClause = "";
            if (cfg.filterField && cfg.filterValue) {
              const isNumeric = /^-?\d+(\.\d+)?$/.test(cfg.filterValue);
              const filterVal = isNumeric ? cfg.filterValue : `'${cfg.filterValue.replace(/'/g, "''")}'`;
              whereClause = ` WHERE "${cfg.filterField}" = ${filterVal}`;
            }

            if (agg === "COUNT" && (!field || field === "COUNT(*)")) {
              query = `SELECT COUNT(*) as "count" FROM ${qLayer}.${qTable}${whereClause}`;
            } else if (field) {
              const validAggs = ["SUM", "AVG", "MIN", "MAX", "COUNT"];
              const fn = validAggs.includes(agg) ? agg : "SUM";
              query = `SELECT ${fn}("${field}") as "${field}" FROM ${qLayer}.${qTable}${whereClause}`;
            }
          }

          const res = await fetch("/api/dashboards/" + d.id + "/data", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              layer: cfg.layer,
              table: cfg.table,
              query: query,
            }),
          });
          if (res.ok) {
            const result = await res.json();
            if (result.rows) {
              data[w.id] = { rows: result.rows, sql: result.sql };
            }
          }
        } catch {}
      }
    }
    setWidgetData(data);
    setDataLoading(false);
  }

  const parseConfig = (c: string) => {
    try {
      const raw = JSON.parse(c);
      if (raw.dataSource && !raw.layer) {
        const [layer, ...rest] = raw.dataSource.split("/");
        raw.layer = (layer || "").toLowerCase();
        raw.table = rest.join("/") || "";
      }
      if (raw.xField && !raw.field) raw.field = raw.xField;
      if (!raw.label && raw.field) raw.label = raw.field.replace(/_/g, " ");
      if (!raw.value && raw.field) raw.value = raw.field;
      return raw;
    } catch { return {}; }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="text-slate-400">Loading...</div></div>;
  if (error || !dashboard) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="glass p-8 text-center">
        <p className="text-red-400">{error || "Not found"}</p>
        <Link href="/dashboards" className="text-emerald-400">← Back</Link>
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <Link href="/dashboards" className="text-sm text-slate-400 hover:text-white">← Dashboards</Link>
            <span className="text-slate-600">/</span>
            <span className="text-sm text-white font-medium truncate">{dashboard.name}</span>
          </div>
          {dashboard.description && <p className="text-sm text-slate-400">{dashboard.description}</p>}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => loadWidgetData(dashboard)}
            disabled={dataLoading}
            className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-sm hover:bg-slate-700 disabled:opacity-50"
          >
            {dataLoading ? "Loading..." : "🔄 Refresh Data"}
          </button>
          <a
            href={`/api/dashboards/${dashboard.id}/export`}
            download
            className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-sm hover:bg-slate-700"
          >
            📥 Export CSV
          </a>
          <button
            onClick={() => window.open(`/dashboards/${dashboard.id}/print`, "_blank")}
            className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-sm hover:bg-slate-700"
          >
            📄 Export PDF
          </button>
          <button
            onClick={async () => {
              try {
                const res = await fetch(`/api/dashboards/${dashboard.id}/share`, { method: "POST" });
                if (res.ok) {
                  const data = await res.json();
                  setShareInfo({ isPublic: data.isPublic, shareUrl: data.shareUrl });
                  if (data.shareUrl) {
                    const origin = window.location.origin;
                    setShareInfo({ isPublic: true, shareUrl: `${origin}${data.shareUrl}` });
                  }
                }
              } catch {}
            }}
            className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-sm hover:bg-slate-700"
          >
            {shareInfo?.isPublic ? "🔗 Unshare" : "🔗 Share"}
          </button>
          <Link href={`/dashboards/new?edit=${dashboard.id}`} className="px-4 py-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-sm font-medium hover:bg-emerald-500/30">
            ✏️ Edit
          </Link>
          <Link href="/dashboards" className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-sm hover:bg-slate-700">
            📋 All Dashboards
          </Link>
          <button
            onClick={async () => {
              if (!confirm("Delete this dashboard?")) return;
              await fetch(`/api/dashboards/${dashboard.id}`, { method: "DELETE" });
              router.push("/dashboards");
            }}
            className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-500/20"
          >
            🗑️ Delete
          </button>
        </div>
      </div>

      {/* Share URL Banner */}
      {shareInfo?.isPublic && shareInfo.shareUrl && (
        <div className="glass p-4 border-emerald-500/30 rounded-xl flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-emerald-400 text-sm font-medium">🔗 Public link:</span>
            <code className="text-slate-300 text-xs bg-slate-800 px-3 py-1 rounded-lg truncate max-w-md">
              {shareInfo.shareUrl}
            </code>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(shareInfo.shareUrl!);
                setShowShareCopied(true);
                setTimeout(() => setShowShareCopied(false), 2000);
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-700 border border-slate-600 text-slate-300 text-xs hover:bg-slate-600"
            >
              {showShareCopied ? "✅ Copied!" : "📋 Copy"}
            </button>
            <button
              onClick={async () => {
                const res = await fetch(`/api/dashboards/${dashboard.id}/share`, { method: "POST" });
                if (res.ok) {
                  const data = await res.json();
                  setShareInfo({ isPublic: data.isPublic, shareUrl: data.shareUrl ? `${window.location.origin}${data.shareUrl}` : null });
                }
              }}
              className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs hover:bg-red-500/20"
            >
              Disable Sharing
            </button>
          </div>
        </div>
      )}

      {/* Widget Grid */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))" }}>
        {dashboard.widgets.map((w) => {
          const cfg = parseConfig(w.config);
          const liveData = widgetData[w.id];
          const hasLive = liveData && liveData.rows && liveData.rows.length > 0;

          return (
            <div key={w.id} className="glass p-4 border-slate-800 rounded-xl flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white">{w.title}</h3>
                <span className="text-[10px] uppercase text-slate-500 bg-slate-800/50 px-2 py-0.5 rounded">
                  {w.type} {hasLive && <span className="text-emerald-400 ml-1">● LIVE</span>}
                </span>
              </div>

              {/* KPI Widget */}
              {w.type === "KPI" && (
                <div className="flex flex-col items-center py-4 flex-1">
                  {hasLive ? (
                    <>
                      <span className="text-4xl font-extrabold text-emerald-400 tabular-nums">
                        {(() => {
                          // Find the right column: try cfg.field, then kpiField, then "count", then first numeric
                          let field = cfg.field || cfg.kpiField;
                          if (!field || liveData.rows[0][field] === undefined) {
                            // Auto-detect: look for "count" or first numeric column
                            const keys = Object.keys(liveData.rows[0] || {});
                            field = keys.find(k => k.toLowerCase().includes("count")) 
                                 || keys.find(k => typeof liveData.rows[0][k] === "number")
                                 || keys[0];
                          }
                          const val = liveData.rows[0][field];
                          if (val === undefined || val === null) return liveData.rows.length;
                          if (typeof val === "number") {
                            return Number.isInteger(val) ? val.toLocaleString("en-US") : val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                          }
                          return val;
                        })()}
                      </span>
                      <span className="text-xs text-slate-400 mt-1">{cfg.label || "from " + cfg.table}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-3xl font-extrabold text-emerald-400">{cfg.value || "--"}</span>
                      <span className="text-xs text-slate-400 mt-1">{cfg.label || ""}</span>
                    </>
                  )}
                </div>
              )}

              {/* Table Widget */}
              {w.type === "TABLE" && (
                <div className="overflow-auto max-h-64 text-xs">
                  {hasLive ? (
                    <table className="w-full text-slate-300">
                      <thead>
                        <tr className="border-b border-slate-700">
                          {Object.keys(liveData.rows[0]).map((k) => (
                            <th key={k} className="px-2 py-1.5 text-left text-slate-400 font-medium">{k}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {liveData.rows.slice(0, 50).map((row, i) => (
                          <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                            {Object.keys(liveData.rows[0]).map((k) => (
                              <td key={k} className="px-2 py-1.5 whitespace-nowrap">{String(row[k] ?? "")}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : cfg.rows ? (
                    <table className="w-full text-slate-300">
                      <thead><tr className="border-b border-slate-700">{(Object.keys(cfg.rows[0] || {}) as string[]).map((c) => <th key={c} className="px-2 py-1 text-left text-slate-400">{c}</th>)}</tr></thead>
                      <tbody>{cfg.rows.map((row: any, i: number) => <tr key={i} className="border-b border-slate-800/50">{(Object.keys(cfg.rows[0] || {}) as string[]).map((c) => <td key={c} className="px-2 py-1">{row[c]}</td>)}</tr>)}</tbody>
                    </table>
                  ) : (
                    <div className="flex items-center justify-center h-16 text-slate-500">No data source</div>
                  )}
                </div>
              )}

              {/* Text Widget */}
              {w.type === "TEXT" && (
                <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{cfg.content || ""}</p>
              )}

              {/* BAR Chart */}
              {w.type === "BAR" && (
                <div className="flex-1 min-h-0">
                  {hasLive ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={liveData.rows} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey={cfg.xField || "name"} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                        <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: "8px", fontSize: 12 }}
                          labelStyle={{ color: "#e2e8f0" }}
                        />
                        <Bar dataKey={cfg.yField || "value"} fill={cfg.color || "#10b981"} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-48 text-slate-500 text-3xl">📊</div>
                  )}
                </div>
              )}

              {/* PIE Chart */}
              {w.type === "PIE" && (
                <div className="flex-1 min-h-0">
                  {hasLive ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie
                          data={liveData.rows}
                          dataKey={cfg.yField || "value"}
                          nameKey={cfg.xField || "name"}
                          cx="50%"
                          cy="50%"
                          outerRadius={90}
                          label={({ name, percent }: any) => `${name?.slice(0, 12)} ${(percent * 100).toFixed(0)}%`}
                          labelLine={false}
                        >
                          {liveData.rows.map((_: any, i: number) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: "8px", fontSize: 12 }}
                        />
                        <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-48 text-slate-500 text-3xl">🥧</div>
                  )}
                </div>
              )}

              {/* LINE Chart */}
              {w.type === "LINE" && (
                <div className="flex-1 min-h-0">
                  {hasLive ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart data={liveData.rows} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey={cfg.xField || "name"} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                        <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: "8px", fontSize: 12 }}
                          labelStyle={{ color: "#e2e8f0" }}
                        />
                        <Line type="monotone" dataKey={cfg.yField || "value"} stroke={cfg.color || "#10b981"} strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-48 text-slate-500 text-3xl">📈</div>
                  )}
                </div>
              )}

              {/* AREA Chart */}
              {w.type === "AREA" && (
                <div className="flex-1 min-h-0">
                  {hasLive ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <AreaChart data={liveData.rows} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey={cfg.xField || "name"} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                        <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: "8px", fontSize: 12 }}
                          labelStyle={{ color: "#e2e8f0" }}
                        />
                        <Area type="monotone" dataKey={cfg.yField || "value"} stroke={cfg.color || "#10b981"} fill={cfg.color || "#10b981"} fillOpacity={0.15} />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-48 text-slate-500 text-3xl">📉</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
