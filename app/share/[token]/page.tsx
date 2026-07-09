"use client";

import { useEffect, useState } from "react";
import { notFound } from "next/navigation";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  LineChart, Line,
  AreaChart, Area,
} from "recharts";

const CHART_COLORS = ["#10b981", "#f59e0b", "#3b82f6", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

interface WidgetData {
  id: number;
  type: string;
  title: string;
  cfg: any;
  rows: any[];
}

export default function PublicDashboardPage({ params }: { params: Promise<{ token: string }> }) {
  const [dashboard, setDashboard] = useState<{ name: string; widgets: WidgetData[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    params.then(({ token }) => {
      fetch(`/api/public/dashboards/${token}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.error) { setError(true); return; }
          setDashboard(data);
        })
        .catch(() => setError(true))
        .finally(() => setLoading(false));
    });
  }, []);

  if (loading) return <div className="min-h-screen bg-[#0b0f1f] flex items-center justify-center"><div className="text-slate-400">Loading...</div></div>;
  if (error || !dashboard) return <div className="min-h-screen bg-[#0b0f1f] flex items-center justify-center"><div className="text-red-400">Dashboard not found or not shared</div></div>;

  return (
    <div className="min-h-screen bg-[#0b0f1f] text-slate-200">
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-indigo-500 flex items-center justify-center text-white font-bold text-sm">G</div>
            <div>
              <h1 className="font-bold text-white text-lg">{dashboard.name}</h1>
              <p className="text-xs text-slate-500">Shared Dashboard · Read-only</p>
            </div>
          </div>
          <div className="text-xs text-slate-500">Powered by <span className="text-emerald-400 font-medium">Gaung</span></div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))" }}>
          {dashboard.widgets.map((w) => {
            const hasLive = w.rows && w.rows.length > 0;
            return (
              <div key={w.id} className="glass p-4 border-slate-800 rounded-xl flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white">{w.title}</h3>
                  <span className="text-[10px] uppercase text-slate-500 bg-slate-800/50 px-2 py-0.5 rounded">{w.type}</span>
                </div>
                {w.type === "KPI" && (
                  <div className="flex flex-col items-center py-4 flex-1">
                    {hasLive ? (
                      <span className="text-4xl font-extrabold text-emerald-400 tabular-nums">
                        {(() => {
                          const val = w.rows[0][w.cfg.field || w.cfg.xField];
                          if (val === undefined) return w.rows.length;
                          return typeof val === "number" ? val.toLocaleString("en-US", Number.isInteger(val) ? undefined : { minimumFractionDigits: 2 }) : val;
                        })()}
                      </span>
                    ) : <span className="text-3xl text-slate-500">--</span>}
                  </div>
                )}
                {w.type === "TABLE" && hasLive && (
                  <div className="overflow-auto max-h-64 text-xs">
                    <table className="w-full text-slate-300">
                      <thead><tr className="border-b border-slate-700">{Object.keys(w.rows[0]).map((k) => <th key={k} className="px-2 py-1.5 text-left text-slate-400 font-medium">{k}</th>)}</tr></thead>
                      <tbody>{w.rows.slice(0, 50).map((row: any, i: number) => <tr key={i} className="border-b border-slate-800/50">{Object.keys(w.rows[0]).map((k) => <td key={k} className="px-2 py-1.5 whitespace-nowrap">{String(row[k] ?? "")}</td>)}</tr>)}</tbody>
                    </table>
                  </div>
                )}
                {w.type === "BAR" && hasLive && (
                  <div className="flex-1 min-h-0">
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={w.rows} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey={w.cfg.xField} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                        <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                        <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: "8px", fontSize: 12 }} />
                        <Bar dataKey={w.cfg.yField} fill={w.cfg.color || "#10b981"} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {w.type === "PIE" && hasLive && (
                  <div className="flex-1 min-h-0">
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie data={w.rows} dataKey={w.cfg.yField} nameKey={w.cfg.xField} cx="50%" cy="50%" outerRadius={90}>
                          {w.rows.map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: "8px", fontSize: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {w.type === "LINE" && hasLive && (
                  <div className="flex-1 min-h-0">
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart data={w.rows} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey={w.cfg.xField} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                        <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                        <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: "8px", fontSize: 12 }} />
                        <Line type="monotone" dataKey={w.cfg.yField} stroke={w.cfg.color || "#10b981"} strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {w.type === "AREA" && hasLive && (
                  <div className="flex-1 min-h-0">
                    <ResponsiveContainer width="100%" height={280}>
                      <AreaChart data={w.rows} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey={w.cfg.xField} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                        <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                        <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: "8px", fontSize: 12 }} />
                        <Area type="monotone" dataKey={w.cfg.yField} stroke={w.cfg.color || "#10b981"} fill={w.cfg.color || "#10b981"} fillOpacity={0.15} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
