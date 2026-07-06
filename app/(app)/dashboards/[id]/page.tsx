"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Pencil, BarChart3 } from "lucide-react";
import {
  PieChart as RePie, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line,
  AreaChart, Area
} from "recharts";
import { authFetch, clearAuth } from "@/lib/auth-client";

// ── Types ──
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

// ── Helpers ──
function parseConfig(c: string) {
  try {
    const raw = JSON.parse(c);
    if (raw.dataSource && !raw.layer) {
      const [layer, ...rest] = raw.dataSource.split("/");
      raw.layer = (layer || "").toLowerCase();
      raw.table = rest.join("/") || "";
    }
    return raw;
  } catch {
    return {};
  }
}

function formatKpiValue(val: unknown): string {
  if (typeof val === "number") return val.toLocaleString("en-US");
  if (val === null || val === undefined) return "—";
  return String(val);
}

// ── Sub-components ──

function LoadingSkeleton() {
  return (
    <div className="min-h-screen px-6 py-8" style={{ maxWidth: 1400, margin: "0 auto" }}>
      {/* Header skeleton */}
      <div style={{ marginBottom: 32 }}>
        <div className="skeleton" style={{ width: 120, height: 14, marginBottom: 16 }} />
        <div className="skeleton" style={{ width: 320, height: 36, marginBottom: 8 }} />
        <div className="skeleton" style={{ width: 200, height: 14 }} />
      </div>
      {/* Widget grid skeleton */}
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))" }}
      >
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card" style={{ padding: 24 }}>
            <div className="skeleton" style={{ width: "60%", height: 14, marginBottom: 20 }} />
            <div className="skeleton" style={{ width: "45%", height: 48, marginBottom: 12 }} />
            <div className="skeleton" style={{ width: "35%", height: 12 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div
        className="card"
        style={{
          maxWidth: 420,
          width: "100%",
          padding: "40px 32px",
          textAlign: "center",
          borderColor: "var(--clay-dim)",
          background: "var(--bg-surface)",
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 18,
            fontStyle: "italic",
            color: "var(--clay-400)",
            marginBottom: 8,
          }}
        >
          {message || "Not found"}
        </p>
        <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 20 }}>
          The dashboard you are looking for could not be loaded.
        </p>
        <Link href="/dashboards" className="btn btn-secondary">
          <ArrowLeft size={15} />
          Back to Dashboards
        </Link>
      </div>
    </div>
  );
}

function KpiWidget({ title, value }: { title: string; value: string }) {
  return (
    <div className="card-glow echo-ring" style={{ padding: "24px 28px" }}>
      <p style={{ color: "var(--text-muted)", fontSize: 12, fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 12 }}>
        {title}
      </p>
      <p
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 48,
          fontWeight: 400,
          fontStyle: "italic",
          color: "var(--gold-400)",
          lineHeight: 1.1,
          margin: 0,
        }}
      >
        {value}
      </p>
      {/* subtle echo accent line */}
      <div
        style={{
          width: 40,
          height: 1,
          background: "var(--gold-dim)",
          marginTop: 12,
        }}
      />
    </div>
  );
}

// Batik Gold color palette for charts
const CHART_COLORS = [
  "#d4a853", // gold-400
  "#8b7355", // earth
  "#5e4b3c", // dark earth  
  "#c49b3f", // warm gold
  "#6b8e6b", // sage
  "#a0522d", // sienna
  "#7b916e", // olive
  "#b87333", // copper
];

