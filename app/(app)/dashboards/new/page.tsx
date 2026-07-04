"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Responsive, useContainerWidth } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

/* ──────────────────────────────────────────────
   Types & Constants
   ────────────────────────────────────────────── */

type WidgetType = "LINE" | "BAR" | "PIE" | "AREA" | "KPI" | "TABLE" | "TEXT";

interface WidgetConfig {
  dataSource: string;
  xField: string;
  yField: string;
  color: string;
  // KPI specific
  aggregation: string;   // SUM | AVG | COUNT | MIN | MAX
  kpiField: string;      // column to aggregate for KPI
  groupBy: string;       // optional group by
  // Filter
  filterField: string;
  filterValue: string;
  // Sort
  sortField: string;
  sortDir: string;       // ASC | DESC
}

interface Widget {
  id: string;
  type: WidgetType;
  title: string;
  gridX: number;
  gridY: number;
  gridW: number;
  gridH: number;
  config: WidgetConfig;
}

interface TableOption {
  layer: string;
  tableName: string;
  displayName: string;
  rowsCount?: number;
}

interface ColumnInfo {
  name: string;
  type: string; // numeric | text | date | categorical
  pgType: string; // original PostgreSQL type
  sampleCount: number;
}

interface TemplateOption {
  id: string;
  icon: string;
  label: string;
  desc: string;
  layout: "overview" | "deep" | "table" | "custom";
}

const WIDGET_TYPE_ICONS: Record<WidgetType, string> = {
  LINE: "📈",
  BAR: "📊",
  PIE: "🥧",
  AREA: "📉",
  KPI: "🔢",
  TABLE: "📋",
  TEXT: "💬",
};

const WIDGET_TYPE_LABELS: Record<WidgetType, string> = {
  LINE: "Line Chart",
  BAR: "Bar Chart",
  PIE: "Pie Chart",
  AREA: "Area Chart",
  KPI: "KPI Card",
  TABLE: "Table",
  TEXT: "Text",
};

const PALETTE_ITEMS: { type: WidgetType; icon: string; label: string }[] = [
  { type: "LINE", icon: "📈", label: "Line Chart" },
  { type: "BAR", icon: "📊", label: "Bar Chart" },
  { type: "PIE", icon: "🥧", label: "Pie Chart" },
  { type: "AREA", icon: "📉", label: "Area Chart" },
  { type: "KPI", icon: "🔢", label: "KPI Card" },
  { type: "TABLE", icon: "📋", label: "Table" },
  { type: "TEXT", icon: "💬", label: "Text" },
];

const DEFAULT_CONFIG: WidgetConfig = {
  dataSource: "",
  xField: "",
  yField: "",
  color: "#10b981",
  aggregation: "SUM",
  kpiField: "",
  groupBy: "",
  filterField: "",
  filterValue: "",
  sortField: "",
  sortDir: "ASC",
};

/* ──────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────── */

function newWidget(type: WidgetType, count: number): Widget {
  const sizes: Record<WidgetType, { w: number; h: number }> = {
    KPI: { w: 3, h: 2 },
    BAR: { w: 4, h: 3 },
    LINE: { w: 6, h: 4 },
    PIE: { w: 4, h: 3 },
    AREA: { w: 6, h: 4 },
    TABLE: { w: 6, h: 4 },
    TEXT: { w: 4, h: 2 },
  };
  const sz = sizes[type] || { w: 4, h: 3 };
  return {
    id: `widget-${Date.now()}-${count}`,
    type,
    title: `${WIDGET_TYPE_LABELS[type]} ${count}`,
    gridX: (count * 4) % 12,
    gridY: Infinity, // push to bottom
    gridW: sz.w,
    gridH: sz.h,
    config: { ...DEFAULT_CONFIG },
  };
}

/* ──────────────────────────────────────────────
   Placeholder Chart Components
   ────────────────────────────────────────────── */

function PlaceholderChart({ type, color }: { type: WidgetType; color: string }) {
  const icon = WIDGET_TYPE_ICONS[type];
  const label = WIDGET_TYPE_LABELS[type];

  if (type === "KPI") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <span className="text-4xl">{icon}</span>
        <span className="text-3xl font-bold" style={{ color }}>
          1,337
        </span>
        <span className="text-xs text-slate-500">Sample KPI</span>
      </div>
    );
  }

  if (type === "TABLE") {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex-1 flex items-center justify-center border border-dashed border-slate-700 rounded-lg m-2">
          <span className="text-4xl">{icon}</span>
        </div>
      </div>
    );
  }

  if (type === "TEXT") {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm italic">
        <span>
          {icon} Text block — click to edit content
        </span>
      </div>
    );
  }

  // LINE, BAR, PIE, AREA — chart placeholder
  return (
    <div className="flex flex-col items-center justify-center h-full gap-1">
      <span className="text-3xl">{icon}</span>
      <div className="flex items-end gap-[2px] h-12 mt-1">
        {[30, 55, 40, 70, 50, 65, 45, 60, 75, 50].map((h, i) => (
          <div
            key={i}
            className="w-[6px] rounded-t-sm"
            style={{
              height: `${h}%`,
              backgroundColor: color,
              opacity: 0.3 + (i / 10) * 0.7,
            }}
          />
        ))}
      </div>
      <span className="text-[10px] text-slate-500 mt-1">{label} preview</span>
    </div>
  );
}

