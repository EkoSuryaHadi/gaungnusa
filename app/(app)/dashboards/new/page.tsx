"use client";

import { useState, useEffect, useCallback } from "react";
import { 
  LineChart, BarChart3, PieChart, AreaChart, Gauge, Table2, Type,
  LayoutDashboard, TrendingUp, PenTool, Trash2, Save, Eye, 
  Grid3X3, AlignJustify, Palette, Maximize2, Plus
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Responsive, useContainerWidth } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { authFetch, clearAuth } from "@/lib/auth-client";

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
  LINE: "LineChart",
  BAR: "BarChart3",
  PIE: "PieChart",
  AREA: "AreaChart",
  KPI: "Gauge",
  TABLE: "Table2",
  TEXT: "Type",
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
  { type: "LINE", icon: "LineChart", label: "Line Chart" },
  { type: "BAR", icon: "BarChart3", label: "Bar Chart" },
  { type: "PIE", icon: "PieChart", label: "Pie Chart" },
  { type: "AREA", icon: "AreaChart", label: "Area Chart" },
  { type: "KPI", icon: "Gauge", label: "KPI Card" },
  { type: "TABLE", icon: "Table2", label: "Table" },
  { type: "TEXT", icon: "Type", label: "Text" },
];

const DEFAULT_CONFIG: WidgetConfig = {
  dataSource: "",
  xField: "",
  yField: "",
  color: "#d4a853",
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
        <span style={{ color: "var(--gold-400)", fontSize: 28 }}><Gauge /></span>
        <span className="text-3xl font-bold" style={{ color: color || "var(--gold-400)", fontFamily: "var(--font-display)" }}>
          —
        </span>
        <span style={{ color: "var(--text-muted)", fontSize: 11 }}>Sample KPI</span>
      </div>
    );
  }

  if (type === "TABLE") {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex-1 flex items-center justify-center m-2" style={{ border: "1px dashed var(--border-default)", borderRadius: "var(--radius-md)" }}>
          <span style={{ color: "var(--text-muted)", fontSize: 32 }}><Table2 /></span>
        </div>
      </div>
    );
  }

  if (type === "TEXT") {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: "var(--text-muted)", fontSize: 13, fontStyle: "italic" }}>
        <span>
          <Type style={{ display: "inline", marginRight: 6, fontSize: 16 }} /> Text block — click to edit content
        </span>
      </div>
    );
  }

  // LINE, BAR, PIE, AREA — chart placeholder
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 4 }}>
      <div style={{ fontSize: 24, opacity: 0.4, color: "var(--text-muted)" }}>
        {type === "LINE" ? <LineChart /> : type === "BAR" ? <BarChart3 /> : type === "PIE" ? <PieChart /> : <AreaChart />}
      </div>
      <div className="flex items-end gap-[2px] h-12 mt-1">
        {[30, 55, 40, 70, 50, 65, 45, 60, 75, 50].map((h, i) => (
          <div
            key={i}
            className="w-[6px] rounded-t-sm"
            style={{
              height: `${h}%`,
              backgroundColor: color || "var(--gold-400)",
              opacity: 0.25 + (i / 10) * 0.75,
            }}
          />
        ))}
      </div>
      <span style={{ color: "var(--text-muted)", fontSize: 10, marginTop: 4 }}>{label} preview</span>
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

  // Distinct values for filter dropdown
  const [distinctValues, setDistinctValues] = useState<string[]>([]);
  const [loadingDistinctValues, setLoadingDistinctValues] = useState(false);

  const { width, containerRef } = useContainerWidth();

  const selectedWidget = widgets.find((w) => w.id === selectedWidgetId) ?? null;

  const TEMPLATES: TemplateOption[] = [
    { id: "overview", icon: "LayoutDashboard", label: "Quick Overview", desc: "KPI cards + 1 chart + table. Cocok untuk lihat data sekilas.", layout: "overview" },
    { id: "deep", icon: "TrendingUp", label: "Deep Analysis", desc: "KPI + bar + pie + trend. Cocok untuk analisa mendalam.", layout: "deep" },
    { id: "table", icon: "Table2", label: "Table Explorer", desc: "Full table + filter + row count. Cocok eksplorasi data.", layout: "table" },
    { id: "custom", icon: "PenTool", label: "Custom", desc: "Mulai dari grid kosong, tambah widget manual.", layout: "custom" },
  ];

  /* ── Fetch tables on mount ── */
  useEffect(() => {
    authFetch("/api/lakehouse/tables")
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
      const res = await authFetch(`/api/lakehouse/${layer}/${tableName}/schema`);
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
      const res = await authFetch(`/api/lakehouse/${layer}/${tableName}/schema`);
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

  /* ── Fetch distinct values for filter column ── */
  const fetchDistinctValues = useCallback(async (dataSource: string, column: string) => {
    if (!dataSource || !column) {
      setDistinctValues([]);
      return;
    }
    const [layer, ...rest] = dataSource.split("/");
    const tableName = rest.join("/");
    if (!layer || !tableName) return;

    setLoadingDistinctValues(true);
    try {
      const res = await authFetch(`/api/lakehouse/${layer}/${tableName}/distinct?column=${encodeURIComponent(column)}&limit=100`);
      if (!res.ok) throw new Error("Fetch failed");
      const data = await res.json();
      setDistinctValues(data.values || []);
    } catch {
      setDistinctValues([]);
    } finally {
      setLoadingDistinctValues(false);
    }
  }, []);

  // Fetch distinct values when filter column changes
  useEffect(() => {
    if (selectedWidget?.config?.dataSource && selectedWidget?.config?.filterField) {
      fetchDistinctValues(selectedWidget.config.dataSource, selectedWidget.config.filterField);
    } else {
      setDistinctValues([]);
    }
  }, [selectedWidget?.config?.dataSource, selectedWidget?.config?.filterField, fetchDistinctValues]);

  /* ── Detect column category from name + type ── */
  function detectColumnType(name: string, pgType: string): string {
    const dt = (pgType || "").toLowerCase();
    const n = name.toLowerCase();

    // Categorical override: int columns that are IDs/codes, not metrics
    const categoricalNames = [
      "category", "type", "status", "class", "tier", "region", "brand", "vendor",
      "store", "size", "volume", "direction", "currency",
    ];
    const categoricalPatterns = [
      /_id$/, /_no$/, /_account$/, /_code$/, /_key$/, /^id$/,
    ];
    const isCategorical = categoricalNames.some(k => n.includes(k)) ||
      categoricalPatterns.some(p => p.test(n));
    if (isCategorical) return "categorical";

    if (dt.includes("int") || dt.includes("float") || dt.includes("double") || dt.includes("numeric") || dt.includes("decimal"))
      return "numeric";
    if (dt.includes("timestamp") || dt.includes("date"))
      return "date";

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
            config: { ...DEFAULT_CONFIG, dataSource, xField: catCols[0].name, yField: numCols[0].name, color: "#d4a853" },
          });
        }
        // Row 2 right: Table
        widgets.push({
          id: `auto-${Date.now()}-${idx++}`,
          type: "TABLE",
          title: "Data Preview",
          gridX: 6, gridY: 2, gridW: 6, gridH: 4,
          config: { ...DEFAULT_CONFIG, dataSource, xField: "", yField: "", color: "#d4a853" },
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
            config: { ...DEFAULT_CONFIG, dataSource, xField: catCols[0].name, yField: numCols[0].name, color: "#d4a853" },
          });
        }
        // Pie chart
        if (catCols.length > 0 && numCols.length > 0) {
          widgets.push({
            id: `auto-${Date.now()}-${idx++}`,
            type: "PIE",
            title: `${catCols[0].name.replace(/_/g, " ")} Distribution`,
            gridX: 6, gridY: 2, gridW: 6, gridH: 4,
            config: { ...DEFAULT_CONFIG, dataSource, xField: catCols[0].name, yField: numCols.length > 1 ? numCols[1].name : numCols[0].name, color: "#c4724f" },
          });
        }
        // Trend line (date)
        if (dateCols.length > 0 && numCols.length > 0) {
          widgets.push({
            id: `auto-${Date.now()}-${idx++}`,
            type: "LINE",
            title: `${numCols[0].name.replace(/_/g, " ")} Trend`,
            gridX: 0, gridY: 6, gridW: 12, gridH: 4,
            config: { ...DEFAULT_CONFIG, dataSource, xField: dateCols[0].name, yField: numCols[0].name, color: "#8a9b7a" },
          });
        }
      } else if (template.layout === "table") {
        // Row count KPI
        widgets.push({
          id: `auto-${Date.now()}-${idx++}`,
          type: "KPI",
          title: "Total Rows",
          gridX: 0, gridY: 0, gridW: 3, gridH: 2,
          config: { ...DEFAULT_CONFIG, dataSource, xField: "COUNT(*)", yField: "", kpiField: "*", aggregation: "COUNT", color: "#d4a853" },
        });
        // Column count
        widgets.push({
          id: `auto-${Date.now()}-${idx++}`,
          type: "KPI",
          title: "Columns",
          gridX: 3, gridY: 0, gridW: 3, gridH: 2,
          config: { ...DEFAULT_CONFIG, dataSource, xField: columns.length.toString(), yField: "", color: "#d4a853" },
        });
        // Full table
        widgets.push({
          id: `auto-${Date.now()}-${idx++}`,
          type: "TABLE",
          title: "Data Table",
          gridX: 0, gridY: 2, gridW: 12, gridH: 6,
          config: { ...DEFAULT_CONFIG, dataSource, xField: "", yField: "", color: "#8a9b7a" },
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
    authFetch("/api/dashboards/" + id)
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
        const putRes = await authFetch("/api/dashboards/" + id, {
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
        const createRes = await authFetch("/api/dashboards", {
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

        const putRes = await authFetch("/api/dashboards/" + id, {
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
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "32px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ 
            fontFamily: "var(--font-display)", fontSize: 28, fontStyle: "italic",
            color: "var(--gold-400)", margin: 0, display: "flex", alignItems: "center", gap: 10 
          }}>
            Dashboard Builder
            {editingId && <span style={{ fontSize: 14, color: "var(--text-secondary)", fontStyle: "normal", fontFamily: "var(--font-body)", fontWeight: 400 }}>(Editing #{editingId})</span>}
          </h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Dashboard name…" 
            className="input" style={{ width: 260 }} />
          <button onClick={handleSave} disabled={saving} className="btn btn-primary">
            <Save style={{ width: 15, height: 15 }} />
            {saving ? "Saving…" : editingId ? "Update" : "Save"}
          </button>
          {savedId && <a href={"/dashboards/" + savedId} className="btn btn-secondary"><Eye style={{ width: 14, height: 14 }} />View</a>}
        </div>
      </div>
      {saveMessage && (
        <div style={{
          padding: "8px 16px", borderRadius: "var(--radius-md)", marginBottom: 16, fontSize: 13,
          background: saveMessage.includes("✅") ? "var(--gold-dim)" : "var(--clay-dim)",
          color: saveMessage.includes("✅") ? "var(--gold-400)" : "var(--clay-400)"
        }}>{saveMessage.replace("✅ ", "").replace("❌ ", "")}</div>
      )}
      <div style={{ display: "flex", gap: 24 }} ref={containerRef}>
        <div style={{ width: 180, flexShrink: 0 }}>
          <h2 style={{ 
            fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em",
            color: "var(--text-muted)", fontWeight: 600, marginBottom: 12 
          }}>Widget Palette</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {PALETTE_ITEMS.map((item) => (
              <button key={item.type} onClick={() => addWidget(item.type)}
                className="btn btn-ghost" style={{ 
                  justifyContent: "flex-start", fontSize: 13, width: "100%",
                  padding: "8px 12px", borderRadius: "var(--radius-md)"
                }}>
                <span style={{ fontSize: 16, opacity: 0.7 }}>
                  {item.icon === "LineChart" ? <LineChart style={{ width: 16, height: 16 }} /> : 
                   item.icon === "BarChart3" ? <BarChart3 style={{ width: 16, height: 16 }} /> :
                   item.icon === "PieChart" ? <PieChart style={{ width: 16, height: 16 }} /> :
                   item.icon === "AreaChart" ? <AreaChart style={{ width: 16, height: 16 }} /> :
                   item.icon === "Gauge" ? <Gauge style={{ width: 16, height: 16 }} /> :
                   item.icon === "Table2" ? <Table2 style={{ width: 16, height: 16 }} /> :
                   <Type style={{ width: 16, height: 16 }} />}
                </span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
          {widgets.length > 1 && (
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border-subtle)" }}>
              <h2 style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", fontWeight: 600, marginBottom: 8 }}>Arrange</h2>
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={autoArrange} className="btn btn-ghost" style={{ flex: 1, fontSize: 11, padding: "6px 8px", justifyContent: "center" }}>
                  <Grid3X3 style={{ width: 12, height: 12 }} /> Grid
                </button>
                <button onClick={stackVertical} className="btn btn-ghost" style={{ flex: 1, fontSize: 11, padding: "6px 8px", justifyContent: "center" }}>
                  <AlignJustify style={{ width: 12, height: 12 }} /> Stack
                </button>
              </div>
              <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 6, textAlign: "center" }}>{widgets.length} widgets</p>
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {showTemplates && (
            <div className="card-raised" style={{ padding: 24, marginBottom: 16 }}>
              <div style={{ marginBottom: 20 }}>
                <h2 style={{ 
                  fontFamily: "var(--font-display)", fontSize: 20, fontStyle: "italic",
                  color: "var(--gold-400)", margin: "0 0 6px 0"
                }}>Mulai dari Data</h2>
                <p style={{ color: "var(--text-secondary)", fontSize: 13, margin: 0 }}>
                  Pilih tabel lakehouse, lalu pilih template — widget auto-generated berdasarkan struktur data
                </p>
              </div>
              <div className="select-wrap" style={{ maxWidth: 420, marginBottom: 16 }}>
                <select value={selectedTableKey} onChange={(e) => { setSelectedTableKey(e.target.value); if (e.target.value) fetchTableSchema(e.target.value); }}>
                  <option value="">Pilih tabel lakehouse…</option>
                  {tables.map((t) => <option key={t.layer + "/" + t.tableName} value={t.layer + "/" + t.tableName}>{t.displayName || t.tableName} ({t.layer} · {t.rowsCount || 0} rows)</option>)}
                </select>
              </div>
              {loadingColumns && <div className="skeleton" style={{ width: 200, height: 16, borderRadius: "var(--radius-sm)" }} />}
              {!loadingColumns && tableColumns.length > 0 && (
                <div>
                  <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>
                    {tableColumns.length} columns · {tableColumns.filter(c => c.type === "numeric").length} numeric · {tableColumns.filter(c => c.type === "date").length} date
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
                    {TEMPLATES.map((tmpl) => (
                      <button key={tmpl.id} onClick={() => generateWidgets(selectedTableKey, tableColumns, tmpl)}
                        className="card" style={{
                          padding: 14, textAlign: "left", cursor: "pointer",
                          background: "var(--bg-surface)", border: "1px solid var(--border-subtle)"
                        }}>
                        <div style={{ fontSize: 20, color: "var(--gold-400)", marginBottom: 6, opacity: 0.7 }}>
                          {tmpl.icon === "LayoutDashboard" ? <LayoutDashboard /> : 
                           tmpl.icon === "TrendingUp" ? <TrendingUp /> : 
                           tmpl.icon === "Table2" ? <Table2 /> : <PenTool />}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>{tmpl.label}</div>
                        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2, lineHeight: 1.4 }}>{tmpl.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {!showTemplates && (
            <div style={{ minHeight: 400 }}>
              {widgets.length === 0 ? (
                <div className="empty-state">
                  <h3>Tambahkan widget</h3>
                  <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Pilih widget dari palette atau kembali ke template</p>
                  <button onClick={() => setShowTemplates(true)} className="btn btn-ghost">← Kembali ke template</button>
                </div>
              ) : (
                // @ts-expect-error react-grid-layout types
                <Responsive className="layout" layouts={{ lg: widgets.map(w => ({ i: w.id, x: w.gridX, y: w.gridY, w: w.gridW, h: w.gridH, minW: 2, minH: 1 })) }} breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }} cols={{ lg: cols, md: 10, sm: 6, xs: 4, xxs: 2 }} rowHeight={90} onLayoutChange={(layout) => onLayoutChange(layout)} draggableHandle=".drag-handle" isResizable={true} compactType="vertical" margin={[8, 8]}>
                  {widgets.map((w) => (
                    <div key={w.id} onClick={() => setSelectedWidgetId(w.id)}
                     style={{
                       cursor: "default",
                       borderRadius: "var(--radius-lg)",
                       border: selectedWidgetId === w.id ? "1px solid var(--gold-500)" : "1px solid var(--border-subtle)",
                       boxShadow: selectedWidgetId === w.id ? "var(--shadow-glow)" : "var(--shadow-card)",
                       background: "var(--bg-surface)",
                       overflow: "hidden",
                       transition: "all 200ms"
                     }}>
                      <div className="drag-handle" style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "6px 10px", borderBottom: "1px solid var(--border-subtle)",
                        background: "var(--bg-elevated)", cursor: "grab"
                      }}>
                        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.title}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span className="badge badge-draft">{WIDGET_TYPE_LABELS[w.type]}</span>
                          <button onClick={(e) => { e.stopPropagation(); removeWidget(w.id); }} style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: 0 }}><Trash2 style={{ width: 12, height: 12 }} /></button>
                        </div>
                      </div>
                      <div style={{ padding: 8, height: "calc(100% - 37px)" }}><PlaceholderChart type={w.type} color={w.config.color} /></div>
                    </div>
                  ))}
                </Responsive>
              )}
            </div>
          )}
        </div>
        {selectedWidget && (
          <div style={{ width: 280, flexShrink: 0 }}>
            <h2 style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", fontWeight: 600, marginBottom: 10 }}>Widget Config</h2>
            <div className="card" style={{ padding: 14, maxHeight: "calc(100vh - 220px)", overflowY: "auto" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Title</span>
                <input type="text" value={selectedWidget.title} onChange={(e) => updateWidget(selectedWidget.id, { title: e.target.value })} className="input" style={{ fontSize: 12, padding: "7px 10px" }} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Type</span>
                <div className="select-wrap">
                  <select value={selectedWidget.type} onChange={(e) => updateWidget(selectedWidget.id, { type: e.target.value as WidgetType })} style={{ fontSize: 12, padding: "7px 10px" }}>
                    {PALETTE_ITEMS.map(p => <option key={p.type} value={p.type}>{p.label}</option>)}
                  </select>
                </div>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Data Source</span>
                <div className="select-wrap">
                  <select value={selectedWidget.config.dataSource} onChange={(e) => updateWidgetConfig(selectedWidget.id, { dataSource: e.target.value })} style={{ fontSize: 12, padding: "7px 10px" }}>
                    <option value="">Pilih sumber…</option>
                    {tables.map(t => <option key={t.layer + "/" + t.tableName} value={t.layer + "/" + t.tableName}>{t.displayName || t.tableName}</option>)}
                  </select>
                </div>
              </label>

              {/* KPI-specific config */}
              {selectedWidget.type === "KPI" && widgetColumns.length > 0 && (
                <div style={{ padding: 12, marginBottom: 10, borderRadius: "var(--radius-md)", background: "var(--bg-root)", border: "1px solid var(--border-subtle)" }}>
                  <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--gold-400)", fontWeight: 600, marginBottom: 10 }}>KPI Settings</p>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Value Column</span>
                    <div className="select-wrap">
                      <select value={selectedWidget.config.kpiField} onChange={(e) => updateWidgetConfig(selectedWidget.id, { kpiField: e.target.value, xField: e.target.value })} style={{ fontSize: 12, padding: "7px 10px" }}>
                        <option value="">Pilih kolom…</option>
                        {widgetColumns.filter(c => c.type === "numeric" || c.type === "date").map(c => <option key={c.name} value={c.name}>{c.name} ({c.type})</option>)}
                        {widgetColumns.filter(c => c.type === "text" || c.type === "categorical").map(c => <option key={c.name} value={c.name}>{c.name} ({c.type})</option>)}
                      </select>
                    </div>
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Aggregation</span>
                    <div className="select-wrap">
                      <select value={selectedWidget.config.aggregation} onChange={(e) => updateWidgetConfig(selectedWidget.id, { aggregation: e.target.value, yField: e.target.value })} style={{ fontSize: 12, padding: "7px 10px" }}>
                        <option value="SUM">SUM — Total</option>
                        <option value="AVG">AVG — Rata-rata</option>
                        <option value="COUNT">COUNT — Jumlah baris</option>
                        <option value="MIN">MIN — Minimum</option>
                        <option value="MAX">MAX — Maksimum</option>
                      </select>
                    </div>
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Group By (optional)</span>
                    <div className="select-wrap">
                      <select value={selectedWidget.config.groupBy} onChange={(e) => updateWidgetConfig(selectedWidget.id, { groupBy: e.target.value })} style={{ fontSize: 12, padding: "7px 10px" }}>
                        <option value="">Tanpa group</option>
                        {widgetColumns.filter(c => c.type === "categorical" || c.type === "text").map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                      </select>
                    </div>
                  </label>
                  <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 12, marginTop: 8 }}>
                    <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--gold-400)", fontWeight: 600, marginBottom: 8 }}>Filter (WHERE)</p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Column</span>
                        <div className="select-wrap">
                          <select value={selectedWidget.config.filterField} onChange={(e) => updateWidgetConfig(selectedWidget.id, { filterField: e.target.value, filterValue: "" })} style={{ fontSize: 11, padding: "5px 8px" }}>
                            <option value="">All data</option>
                            {widgetColumns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                          </select>
                        </div>
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Value</span>
                        {selectedWidget.config.filterField ? (
                          loadingDistinctValues ? (
                            <span style={{ fontSize: 11, color: "var(--text-muted)", padding: "5px 8px" }}>Loading…</span>
                          ) : distinctValues.length > 0 ? (
                            <div className="select-wrap">
                              <select value={selectedWidget.config.filterValue} onChange={(e) => updateWidgetConfig(selectedWidget.id, { filterValue: e.target.value })} style={{ fontSize: 11, padding: "5px 8px" }}>
                                <option value="">All</option>
                                {distinctValues.map(v => <option key={v} value={String(v)}>{String(v)}</option>)}
                              </select>
                            </div>
                          ) : (
                            <input type="text" value={selectedWidget.config.filterValue} onChange={(e) => updateWidgetConfig(selectedWidget.id, { filterValue: e.target.value })} placeholder="Type…" className="input" style={{ fontSize: 11, padding: "5px 8px" }} />
                          )
                        ) : (
                          <input type="text" value="" placeholder="Select column first" disabled className="input" style={{ fontSize: 11, padding: "5px 8px", opacity: 0.4 }} />
                        )}
                      </label>
                    </div>
                  </div>
                </div>
              )}
              {/* Chart axis fields */}
              {selectedWidget.type !== "KPI" && selectedWidget.type !== "TEXT" && widgetColumns.length > 0 && (
                <div style={{ padding: 12, marginBottom: 10, borderRadius: "var(--radius-md)", background: "var(--bg-root)", border: "1px solid var(--border-subtle)" }}>
                  <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--gold-400)", fontWeight: 600, marginBottom: 10 }}>
                    {selectedWidget.type === "TABLE" ? "Columns" : "Axis Fields"}
                  </p>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                      {selectedWidget.type === "PIE" ? "Labels" : selectedWidget.type === "TABLE" ? "Show columns" : "X-axis"}
                    </span>
                    <div className="select-wrap">
                      <select value={selectedWidget.config.xField} onChange={(e) => updateWidgetConfig(selectedWidget.id, { xField: e.target.value })} style={{ fontSize: 12, padding: "7px 10px" }}>
                        <option value="">Pilih kolom…</option>
                        {selectedWidget.type === "LINE" || selectedWidget.type === "AREA" 
                          ? widgetColumns.filter(c => c.type === "date" || c.type === "numeric").map(c => <option key={c.name} value={c.name}>{c.name}</option>)
                          : widgetColumns.filter(c => c.type !== "date").map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                      </select>
                    </div>
                  </label>
                  {selectedWidget.type !== "TABLE" && (
                    <>
                      <label style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
                        <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Aggregation</span>
                        <div className="select-wrap">
                          <select
                            value={selectedWidget.config.aggregation}
                            onChange={(e) => updateWidgetConfig(selectedWidget.id, { aggregation: e.target.value })}
                            style={{ fontSize: 12, padding: "7px 10px" }}
                          >
                            <option value="COUNT">COUNT — Jumlah baris</option>
                            <option value="SUM">SUM — Total</option>
                            <option value="AVG">AVG — Rata-rata</option>
                            <option value="MIN">MIN — Minimum</option>
                            <option value="MAX">MAX — Maksimum</option>
                          </select>
                        </div>
                      </label>
                      {selectedWidget.config.aggregation !== "COUNT" && (
                        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Value (Y-axis)</span>
                          <div className="select-wrap">
                            <select
                              value={selectedWidget.config.yField}
                              onChange={(e) => updateWidgetConfig(selectedWidget.id, { yField: e.target.value })}
                              style={{ fontSize: 12, padding: "7px 10px" }}
                            >
                              <option value="">Pilih kolom…</option>
                              {widgetColumns.filter(c => c.type === "numeric").map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                            </select>
                          </div>
                        </label>
                      )}
                    </>
                  )}
                </div>
              )}
              {/* Color picker */}
              <label style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                  <Palette style={{ width: 12, height: 12, display: "inline", marginRight: 4 }} /> Color
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="color" value={selectedWidget.config.color} onChange={(e) => updateWidgetConfig(selectedWidget.id, { color: e.target.value })} style={{ width: 28, height: 28, borderRadius: "var(--radius-sm)", border: "1px solid var(--border-default)", cursor: "pointer", padding: 0, background: "transparent" }} />
                  <input type="text" value={selectedWidget.config.color} onChange={(e) => updateWidgetConfig(selectedWidget.id, { color: e.target.value })} className="input" style={{ flex: 1, fontSize: 11, padding: "7px 10px", fontFamily: "monospace" }} />
                </div>
              </label>
              {/* Resize presets */}
              <div style={{ marginBottom: 10 }}>
                <span style={{ fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
                  <Maximize2 style={{ width: 12, height: 12, display: "inline", marginRight: 4 }} /> Size
                </span>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
                  {[{ w: 3, h: 2, label: "S" }, { w: 4, h: 3, label: "M" }, { w: 6, h: 4, label: "L" }, { w: 12, h: 4, label: "Wide" }].map(sz => (
                    <button key={sz.label} onClick={() => resizeWidget(selectedWidget.id, sz.w, sz.h)}
                      className="btn btn-ghost"
                      style={{
                        padding: "4px 6px", fontSize: 10, justifyContent: "center",
                        ...(selectedWidget.gridW === sz.w && selectedWidget.gridH === sz.h 
                          ? { borderColor: "var(--gold-500)", color: "var(--gold-400)", background: "var(--gold-dim)" } 
                          : {})
                    }}>{sz.label} {sz.w}×{sz.h}</button>
                  ))}</div>
              </div>
              {/* Delete */}
              <button onClick={() => { removeWidget(selectedWidget.id); }} className="btn btn-danger" style={{ width: "100%", justifyContent: "center", fontSize: 12 }}>
                <Trash2 style={{ width: 13, height: 13 }} /> Remove Widget
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
