"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { authFetch, clearAuth } from "@/lib/auth-client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  LineChart, Line,
  AreaChart, Area,
} from "@/components/charts";

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
  widgets: Widget[];
}

const CHART_COLORS = ["#10b981", "#f59e0b", "#3b82f6", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

export default function PrintDashboardPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [widgetData, setWidgetData] = useState<Record<number, { rows: any[]; sql: string }>>({});

  useEffect(() => {
    authFetch("/api/dashboards/" + params.id)
      .then((r) => {
        if (r.status === 401) {
          clearAuth();
          router.push("/login");
          return;
        }
        return r.json();
      })
      .then((d: Dashboard) => {
        setDashboard(d);
        loadWidgetData(d);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [params.id]);

  async function loadWidgetData(d: Dashboard) {
    const data: Record<number, { rows: any[]; sql: string }> = {};

    for (const w of d.widgets) {
      const cfg = parseConfig(w.config);
      if (cfg.layer && cfg.table) {
        try {
          let query = cfg.query || null;
          if (!query && w.type === "KPI" && cfg.field) {
            const qLayer = `"${cfg.layer.toLowerCase()}"`;
            const qTable = `"${cfg.table}"`;
            if (cfg.field === "COUNT(*)") {
              query = `SELECT COUNT(*) as "COUNT(*)" FROM ${qLayer}.${qTable}`;
            } else if (cfg.yField) {
              const agg = (cfg.yField || "SUM").toUpperCase();
              const validAggs = ["SUM", "AVG", "MIN", "MAX", "COUNT"];
              const fn = validAggs.includes(agg) ? agg : "SUM";
              query = `SELECT ${fn}("${cfg.field}") as "${cfg.field}" FROM ${qLayer}.${qTable}`;
            }
          }

          const res = await authFetch("/api/dashboards/" + d.id + "/data", {
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

  // Auto-trigger print once data is loaded
  useEffect(() => {
    if (!loading && dashboard) {
      // Small delay to allow charts to render
      const timer = setTimeout(() => window.print(), 1500);
      return () => clearTimeout(timer);
    }
  }, [loading, dashboard]);

  if (loading) return <div className="p-8 text-center text-slate-400">Loading dashboard for printing...</div>;
  if (error || !dashboard) return <div className="p-8 text-center text-red-400">{error || "Not found"}</div>;

  return (
    <div className="p-8 print-preview" style={{ maxWidth: "100%", background: "white", color: "black" }}>
      <style>{`
        @media print {
          @page { margin: 1cm; size: A4 landscape; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print-preview { background: white !important; color: black !important; }
          .recharts-text { fill: #334155 !important; }
          .recharts-cartesian-grid line { stroke: #e2e8f0 !important; }
          .recharts-tooltip-wrapper { display: none !important; }
        }
      `}</style>

      <h1 className="text-2xl font-bold text-slate-900 mb-1">{dashboard.name}</h1>
      {dashboard.description && <p className="text-sm text-slate-600 mb-6">{dashboard.description}</p>}

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))" }}>
        {dashboard.widgets.map((w) => {
          const cfg = parseConfig(w.config);
          const liveData = widgetData[w.id];
          const hasLive = liveData && liveData.rows && liveData.rows.length > 0;

          return (
            <div key={w.id} className="border border-slate-200 rounded-lg p-4 bg-white flex flex-col" style={{ breakInside: "avoid" }}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-800">{w.title}</h3>
                <span className="text-[10px] uppercase text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{w.type}</span>
              </div>

              {w.type === "KPI" && (
                <div className="flex flex-col items-center py-4 flex-1">
                  {hasLive ? (
                    <>
                      <span className="text-4xl font-extrabold text-emerald-600 tabular-nums">
                        {(() => {
                          const val = liveData.rows[0][cfg.field];
                          if (val === undefined || val === null) return liveData.rows.length;
                          if (typeof val === "number") {
                            return Number.isInteger(val) ? val.toLocaleString("en-US") : val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                          }
                          return val;
                        })()}
                      </span>
                      <span className="text-xs text-slate-500 mt-1">{cfg.label || "from " + cfg.table}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-3xl font-extrabold text-emerald-600">{cfg.value || "--"}</span>
                      <span className="text-xs text-slate-500 mt-1">{cfg.label || ""}</span>
                    </>
                  )}
                </div>
              )}

              {w.type === "TABLE" && (
                <div className="overflow-auto max-h-64 text-xs">
                  {hasLive ? (
                    <table className="w-full text-slate-700">
                      <thead>
                        <tr className="border-b border-slate-300">
                          {Object.keys(liveData.rows[0]).map((k) => (
                            <th key={k} className="px-2 py-1.5 text-left text-slate-500 font-medium">{k}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {liveData.rows.slice(0, 50).map((row, i) => (
                          <tr key={i} className="border-b border-slate-200">
                            {Object.keys(liveData.rows[0]).map((k) => (
                              <td key={k} className="px-2 py-1.5 whitespace-nowrap">{String(row[k] ?? "")}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : cfg.rows ? (
                    <table className="w-full text-slate-700">
                      <thead><tr className="border-b border-slate-300">{(Object.keys(cfg.rows[0] || {}) as string[]).map((c) => <th key={c} className="px-2 py-1 text-left text-slate-500">{c}</th>)}</tr></thead>
                      <tbody>{cfg.rows.map((row: any, i: number) => <tr key={i} className="border-b border-slate-200">{(Object.keys(cfg.rows[0] || {}) as string[]).map((c) => <td key={c} className="px-2 py-1">{row[c]}</td>)}</tr>)}</tbody>
                    </table>
                  ) : (
                    <div className="flex items-center justify-center h-16 text-slate-400">No data source</div>
                  )}
                </div>
              )}

              {w.type === "TEXT" && (
                <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{cfg.content || ""}</p>
              )}

              {w.type === "BAR" && (
                <div className="flex-1 min-h-0">
                  {hasLive ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={liveData.rows} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey={cfg.xField || "name"} tick={{ fill: "#475569", fontSize: 11 }} />
                        <YAxis tick={{ fill: "#475569", fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey={cfg.yField || "value"} fill={cfg.color || "#10b981"} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-48 text-slate-300 text-3xl">📊</div>
                  )}
                </div>
              )}

              {w.type === "PIE" && (
                <div className="flex-1 min-h-0">
                  {hasLive ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie data={liveData.rows} dataKey={cfg.yField || "value"} nameKey={cfg.xField || "name"} cx="50%" cy="50%" outerRadius={90} label={({ name, percent }: any) => `${name?.slice(0, 12)} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                          {liveData.rows.map((_: any, i: number) => (<Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />))}
                        </Pie>
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-48 text-slate-300 text-3xl">🥧</div>
                  )}
                </div>
              )}

              {w.type === "LINE" && (
                <div className="flex-1 min-h-0">
                  {hasLive ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart data={liveData.rows} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey={cfg.xField || "name"} tick={{ fill: "#475569", fontSize: 11 }} />
                        <YAxis tick={{ fill: "#475569", fontSize: 11 }} />
                        <Tooltip />
                        <Line type="monotone" dataKey={cfg.yField || "value"} stroke={cfg.color || "#10b981"} strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-48 text-slate-300 text-3xl">📈</div>
                  )}
                </div>
              )}

              {w.type === "AREA" && (
                <div className="flex-1 min-h-0">
                  {hasLive ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <AreaChart data={liveData.rows} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey={cfg.xField || "name"} tick={{ fill: "#475569", fontSize: 11 }} />
                        <YAxis tick={{ fill: "#475569", fontSize: 11 }} />
                        <Tooltip />
                        <Area type="monotone" dataKey={cfg.yField || "value"} stroke={cfg.color || "#10b981"} fill={cfg.color || "#10b981"} fillOpacity={0.15} />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-48 text-slate-300 text-3xl">📉</div>
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