function PieChartWidget({ title, data }: { title: string; data: { name: string; value: number }[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border-subtle)" }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>{title}</span>
        </div>
        <div style={{ padding: "40px 24px", textAlign: "center", minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No data to display</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "16px 24px",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>{title}</span>
      </div>
      <div style={{ padding: "16px 8px", minHeight: 280 }}>
        <ResponsiveContainer width="100%" height={280}>
          <RePie>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
              dataKey="value"
              nameKey="name"
              label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
              labelLine={{ stroke: "var(--text-muted)", strokeWidth: 1 }}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke="var(--bg-surface)" strokeWidth={2} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "8px",
                fontSize: 12,
                color: "var(--text-primary)",
              }}
              formatter={(value: any) => [typeof value === 'number' ? value.toLocaleString() : String(value ?? ''), ""]}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, color: "var(--text-secondary)" }}
              iconType="circle"
            />
          </RePie>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function BarChartWidget({ title, data }: { title: string; data: { name: string; value: number }[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border-subtle)" }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>{title}</span>
        </div>
        <div style={{ padding: "40px 24px", textAlign: "center", minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No data to display</p>
        </div>
      </div>
    );
  }

  const maxVal = Math.max(...data.map(d => d.value));
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 24px", borderBottom: "1px solid var(--border-subtle)" }}>
        <BarChart3 size={16} style={{ color: "var(--gold-400)", flexShrink: 0 }} />
        <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>{title}</span>
      </div>
      <div style={{ padding: "16px 8px", minHeight: 280 }}>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--text-secondary)" }} angle={-25} textAnchor="end" height={60} interval={0} />
            <YAxis tick={{ fontSize: 11, fill: "var(--text-secondary)" }} domain={[0, 'auto']} />
            <Tooltip
              contentStyle={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "8px", fontSize: 12, color: "var(--text-primary)" }}
              formatter={(value: any) => [typeof value === 'number' ? value.toLocaleString() : String(value ?? ''), ""]}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={60}>
              {data.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function LineChartWidget({ title, data }: { title: string; data: { name: string; value: number }[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border-subtle)" }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>{title}</span>
        </div>
        <div style={{ padding: "40px 24px", textAlign: "center", minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No data to display</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 24px", borderBottom: "1px solid var(--border-subtle)" }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>{title}</span>
      </div>
      <div style={{ padding: "16px 8px", minHeight: 280 }}>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--text-secondary)" }} angle={-25} textAnchor="end" height={60} interval={0} />
            <YAxis tick={{ fontSize: 11, fill: "var(--text-secondary)" }} domain={[0, 'auto']} />
            <Tooltip
              contentStyle={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "8px", fontSize: 12, color: "var(--text-primary)" }}
              formatter={(value: any) => [typeof value === 'number' ? value.toLocaleString() : String(value ?? ''), ""]}
            />
            <Line type="monotone" dataKey="value" stroke={CHART_COLORS[0]} strokeWidth={2} dot={{ r: 4, fill: CHART_COLORS[0] }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function AreaChartWidget({ title, data }: { title: string; data: { name: string; value: number }[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border-subtle)" }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>{title}</span>
        </div>
        <div style={{ padding: "40px 24px", textAlign: "center", minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No data to display</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 24px", borderBottom: "1px solid var(--border-subtle)" }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>{title}</span>
      </div>
      <div style={{ padding: "16px 8px", minHeight: 280 }}>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <defs>
              <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={CHART_COLORS[0]} stopOpacity={0.6} />
                <stop offset="95%" stopColor={CHART_COLORS[0]} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--text-secondary)" }} angle={-25} textAnchor="end" height={60} interval={0} />
            <YAxis tick={{ fontSize: 11, fill: "var(--text-secondary)" }} domain={[0, 'auto']} />
            <Tooltip
              contentStyle={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "8px", fontSize: 12, color: "var(--text-primary)" }}
              formatter={(value: any) => [typeof value === 'number' ? value.toLocaleString() : String(value ?? ''), ""]}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={CHART_COLORS[0]}
              strokeWidth={2}
              fill="url(#areaGradient)"
              dot={{ r: 4, fill: CHART_COLORS[0] }}
              activeDot={{ r: 6 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function TableWidget({ title, columns, rows }: { title: string; columns: string[]; rows: Record<string, unknown>[] }) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc" | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const rowsPerPage = 20;

  // Filter rows by search term (case-insensitive, all columns)
  const filtered = !search
    ? rows
    : rows.filter((row) =>
        columns.some((col) => {
          const val = row[col];
          return val != null && String(val).toLowerCase().includes(search.toLowerCase());
        })
      );

  // Sort filtered rows
  const sorted = (() => {
    if (!sortKey || !sortDir) return filtered;
    return [...filtered].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return sortDir === "asc" ? -1 : 1;
      if (bVal == null) return sortDir === "asc" ? 1 : -1;
      const aNum = Number(aVal);
      const bNum = Number(bVal);
      const aIsNum = !isNaN(aNum) && aVal !== "" && aVal !== null;
      const bIsNum = !isNaN(bNum) && bVal !== "" && bVal !== null;
      let cmp: number;
      if (aIsNum && bIsNum) {
        cmp = aNum - bNum;
      } else {
        cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  })();

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const safePage = Math.min(page, totalPages);
  const paged = sorted.slice((safePage - 1) * rowsPerPage, safePage * rowsPerPage);

  const handleSort = (col: string) => {
    if (sortKey === col) {
      if (sortDir === "asc") { setSortDir("desc"); }
      else if (sortDir === "desc") { setSortKey(null); setSortDir(null); }
    } else {
      setSortKey(col);
      setSortDir("asc");
    }
    setPage(1);
  };

  const sortArrow = (col: string) => {
    if (sortKey !== col) return <span style={{ opacity: 0.3, marginLeft: 4 }}>⇅</span>;
    if (sortDir === "asc") return <span style={{ color: "var(--gold-400)", marginLeft: 4 }}>▲</span>;
    if (sortDir === "desc") return <span style={{ color: "var(--gold-400)", marginLeft: 4 }}>▼</span>;
    return null;
  };

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "16px 24px", borderBottom: "1px solid var(--border-subtle)" }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>{title}</span>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{filtered.length.toLocaleString()} rows</span>
      </div>

      {/* Search */}
      <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--border-subtle)" }}>
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{
            width: "100%",
            padding: "8px 12px",
            fontSize: 13,
            borderRadius: "6px",
            border: "1px solid var(--border-subtle)",
            background: "var(--bg-elevated)",
            color: "var(--text-primary)",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto", maxHeight: 420, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
            <tr>
              {columns.map((col) => (
                <th
                  key={col}
                  onClick={() => handleSort(col)}
                  style={{
                    padding: "10px 14px",
                    textAlign: "left",
                    fontWeight: 600,
                    fontSize: 11,
                    letterSpacing: "0.03em",
                    textTransform: "uppercase",
                    color: "var(--text-secondary)",
                    background: "var(--bg-elevated)",
                    borderBottom: "2px solid var(--border-subtle)",
                    cursor: "pointer",
                    userSelect: "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  {col}{sortArrow(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ padding: "32px 14px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                  No matching rows
                </td>
              </tr>
            ) : (
              paged.map((row, i) => (
                <tr
                  key={i}
                  style={{
                    background: i % 2 === 0 ? "var(--bg-surface)" : "var(--bg-elevated)",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "rgba(212, 168, 83, 0.06)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = i % 2 === 0 ? "var(--bg-surface)" : "var(--bg-elevated)";
                  }}
                >
                  {columns.map((col) => (
                    <td
                      key={col}
                      style={{
                        padding: "8px 14px",
                        color: "var(--text-primary)",
                        borderBottom: "1px solid var(--border-subtle)",
                        whiteSpace: "nowrap",
                        maxWidth: 240,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {row[col] == null ? <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>—</span> : String(row[col])}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "14px 24px", borderTop: "1px solid var(--border-subtle)" }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            style={{
              padding: "5px 12px",
              fontSize: 12,
              borderRadius: "5px",
              border: "1px solid var(--border-subtle)",
              background: safePage <= 1 ? "var(--bg-surface)" : "var(--bg-elevated)",
              color: safePage <= 1 ? "var(--text-muted)" : "var(--text-primary)",
              cursor: safePage <= 1 ? "default" : "pointer",
              opacity: safePage <= 1 ? 0.5 : 1,
            }}
          >
            ◀ Prev
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((p) => {
              if (totalPages <= 7) return true;
              if (p === 1 || p === totalPages) return true;
              if (p >= safePage - 1 && p <= safePage + 1) return true;
              return false;
            })
            .reduce<(number | "…")[]>((acc, p, idx, arr) => {
              if (idx > 0) {
                const prev = arr[idx - 1];
                if (p - prev > 1) acc.push("…");
              }
              acc.push(p);
              return acc;
            }, [])
            .map((p, idx) =>
              p === "…" ? (
                <span key={`ellipsis-${idx}`} style={{ padding: "5px 4px", color: "var(--text-muted)", fontSize: 12 }}>…</span>
              ) : (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  style={{
                    padding: "5px 10px",
                    fontSize: 12,
                    borderRadius: "5px",
                    border: "1px solid var(--border-subtle)",
                    background: p === safePage ? "var(--gold-dim)" : "var(--bg-elevated)",
                    color: p === safePage ? "var(--gold-400)" : "var(--text-secondary)",
                    cursor: "pointer",
                    fontWeight: p === safePage ? 600 : 400,
                  }}
                >
                  {p}
                </button>
              )
            )}
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
            style={{
              padding: "5px 12px",
              fontSize: 12,
              borderRadius: "5px",
              border: "1px solid var(--border-subtle)",
              background: safePage >= totalPages ? "var(--bg-surface)" : "var(--bg-elevated)",
              color: safePage >= totalPages ? "var(--text-muted)" : "var(--text-primary)",
              cursor: safePage >= totalPages ? "default" : "pointer",
              opacity: safePage >= totalPages ? 0.5 : 1,
            }}
          >
            Next ▶
          </button>
          <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>
            {(filtered.length === 0 ? 0 : (safePage - 1) * rowsPerPage + 1)}–{Math.min(safePage * rowsPerPage, filtered.length)} of {filtered.length}
          </span>
        </div>
      )}
    </div>
  );
}

function ChartPlaceholder({ title, type }: { title: string; type: string }) {
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "16px 24px",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <BarChart3 size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
        <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>{title}</span>
      </div>
      <div
        style={{
          padding: "40px 24px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          minHeight: 180,
        }}
      >
        <BarChart3 size={28} style={{ color: "var(--text-muted)", opacity: 0.35 }} />
        <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>
          {type} visualization — coming soon
        </p>
      </div>
    </div>
  );
}

function KpiPending({ title }: { title: string }) {
  return (
    <div className="card-glow echo-ring" style={{ padding: "24px 28px" }}>
      <p style={{ color: "var(--text-muted)", fontSize: 12, fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 12 }}>
        {title}
      </p>
      <div className="skeleton" style={{ width: "55%", height: 48, marginBottom: 12 }} />
      <div
        style={{
          width: 40,
          height: 1,
          background: "var(--border-subtle)",
        }}
      />
    </div>
  );
}

// ── Page ──

export default function DashboardViewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [widgetData, setWidgetData] = useState<Record<number, { rows: unknown[] }>>({});

  async function loadWidgetData(d: Dashboard) {
    const data: Record<number, { rows: unknown[] }> = {};
    for (const w of d.widgets) {
      const cfg = parseConfig(w.config);
      if (cfg.layer && cfg.table) {
        try {
          let query: string | null = null;
          if (w.type === "KPI" && (cfg.kpiField || cfg.xField || cfg.aggregation)) {
            const field = cfg.kpiField || cfg.xField;
            const agg = (cfg.aggregation || cfg.yField || "SUM").toUpperCase();
            let whereClause = "";
            if (cfg.filterField && cfg.filterValue) {
              const isNumeric = /^-?\d+(\.\d+)?$/.test(cfg.filterValue);
              const filterVal = isNumeric
                ? cfg.filterValue
                : `'${cfg.filterValue.replace(/'/g, "''")}'`;
              whereClause = ` WHERE "${cfg.filterField}" = ${filterVal}`;
            }
            if (agg === "COUNT" && (!field || field === "COUNT(*)")) {
              query = `SELECT COUNT(*) as "count" FROM "${cfg.layer}"."${cfg.table}"${whereClause}`;
            } else if (field) {
              query = `SELECT ${agg}("${field}") as "${field}" FROM "${cfg.layer}"."${cfg.table}"${whereClause}`;
            }
          }
          // Pie chart query
          if (w.type === "PIE" && cfg.xField && cfg.layer && cfg.table) {
            const labelField = cfg.xField;
            const valueField = cfg.yField || labelField;
            const agg = (cfg.aggregation || "COUNT").toUpperCase();
            let whereClause = "";
            if (cfg.filterField && cfg.filterValue) {
              const isNumeric2 = /^-?\d+(\.\d+)?$/.test(cfg.filterValue);
              const filterVal2 = isNumeric2
                ? cfg.filterValue
                : `'${cfg.filterValue.replace(/'/g, "''")}'`;
              whereClause = ` WHERE "${cfg.filterField}" = ${filterVal2}`;
            }
            if (agg === "COUNT") {
              query = `SELECT "${labelField}" as name, COUNT(*) as value FROM "${cfg.layer}"."${cfg.table}"${whereClause} GROUP BY "${labelField}" ORDER BY value DESC`;
            } else {
              query = `SELECT "${labelField}" as name, ${agg}("${valueField}") as value FROM "${cfg.layer}"."${cfg.table}"${whereClause} GROUP BY "${labelField}" ORDER BY value DESC`;
            }
          }
          // Bar chart query — same pattern as pie: GROUP BY label, aggregate value
          const isChart = w.type === "BAR" || w.type === "LINE" || w.type === "AREA";
          if (isChart && cfg.xField && cfg.layer && cfg.table) {
            const labelField = cfg.xField;
            const valueField = cfg.yField || labelField;
            const agg = (cfg.aggregation || "COUNT").toUpperCase();
            let whereClause = "";
            if (cfg.filterField && cfg.filterValue) {
              const isNumeric3 = /^-?\d+(\.\d+)?$/.test(cfg.filterValue);
              const filterVal3 = isNumeric3
                ? cfg.filterValue
                : `'${cfg.filterValue.replace(/'/g, "''")}'`;
              whereClause = ` WHERE "${cfg.filterField}" = ${filterVal3}`;
            }
            const orderDir = w.type === "LINE" ? "ASC" : "DESC";
            const orderBy = w.type === "LINE" ? ` ORDER BY "${labelField}" ${orderDir}` : ` ORDER BY value ${orderDir}`;
            if (agg === "COUNT") {
              query = `SELECT "${labelField}" as name, COUNT(*) as value FROM "${cfg.layer}"."${cfg.table}"${whereClause} GROUP BY "${labelField}"${orderBy}`;
            } else {
              query = `SELECT "${labelField}" as name, ${agg}("${valueField}") as value FROM "${cfg.layer}"."${cfg.table}"${whereClause} GROUP BY "${labelField}"${orderBy}`;
            }
          }
          // TABLE widget — SELECT * to get all columns for the interactive table
          if (w.type === "TABLE" && cfg.layer && cfg.table) {
            query = `SELECT * FROM "${cfg.layer}"."${cfg.table}" LIMIT 500`;
          }
          if (query) {
            const res = await authFetch("/api/dashboards/" + d.id + "/data", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ layer: cfg.layer, table: cfg.table, query }),
            });
            if (res.ok) {
              const result = await res.json();
              if (result.rows) data[w.id] = { rows: result.rows };
            }
          }
        } catch {
          // silently skip data errors
        }
      }
    }
    setWidgetData(data);
  }

  useEffect(() => {
    async function init() {
      try {
        const r = await authFetch("/api/dashboards/" + params.id);
        if (r.status === 401) {
          clearAuth();
          router.push("/login");
          return;
        }
        const d = await r.json();
        if (d && d.name) {
          setDashboard(d);
          await loadWidgetData(d);
        } else {
          setError("Dashboard not found");
        }
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [params.id, router]);

  // ── Loading ──
  if (loading) return <LoadingSkeleton />;

  // ── Error ──
  if (error || !dashboard) return <ErrorState message={error || "Not found"} />;

  // ── Render ──
  return (
    <div
      className="page-enter"
      style={{ maxWidth: 1400, margin: "0 auto", padding: "32px 24px 64px" }}
    >
      {/* ── Header ── */}
      <header style={{ marginBottom: 40 }}>
        {/* Back link */}
        <Link
          href="/dashboards"
          className="btn btn-ghost"
          style={{ marginBottom: 16, padding: "6px 14px", fontSize: 13 }}
        >
          <ArrowLeft size={14} />
          Dashboards
        </Link>

        {/* Title row */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 24,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 32,
                fontWeight: 400,
                fontStyle: "italic",
                color: "var(--gold-400)",
                lineHeight: 1.2,
                margin: "0 0 6px 0",
              }}
            >
              {dashboard.name}
            </h1>
            {dashboard.description && (
              <p
                style={{
                  color: "var(--text-muted)",
                  fontSize: 15,
                  fontWeight: 300,
                  lineHeight: 1.5,
                  margin: 0,
                  maxWidth: 600,
                }}
              >
                {dashboard.description}
              </p>
            )}
          </div>

          <Link
            href={`/dashboards/new?edit=${dashboard.id}`}
            className="btn btn-secondary"
          >
            <Pencil size={15} />
            Edit
          </Link>
        </div>

        {/* Divider */}
        <hr className="divider" style={{ marginTop: 24 }} />
      </header>

      {/* ── Widget Grid ── */}
      <div
        className="stagger"
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))",
        }}
      >
        {dashboard.widgets.map((w) => {
          const cfg = parseConfig(w.config);
          const liveData = widgetData[w.id];
          const hasLive = liveData && liveData.rows && liveData.rows.length > 0;

          // KPI widget with data
          if (w.type === "KPI" && hasLive) {
            const keys = Object.keys(liveData.rows[0] as Record<string, unknown>);
            const field =
              keys.find((k) => k.toLowerCase().includes("count")) ||
              keys.find((k) => typeof (liveData.rows[0] as Record<string, unknown>)[k] === "number") ||
              keys[0];
            const rawVal = (liveData.rows[0] as Record<string, unknown>)[field];
            return <KpiWidget key={w.id} title={w.title} value={formatKpiValue(rawVal)} />;
          }

          // KPI widget pending
          if (w.type === "KPI" && !hasLive) {
            return <KpiPending key={w.id} title={w.title} />;
          }

          // Pie chart with live data
          if (w.type === "PIE" && hasLive) {
            const pieData = (liveData.rows as Record<string, unknown>[]).map((row: any) => ({
              name: String(row.name ?? Object.values(row)[0] ?? ""),
              value: Number(row.value ?? Object.values(row)[1] ?? 0),
            }));
            return <PieChartWidget key={w.id} title={w.title} data={pieData} />;
          }

          // Bar chart with live data
          if (w.type === "BAR" && hasLive) {
            const barData = (liveData.rows as Record<string, unknown>[]).map((row: any) => ({
              name: String(row.name ?? Object.values(row)[0] ?? ""),
              value: Number(row.value ?? Object.values(row)[1] ?? 0),
            }));
            return <BarChartWidget key={w.id} title={w.title} data={barData} />;
          }

          // Line chart with live data
          if (w.type === "LINE" && hasLive) {
            const lineData = (liveData.rows as Record<string, unknown>[]).map((row: any) => ({
              name: String(row.name ?? Object.values(row)[0] ?? ""),
              value: Number(row.value ?? Object.values(row)[1] ?? 0),
            }));
            return <LineChartWidget key={w.id} title={w.title} data={lineData} />;
          }

          // Area chart with live data
          if (w.type === "AREA" && hasLive) {
            const areaData = (liveData.rows as Record<string, unknown>[]).map((row: any) => ({
              name: String(row.name ?? Object.values(row)[0] ?? ""),
              value: Number(row.value ?? Object.values(row)[1] ?? 0),
            }));
            return <AreaChartWidget key={w.id} title={w.title} data={areaData} />;
          }

          // Table widget with live data
          if (w.type === "TABLE" && hasLive) {
            const columns = Object.keys(liveData.rows[0] as Record<string, unknown>);
            return <TableWidget key={w.id} title={w.title} columns={columns} rows={liveData.rows as Record<string, unknown>[]} />;
          }

          // Table widget pending
          if (w.type === "TABLE" && !hasLive) {
            return <ChartPlaceholder key={w.id} title={w.title} type="TABLE" />;
          }

          // Chart / other widget
          return <ChartPlaceholder key={w.id} title={w.title} type={w.type} />;
        })}
      </div>
    </div>
  );
}