/* ──────────────────────────────────────────────
   Main Page Component
   ────────────────────────────────────────────── */

export default function NewDashboardPage() {
  const [name, setName] = useState("");
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [tables, setTables] = useState<TableOption[]>([]);
  const [widgetCounter, setWidgetCounter] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [savedId, setSavedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const router = useRouter();

  // Template picker state
  const [showTemplates, setShowTemplates] = useState(true);
  const [selectedTableKey, setSelectedTableKey] = useState("");
  const [tableColumns, setTableColumns] = useState<ColumnInfo[]>([]);
  const [loadingColumns, setLoadingColumns] = useState(false);

  // Widget config panel: columns for the selected widget's data source
  const [widgetColumns, setWidgetColumns] = useState<ColumnInfo[]>([]);
  const [loadingWidgetColumns, setLoadingWidgetColumns] = useState(false);

  const { width, containerRef } = useContainerWidth();

  const selectedWidget = widgets.find((w) => w.id === selectedWidgetId) ?? null;

  const TEMPLATES: TemplateOption[] = [
    { id: "overview", icon: "📊", label: "Quick Overview", desc: "KPI cards + 1 chart + table. Cocok untuk lihat data sekilas.", layout: "overview" },
    { id: "deep", icon: "📈", label: "Deep Analysis", desc: "KPI + bar + pie + trend. Cocok untuk analisa mendalam.", layout: "deep" },
    { id: "table", icon: "📋", label: "Table Explorer", desc: "Full table + filter + row count. Cocok eksplorasi data.", layout: "table" },
    { id: "custom", icon: "✏️", label: "Custom", desc: "Mulai dari grid kosong, tambah widget manual.", layout: "custom" },
  ];

  /* ── Fetch tables on mount ── */
  useEffect(() => {
    fetch("/api/lakehouse/tables")
      .then((r) => r.json())
      .then((data: TableOption[]) => {
        if (Array.isArray(data)) setTables(data);
      })
      .catch(() => {});
  }, []);

  /* ── Fetch column schema for selected table ── */
  const fetchTableSchema = useCallback(async (tableKey: string) => {
    const [layer, ...rest] = tableKey.split("/");
    const tableName = rest.join("/");
    if (!layer || !tableName) return;

    setLoadingColumns(true);
    try {
      const res = await fetch(`/api/lakehouse/${layer}/${tableName}/schema`);
      if (!res.ok) throw new Error("Schema fetch failed");
      const data = await res.json();
      const columns: ColumnInfo[] = (data.columns || []).map((c: any) => ({
        name: c.name,
        type: detectColumnType(c.name, c.type),
        pgType: c.type || "TEXT",
        sampleCount: 0,
      }));
      setTableColumns(columns);
    } catch {
      setTableColumns([]);
    } finally {
      setLoadingColumns(false);
    }
  }, []);

  /* ── Fetch column schema for widget config panel ── */
  const fetchWidgetColumns = useCallback(async (tableKey: string) => {
    const [layer, ...rest] = tableKey.split("/");
    const tableName = rest.join("/");
    if (!layer || !tableName) {
      setWidgetColumns([]);
      return;
    }

    setLoadingWidgetColumns(true);
    try {
      const res = await fetch(`/api/lakehouse/${layer}/${tableName}/schema`);
      if (!res.ok) throw new Error("Schema fetch failed");
      const data = await res.json();
      const columns: ColumnInfo[] = (data.columns || []).map((c: any) => ({
        name: c.name,
        type: detectColumnType(c.name, c.type),
        pgType: c.type || "TEXT",
        sampleCount: 0,
      }));
      setWidgetColumns(columns);
    } catch {
      setWidgetColumns([]);
    } finally {
      setLoadingWidgetColumns(false);
    }
  }, []);

  // Fetch widget columns when selected widget's data source changes
  useEffect(() => {
    if (selectedWidget?.config?.dataSource) {
      fetchWidgetColumns(selectedWidget.config.dataSource);
    } else {
      setWidgetColumns([]);
    }
  }, [selectedWidget?.config?.dataSource, fetchWidgetColumns]);

  /* ── Detect column category from name + type ── */
  function detectColumnType(name: string, pgType: string): string {
    const dt = (pgType || "").toLowerCase();
    if (dt.includes("int") || dt.includes("float") || dt.includes("double") || dt.includes("numeric") || dt.includes("decimal"))
      return "numeric";
    if (dt.includes("timestamp") || dt.includes("date"))
      return "date";

    const n = name.toLowerCase();
    // Categorical: few unique values expected
    if (n.includes("category") || n.includes("type") || n.includes("status") || n.includes("class") ||
        n.includes("tier") || n.includes("region") || n.includes("brand") || n.includes("vendor") ||
        n.includes("store") || n.includes("size") || n.includes("volume"))
      return "categorical";
    return "text";
  }

  /* ── Generate widgets based on template + column analysis ── */
  const generateWidgets = useCallback(
    (tableKey: string, columns: ColumnInfo[], template: TemplateOption) => {
      const [layer, ...rest] = tableKey.split("/");
      const tableName = rest.join("/");
      const dataSource = `${layer}/${tableName}`;
      const numCols = columns.filter((c) => c.type === "numeric");
      const catCols = columns.filter((c) => c.type === "categorical" || c.type === "text");
      const dateCols = columns.filter((c) => c.type === "date");

      const widgets: Widget[] = [];
      let idx = 0;

      if (template.layout === "overview") {
        // Row 1: KPI cards (up to 3 numeric columns)
        const topMetrics = numCols.slice(0, 3);
        topMetrics.forEach((col, i) => {
          widgets.push({
            id: `auto-${Date.now()}-${idx++}`,
            type: "KPI",
            title: `Total ${col.name.replace(/_/g, " ")}`,
            gridX: i * 4, gridY: 0, gridW: 4, gridH: 2,
            config: { ...DEFAULT_CONFIG, dataSource, xField: col.name, yField: "SUM", kpiField: col.name, aggregation: "SUM", color: ["#10b981", "#3b82f6", "#f59e0b"][i] },
          });
        });
        // Row 2: Bar chart (categorical vs first numeric)
        if (catCols.length > 0 && numCols.length > 0) {
          widgets.push({
            id: `auto-${Date.now()}-${idx++}`,
            type: "BAR",
            title: `${numCols[0].name.replace(/_/g, " ")} by ${catCols[0].name.replace(/_/g, " ")}`,
            gridX: 0, gridY: 2, gridW: 6, gridH: 4,
            config: { ...DEFAULT_CONFIG, dataSource, xField: catCols[0].name, yField: numCols[0].name, color: "#10b981" },
          });
        }
        // Row 2 right: Table
        widgets.push({
          id: `auto-${Date.now()}-${idx++}`,
          type: "TABLE",
          title: "Data Preview",
          gridX: 6, gridY: 2, gridW: 6, gridH: 4,
          config: { ...DEFAULT_CONFIG, dataSource, xField: "", yField: "", color: "#6366f1" },
        });
      } else if (template.layout === "deep") {
        // KPI header row
        const topMetrics = numCols.slice(0, 4);
        topMetrics.forEach((col, i) => {
          widgets.push({
            id: `auto-${Date.now()}-${idx++}`,
            type: "KPI",
            title: `Total ${col.name.replace(/_/g, " ")}`,
            gridX: i * 3, gridY: 0, gridW: 3, gridH: 2,
            config: { ...DEFAULT_CONFIG, dataSource, xField: col.name, yField: "SUM", kpiField: col.name, aggregation: "SUM", color: ["#10b981", "#f59e0b", "#3b82f6", "#ef4444"][i] },
          });
        });
        // Bar chart
        if (catCols.length > 0 && numCols.length > 0) {
          widgets.push({
            id: `auto-${Date.now()}-${idx++}`,
            type: "BAR",
            title: `${numCols[0].name.replace(/_/g, " ")} by ${catCols[0].name.replace(/_/g, " ")}`,
            gridX: 0, gridY: 2, gridW: 6, gridH: 4,
            config: { ...DEFAULT_CONFIG, dataSource, xField: catCols[0].name, yField: numCols[0].name, color: "#10b981" },
          });
        }
        // Pie chart
        if (catCols.length > 0 && numCols.length > 0) {
          widgets.push({
            id: `auto-${Date.now()}-${idx++}`,
            type: "PIE",
            title: `${catCols[0].name.replace(/_/g, " ")} Distribution`,
            gridX: 6, gridY: 2, gridW: 6, gridH: 4,
            config: { ...DEFAULT_CONFIG, dataSource, xField: catCols[0].name, yField: numCols.length > 1 ? numCols[1].name : numCols[0].name, color: "#f59e0b" },
          });
        }
        // Trend line (date)
        if (dateCols.length > 0 && numCols.length > 0) {
          widgets.push({
            id: `auto-${Date.now()}-${idx++}`,
            type: "LINE",
            title: `${numCols[0].name.replace(/_/g, " ")} Trend`,
            gridX: 0, gridY: 6, gridW: 12, gridH: 4,
            config: { ...DEFAULT_CONFIG, dataSource, xField: dateCols[0].name, yField: numCols[0].name, color: "#3b82f6" },
          });
        }
      } else if (template.layout === "table") {
        // Row count KPI
        widgets.push({
          id: `auto-${Date.now()}-${idx++}`,
          type: "KPI",
          title: "Total Rows",
          gridX: 0, gridY: 0, gridW: 3, gridH: 2,
          config: { ...DEFAULT_CONFIG, dataSource, xField: "COUNT(*)", yField: "", kpiField: "*", aggregation: "COUNT", color: "#10b981" },
        });
        // Column count
        widgets.push({
          id: `auto-${Date.now()}-${idx++}`,
          type: "KPI",
          title: "Columns",
          gridX: 3, gridY: 0, gridW: 3, gridH: 2,
          config: { ...DEFAULT_CONFIG, dataSource, xField: columns.length.toString(), yField: "", color: "#6366f1" },
        });
        // Full table
        widgets.push({
          id: `auto-${Date.now()}-${idx++}`,
          type: "TABLE",
          title: "Data Table",
          gridX: 0, gridY: 2, gridW: 12, gridH: 6,
          config: { ...DEFAULT_CONFIG, dataSource, xField: "", yField: "", color: "#8b5cf6" },
        });
      }

      setWidgets(widgets);
      setWidgetCounter(idx);
      setSelectedWidgetId(null);
      setShowTemplates(false);

      // Auto-name
      if (!name) {
        const tblLabel = tables.find((t) => `${t.layer}/${t.tableName}` === tableKey)?.displayName || tableName;
        setName(`${tblLabel} ${template.label}`);
      }
    },
    [name, tables],
  );

  /* ── Add widget (smart placement) ── */
  const addWidget = useCallback(
    (type: WidgetType) => {
      setWidgetCounter((c) => {
        const next = c + 1;
        // Find next available row (scan existing widgets for max Y + height)
        const maxY = widgets.length > 0
          ? Math.max(...widgets.map((w) => w.gridY + w.gridH))
          : 0;
        const w = newWidget(type, next);
        w.gridY = maxY;
        w.gridX = 0;
        w.gridW = type === "KPI" ? 3 : type === "TABLE" ? 6 : type === "TEXT" ? 4 : 4;
        w.gridH = type === "KPI" ? 2 : type === "TABLE" ? 4 : 3;
        setWidgets((prev) => [...prev, w]);
        setSelectedWidgetId(w.id);
        return next;
      });
    },
    [widgets]
  );

  /* ── Quick Arrange ── */
  const autoArrange = useCallback(() => {
    setWidgets((prev) => {
      let y = 0;
      return prev.map((w, i) => {
        const placed = { ...w, gridX: (i % 3) * 4, gridY: y };
        if ((i + 1) % 3 === 0) y += 3;
        return placed;
      });
    });
  }, []);

  const stackVertical = useCallback(() => {
    setWidgets((prev) => {
      let y = 0;
      return prev.map((w) => {
        const placed = { ...w, gridX: 0, gridW: 12, gridY: y };
        y += w.gridH;
        return placed;
      });
    });
  }, []);

  /* ── Update widget field ── */
  const updateWidget = useCallback(
    (id: string, updates: Partial<Widget>) => {
      setWidgets((prev) =>
        prev.map((w) => (w.id === id ? { ...w, ...updates } : w))
      );
    },
    []
  );

  /* ── Update widget config (deep merge) ── */
  const updateWidgetConfig = useCallback(
    (id: string, updates: Partial<WidgetConfig>) => {
      setWidgets((prev) =>
        prev.map((w) =>
          w.id === id ? { ...w, config: { ...w.config, ...updates } } : w
        )
      );
    },
    []
  );

  /* ── Resize widget ── */
  const resizeWidget = useCallback((id: string, w: number, h: number) => {
    setWidgets((prev) =>
      prev.map((widget) =>
        widget.id === id ? { ...widget, gridW: w, gridH: h } : widget
      )
    );
  }, []);

  /* ── Remove widget ── */
  const removeWidget = useCallback((id: string) => {
    setWidgets((prev) => prev.filter((w) => w.id !== id));
    setSelectedWidgetId((curr) => (curr === id ? null : curr));
  }, []);

  /* ── Layout change handler ── */
  const onLayoutChange = useCallback((layout: readonly any[]) => {
    setWidgets((prev) =>
      prev.map((w) => {
        const item = layout.find((l: any) => l.i === w.id);
        return item ? { ...w, gridX: item.x, gridY: item.y, gridW: item.w, gridH: item.h } : w;
      })
    );
  }, []);

  /* ── Edit mode: load existing dashboard ── */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const editId = params.get("edit");
    if (!editId) return;
    const id = parseInt(editId);
    if (isNaN(id)) return;

    setEditingId(id);
    fetch("/api/dashboards/" + id)
      .then((r) => r.json())
      .then((data) => {
        if (data && data.name) {
          setName(data.name);
          if (data.widgets && Array.isArray(data.widgets)) {
            const loaded: Widget[] = data.widgets.map((w: any) => ({
              id: "widget-" + w.id,
              type: w.type as WidgetType,
              title: w.title,
              gridX: w.gridX || 0,
              gridY: w.gridY || 0,
              gridW: w.gridW || 4,
              gridH: w.gridH || 3,
              config: typeof w.config === "string" ? JSON.parse(w.config) : (w.config || {}),
            }));
            setWidgets(loaded);
            setWidgetCounter(data.widgets.length);
            setSelectedTableKey("");
            setShowTemplates(false);
          }
        }
      })
      .catch(() => {});
  }, []);

  /* ── Save ── */
  const handleSave = async () => {
    if (!name.trim()) {
      setSaveMessage("Please enter a dashboard name");
      return;
    }
    setSaving(true);
    setSaveMessage("");
    try {
      let id: number;

      if (editingId) {
        id = editingId;
        const putRes = await fetch("/api/dashboards/" + id, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            widgets: widgets.map((w) => ({
              type: w.type,
              title: w.title,
              config: w.config,
              gridX: w.gridX,
              gridY: w.gridY,
              gridW: w.gridW,
              gridH: w.gridH,
            })),
          }),
        });
        if (!putRes.ok) {
          const err = await putRes.json();
          throw new Error(err.error || "Failed to update dashboard");
        }
        setSaveMessage("✅ Dashboard updated!");
      } else {
        const createRes = await fetch("/api/dashboards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim() }),
        });
        if (!createRes.ok) {
          const err = await createRes.json();
          throw new Error(err.error || "Failed to create dashboard");
        }
        const created = await createRes.json();
        id = created.id;

        const putRes = await fetch("/api/dashboards/" + id, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            widgets: widgets.map((w) => ({
              type: w.type,
              title: w.title,
              config: w.config,
              gridX: w.gridX,
              gridY: w.gridY,
              gridW: w.gridW,
              gridH: w.gridH,
            })),
          }),
        });
        if (!putRes.ok) {
          const err = await putRes.json();
          throw new Error(err.error || "Failed to save widgets");
        }
        setSaveMessage("✅ Dashboard saved!");
      }
      setSavedId(id);
    } catch (e: any) {
      setSaveMessage("❌ " + e.message);
    } finally {
      setSaving(false);
    }
  };

  /* ── Drag ghost image fix ── */
  const cols = Math.max(1, Math.floor((width || 1200) / 95));

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            🛠️ Dashboard Builder
            {editingId && <span className="text-sm text-amber-400 font-normal">(Editing #{editingId})</span>}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Dashboard name…" className="px-4 py-2 rounded-xl text-sm focus:outline-none w-64" style={{ backgroundColor: "rgba(30,41,59,0.8)", border: "1px solid rgba(51,65,85,0.6)", color: "#e2e8f0" }} />
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-sm font-medium hover:bg-emerald-500/30 disabled:opacity-50">
            {saving ? "Saving…" : editingId ? "💾 Update Dashboard" : "💾 Save Dashboard"}
          </button>
          {savedId && <a href={"/dashboards/" + savedId} className="px-3 py-2 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 text-sm hover:bg-indigo-500/30">View →</a>}
        </div>
      </div>
      {saveMessage && <div className={"text-sm px-4 py-2 rounded-xl " + (saveMessage.includes("✅") ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400")}>{saveMessage}</div>}
      <div className="flex gap-6" ref={containerRef}>
        <div className="w-48 shrink-0 space-y-3">
          <h2 className="text-xs uppercase tracking-wider text-slate-500 font-semibold">WIDGET PALETTE</h2>
          <div className="space-y-2">
            {PALETTE_ITEMS.map((item) => (
              <button key={item.type} onClick={() => addWidget(item.type)} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-700/50 bg-slate-800/40 text-sm text-slate-300 hover:bg-slate-700/50 hover:border-emerald-500/30 transition-all">
                <span className="text-lg">{item.icon}</span><span>{item.label}</span>
              </button>
            ))}
          </div>
          {widgets.length > 1 && (
            <div className="pt-4 border-t border-slate-800">
              <h2 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">QUICK ARRANGE</h2>
              <div className="flex gap-1">
                <button onClick={autoArrange} className="flex-1 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 text-xs hover:bg-slate-700">🔲 Grid</button>
                <button onClick={stackVertical} className="flex-1 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 text-xs hover:bg-slate-700">⬇️ Stack</button>
              </div>
              <p className="text-[10px] text-slate-600 mt-1.5 text-center">{widgets.length} widgets</p>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          {showTemplates && (
            <div className="glass p-6 rounded-xl border border-slate-800 space-y-4">
              <div><span className="text-2xl mr-2">🎯</span><h2 className="text-lg font-semibold text-white inline">Pilih Tabel and Template Dashboard</h2><p className="text-sm text-slate-400 mt-1">Pilih tabel lakehouse, lalu pilih template — widget auto-generated berdasarkan struktur data</p></div>
              <label className="flex flex-col gap-1"><span className="text-xs text-slate-400">📋 Tabel Lakehouse</span>
                <select value={selectedTableKey} onChange={(e) => { setSelectedTableKey(e.target.value); if (e.target.value) fetchTableSchema(e.target.value); }} className="px-3 py-2 rounded-lg text-sm focus:outline-none" style={{ backgroundColor: "rgba(30,41,59,0.8)", border: "1px solid rgba(51,65,85,0.6)", color: "#e2e8f0" }}>
                  <option value="">-- Pilih tabel --</option>
                  {tables.map((t) => <option key={t.layer + "/" + t.tableName} value={t.layer + "/" + t.tableName}>{t.displayName || t.tableName} ({t.layer} · {t.rowsCount || 0} rows)</option>)}
                </select></label>
              {loadingColumns && <p className="text-sm text-slate-500">Loading columns…</p>}
              {!loadingColumns && tableColumns.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500">{tableColumns.length} columns · {tableColumns.filter(c => c.type === "numeric").length} numeric · {tableColumns.filter(c => c.type === "date").length} date</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {TEMPLATES.map((tmpl) => (
                      <button key={tmpl.id} onClick={() => generateWidgets(selectedTableKey, tableColumns, tmpl)} className="p-3 rounded-xl border border-slate-700 bg-slate-800/40 hover:bg-slate-700/50 hover:border-emerald-500/30 text-left transition-all">
                        <div className="text-2xl mb-1">{tmpl.icon}</div><div className="text-sm font-medium text-white">{tmpl.label}</div><div className="text-[10px] text-slate-400 leading-tight mt-0.5">{tmpl.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {!showTemplates && (
            <div className="min-h-[400px]">
              {widgets.length === 0 ? (
                <div className="flex items-center justify-center h-64 text-slate-500"><div className="text-center"><p className="text-4xl mb-3">📋</p><p className="text-sm">Add widgets from the palette or go back to templates</p><button onClick={() => setShowTemplates(true)} className="mt-3 text-xs text-emerald-400 hover:underline">← Back to templates</button></div></div>
              ) : (
                // @ts-expect-error react-grid-layout types
                <Responsive className="layout" layouts={{ lg: widgets.map(w => ({ i: w.id, x: w.gridX, y: w.gridY, w: w.gridW, h: w.gridH, minW: 2, minH: 1 })) }} breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }} cols={{ lg: cols, md: 10, sm: 6, xs: 4, xxs: 2 }} rowHeight={90} onLayoutChange={(layout) => onLayoutChange(layout)} draggableHandle=".drag-handle" isResizable={true} compactType="vertical" margin={[8, 8]}>
                  {widgets.map((w) => (
                    <div key={w.id} className={"glass border rounded-xl overflow-hidden cursor-default " + (selectedWidgetId === w.id ? "border-emerald-500/40 shadow-lg shadow-emerald-500/5" : "border-slate-800 hover:border-slate-700")} onClick={() => setSelectedWidgetId(w.id)}>
                      <div className="drag-handle flex items-center justify-between px-3 py-2 border-b border-slate-800/50 bg-slate-900/40 cursor-grab active:cursor-grabbing">
                        <span className="text-xs font-medium text-slate-300 truncate">{w.title}</span>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">{WIDGET_TYPE_LABELS[w.type]}</span>
                          <button onClick={(e) => { e.stopPropagation(); removeWidget(w.id); }} className="text-slate-600 hover:text-red-400 text-xs px-1">✕</button>
                        </div>
                      </div>
                      <div className="p-2 h-[calc(100%-36px)]"><PlaceholderChart type={w.type} color={w.config.color} /></div>
                    </div>
                  ))}
                </Responsive>
              )}
            </div>
          )}
        </div>
        {selectedWidget && (
          <div className="w-72 shrink-0 space-y-3">
            <h2 className="text-xs uppercase tracking-wider text-slate-500 font-semibold">⚙️ WIDGET CONFIG</h2>
            <div className="glass p-3 rounded-xl border border-slate-800 space-y-3 max-h-[calc(100vh-200px)] overflow-y-auto">
              <label className="flex flex-col gap-1"><span className="text-xs text-slate-400">Title</span><input type="text" value={selectedWidget.title} onChange={(e) => updateWidget(selectedWidget.id, { title: e.target.value })} className="px-3 py-1.5 rounded-lg text-sm focus:outline-none" style={{ backgroundColor: "rgba(30,41,59,0.8)", border: "1px solid rgba(51,65,85,0.6)", color: "#e2e8f0" }} /></label>
              <label className="flex flex-col gap-1"><span className="text-xs text-slate-400">Type</span><select value={selectedWidget.type} onChange={(e) => updateWidget(selectedWidget.id, { type: e.target.value as WidgetType })} className="px-3 py-1.5 rounded-lg text-sm focus:outline-none" style={{ backgroundColor: "rgba(30,41,59,0.8)", border: "1px solid rgba(51,65,85,0.6)", color: "#e2e8f0" }}>{PALETTE_ITEMS.map(p => <option key={p.type} value={p.type}>{p.icon} {p.label}</option>)}</select></label>
              <label className="flex flex-col gap-1"><span className="text-xs text-slate-400">Data Source</span><select value={selectedWidget.config.dataSource} onChange={(e) => updateWidgetConfig(selectedWidget.id, { dataSource: e.target.value })} className="px-3 py-1.5 rounded-lg text-sm focus:outline-none" style={{ backgroundColor: "rgba(30,41,59,0.8)", border: "1px solid rgba(51,65,85,0.6)", color: "#e2e8f0" }}><option value="">-- Pilih sumber --</option>{tables.map(t => <option key={t.layer + "/" + t.tableName} value={t.layer + "/" + t.tableName}>{t.displayName || t.tableName}</option>)}</select></label>

              {/* KPI-specific config */}
              {selectedWidget.type === "KPI" && widgetColumns.length > 0 && (
                <div className="space-y-4 border border-slate-700/50 rounded-xl p-3 bg-slate-900/30">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">🔢 KPI Settings</p>
                  <label className="flex flex-col gap-1"><span className="text-xs text-slate-400">Value Column</span>
                    <select value={selectedWidget.config.kpiField} onChange={(e) => updateWidgetConfig(selectedWidget.id, { kpiField: e.target.value, xField: e.target.value })} className="px-3 py-1.5 rounded-lg text-sm focus:outline-none" style={{ backgroundColor: "rgba(30,41,59,0.8)", border: "1px solid rgba(51,65,85,0.6)", color: "#e2e8f0" }}>
                      <option value="">-- Pilih kolom --</option>
                      {widgetColumns.filter(c => c.type === "numeric" || c.type === "date").map(c => <option key={c.name} value={c.name}>{c.type === "numeric" ? "🔢" : "📅"} {c.name} ({c.type})</option>)}
                      {widgetColumns.filter(c => c.type === "text" || c.type === "categorical").map(c => <option key={c.name} value={c.name}>📝 {c.name} ({c.type})</option>)}
                    </select></label>
                  <label className="flex flex-col gap-1"><span className="text-xs text-slate-400">Aggregation</span>
                    <select value={selectedWidget.config.aggregation} onChange={(e) => updateWidgetConfig(selectedWidget.id, { aggregation: e.target.value, yField: e.target.value })} className="px-3 py-1.5 rounded-lg text-sm focus:outline-none" style={{ backgroundColor: "rgba(30,41,59,0.8)", border: "1px solid rgba(51,65,85,0.6)", color: "#e2e8f0" }}>
                      <option value="SUM">SUM — Total</option><option value="AVG">AVG — Rata-rata</option><option value="COUNT">COUNT — Jumlah baris</option><option value="MIN">MIN — Nilai minimum</option><option value="MAX">MAX — Nilai maksimum</option>
                    </select></label>
                  <label className="flex flex-col gap-1"><span className="text-xs text-slate-400">Group By (optional)</span>
                    <select value={selectedWidget.config.groupBy} onChange={(e) => updateWidgetConfig(selectedWidget.id, { groupBy: e.target.value })} className="px-3 py-1.5 rounded-lg text-sm focus:outline-none" style={{ backgroundColor: "rgba(30,41,59,0.8)", border: "1px solid rgba(51,65,85,0.6)", color: "#e2e8f0" }}>
                      <option value="">-- Tidak pakai group --</option>
                      {widgetColumns.filter(c => c.type === "categorical" || c.type === "text").map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                    </select></label>
                  <div className="border-t border-slate-700/30 pt-4 mt-2">
                    <p className="text-[10px] uppercase tracking-wider text-amber-400 font-semibold mb-2">🔍 Filter (WHERE)</p>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-1"><span className="text-[10px] text-slate-400">Column</span>
                        <select value={selectedWidget.config.filterField} onChange={(e) => updateWidgetConfig(selectedWidget.id, { filterField: e.target.value })} className="px-2 py-1.5 rounded-lg text-xs focus:outline-none" style={{ backgroundColor: "rgba(30,41,59,0.8)", border: "1px solid rgba(51,65,85,0.6)", color: "#e2e8f0" }}>
                          <option value="">-- All data --</option>
                          {widgetColumns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                        </select></label>
                      <label className="flex flex-col gap-1"><span className="text-[10px] text-slate-400">Value</span>
                        <input type="text" value={selectedWidget.config.filterValue} onChange={(e) => updateWidgetConfig(selectedWidget.id, { filterValue: e.target.value })} placeholder="e.g. Matched" className="px-2 py-1.5 rounded-lg text-xs focus:outline-none" style={{ backgroundColor: "rgba(30,41,59,0.8)", border: "1px solid rgba(51,65,85,0.6)", color: "#e2e8f0" }} />
                      </label>
                    </div>
                  </div>
                </div>
              )}
              {/* Chart-specific axis fields */}
              {selectedWidget.type !== "KPI" && selectedWidget.type !== "TEXT" && widgetColumns.length > 0 && (
                <div className="space-y-4 border border-slate-700/50 rounded-xl p-3 bg-slate-900/30">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{selectedWidget.type === "TABLE" ? "📋 Column Settings" : "📊 Axis Fields"}</p>
                  <label className="flex flex-col gap-1"><span className="text-xs text-slate-400">{selectedWidget.type === "PIE" ? "Labels (X-axis)" : selectedWidget.type === "TABLE" ? "Columns to show" : "X-axis Field"}</span>
                    <select value={selectedWidget.config.xField} onChange={(e) => updateWidgetConfig(selectedWidget.id, { xField: e.target.value })} className="px-3 py-1.5 rounded-lg text-sm focus:outline-none" style={{ backgroundColor: "rgba(30,41,59,0.8)", border: "1px solid rgba(51,65,85,0.6)", color: "#e2e8f0" }}>
                      <option value="">-- Pilih kolom --</option>
                      {selectedWidget.type === "LINE" || selectedWidget.type === "AREA" ? widgetColumns.filter(c => c.type === "date" || c.type === "numeric").map(c => <option key={c.name} value={c.name}>{c.name} ({c.type})</option>) : widgetColumns.filter(c => c.type !== "date").map(c => <option key={c.name} value={c.name}>{c.name} ({c.type})</option>)}
                    </select></label>
                  {selectedWidget.type !== "TABLE" && (
                    <label className="flex flex-col gap-1"><span className="text-xs text-slate-400">Y-axis Field</span>
                      <select value={selectedWidget.config.yField} onChange={(e) => updateWidgetConfig(selectedWidget.id, { yField: e.target.value })} className="px-3 py-1.5 rounded-lg text-sm focus:outline-none" style={{ backgroundColor: "rgba(30,41,59,0.8)", border: "1px solid rgba(51,65,85,0.6)", color: "#e2e8f0" }}>
                        <option value="">-- Pilih kolom --</option>
                        {widgetColumns.filter(c => c.type === "numeric").map(c => <option key={c.name} value={c.name}>{c.name} ({c.type})</option>)}
                      </select></label>
                  )}
                </div>
              )}
              {/* Color */}
              <label className="flex flex-col gap-1"><span className="text-xs text-slate-400">🎨 Color</span>
                <div className="flex items-center gap-2">
                  <input type="color" value={selectedWidget.config.color} onChange={(e) => updateWidgetConfig(selectedWidget.id, { color: e.target.value })} className="w-8 h-8 rounded cursor-pointer border-0 p-0" style={{ backgroundColor: "transparent" }} />
                  <input type="text" value={selectedWidget.config.color} onChange={(e) => updateWidgetConfig(selectedWidget.id, { color: e.target.value })} className="flex-1 px-3 py-1.5 rounded-lg text-sm focus:outline-none font-mono" style={{ backgroundColor: "rgba(30,41,59,0.8)", border: "1px solid rgba(51,65,85,0.6)", color: "#e2e8f0" }} />
                </div></label>
              {/* Resize presets */}
              <div className="space-y-2"><span className="text-xs text-slate-400">📐 Size</span>
                <div className="grid grid-cols-4 gap-1">
                  {[{ w: 3, h: 2, label: "S" }, { w: 4, h: 3, label: "M" }, { w: 6, h: 4, label: "L" }, { w: 12, h: 4, label: "↔" }].map(sz => (
                    <button key={sz.label} onClick={() => resizeWidget(selectedWidget.id, sz.w, sz.h)} className={"py-1 text-[10px] rounded-md border transition-all " + (selectedWidget.gridW === sz.w && selectedWidget.gridH === sz.h ? "border-emerald-500 bg-emerald-500/10 text-emerald-400" : "border-slate-700 bg-slate-800/50 text-slate-500 hover:border-slate-600 hover:text-slate-300")} title={sz.w + "×" + sz.h}>{sz.label} <span className="opacity-50">{sz.w}×{sz.h}</span></button>
                  ))}</div></div>
              {/* Delete */}
              <button onClick={() => { removeWidget(selectedWidget.id); }} className="w-full py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs hover:bg-red-500/20">🗑️ Remove Widget</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
