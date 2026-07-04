"use client";

import { useState, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { v4 as randomId } from "uuid";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

const STEP_TYPES = [
  { type: "SOURCE",      icon: "📥", label: "Source",      color: "emerald" },
  { type: "CLEAN",       icon: "🧹", label: "Clean",       color: "sky" },
  { type: "VALIDATE",    icon: "✅", label: "Validate",    color: "green" },
  { type: "TRANSFORM",   icon: "🔄", label: "Transform",   color: "blue" },
  { type: "JOIN",        icon: "🔗", label: "Join",        color: "violet" },
  { type: "FILTER",      icon: "🔍", label: "Filter",      color: "amber" },
  { type: "CATEGORIZE",  icon: "🏷️",  label: "Categorize", color: "pink" },
  { type: "AGGREGATE",   icon: "📊", label: "Aggregate",   color: "orange" },
  { type: "SORT",        icon: "↕️",  label: "Sort",       color: "cyan" },
  { type: "PIVOT",       icon: "📐", label: "Pivot",       color: "purple" },
  { type: "OUTPUT",      icon: "📤", label: "Output",      color: "red" },
] as const;

type StepType = (typeof STEP_TYPES)[number]["type"];

interface PipelineNode {
  id: string;
  type: StepType;
  order: number;
  config: Record<string, unknown>;
}

interface ConfigState {
  // SOURCE
  sourceId?: string;
  // CLEAN
  stripWhitespace?: boolean;
  deduplicate?: boolean;
  fillNulls?: boolean;
  fillNullsValue?: string;
  // VALIDATE
  validationRules?: string;
  // TRANSFORM
  calculatedColumns?: string;
  // JOIN
  joinType?: string;
  joinKey?: string;
  joinSource?: string;
  // FILTER
  filterCondition?: string;
  // CATEGORIZE
  categorizeField?: string;
  categories?: string;
  // AGGREGATE
  groupBy?: string;
  aggregations?: string;
  // SORT
  sortField?: string;
  sortDirection?: string;
  // PIVOT
  pivotRows?: string;
  pivotColumns?: string;
  pivotValues?: string;
  // OUTPUT
  outputLayer?: string;
  outputTable?: string;
}

const defaultConfig: Record<StepType, ConfigState> = {
  SOURCE:     { sourceId: "" },
  CLEAN:      { stripWhitespace: true, deduplicate: true, fillNulls: false, fillNullsValue: "" },
  VALIDATE:   { validationRules: "" },
  TRANSFORM:  { calculatedColumns: "" },
  JOIN:       { joinType: "INNER", joinKey: "", joinSource: "" },
  FILTER:     { filterCondition: "" },
  CATEGORIZE: { categorizeField: "", categories: "" },
  AGGREGATE:  { groupBy: "", aggregations: "" },
  SORT:       { sortField: "", sortDirection: "ASC" },
  PIVOT:      { pivotRows: "", pivotColumns: "", pivotValues: "" },
  OUTPUT:     { outputLayer: "SILVER", outputTable: "" },
};

// ──────────────────────────────────────────────
// Config Panel per step type
// ──────────────────────────────────────────────

function ConfigPanel({
  node,
  config,
  onChange,
  onDelete,
}: {
  node: PipelineNode;
  config: ConfigState;
  onChange: (patch: ConfigState) => void;
  onDelete: () => void;
}) {
  const info = STEP_TYPES.find((s) => s.type === node.type)!;

  const set = (k: keyof ConfigState, v: unknown) => onChange({ [k]: v });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-white text-sm flex items-center gap-2">
          <span>{info.icon}</span> {info.label} Config
        </h3>
        <button
          onClick={onDelete}
          className="text-xs px-2 py-1 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-all"
        >
          Remove
        </button>
      </div>

      <div className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
        Step #{node.order}
      </div>

      {/* ── SOURCE ── */}
      {node.type === "SOURCE" && (
        <Field label="Data Source ID" helper="Select the source dataset for this pipeline">
          <input
            value={config.sourceId ?? ""}
            onChange={(e) => set("sourceId", e.target.value)}
            placeholder="e.g. 1 or source name"
            className="input"
          />
        </Field>
      )}

      {/* ── CLEAN ── */}
      {node.type === "CLEAN" && (
        <div className="space-y-3">
          <Checkbox checked={config.stripWhitespace ?? true} onChange={(v) => set("stripWhitespace", v)} label="Strip whitespace" />
          <Checkbox checked={config.deduplicate ?? true} onChange={(v) => set("deduplicate", v)} label="Deduplicate rows" />
          <Checkbox checked={config.fillNulls ?? false} onChange={(v) => set("fillNulls", v)} label="Fill null values" />
          {config.fillNulls && (
            <Field label="Fill value">
              <input
                value={config.fillNullsValue ?? ""}
                onChange={(e) => set("fillNullsValue", e.target.value)}
                placeholder="0, N/A, or empty"
                className="input"
              />
            </Field>
          )}
        </div>
      )}

      {/* ── VALIDATE ── */}
      {node.type === "VALIDATE" && (
        <Field label="Validation Rules" helper="One rule per line: field operator value (e.g. age > 0)">
          <textarea
            value={config.validationRules ?? ""}
            onChange={(e) => set("validationRules", e.target.value)}
            rows={4}
            placeholder={"age > 0\nemail IS NOT NULL\nstatus IN ('active','pending')"}
            className="input resize-none"
          />
        </Field>
      )}

      {/* ── TRANSFORM ── */}
      {node.type === "TRANSFORM" && (
        <Field label="Calculated Columns" helper="One per line: new_col = expression (e.g. full_name = first || ' ' || last)">
          <textarea
            value={config.calculatedColumns ?? ""}
            onChange={(e) => set("calculatedColumns", e.target.value)}
            rows={4}
            placeholder={"full_name = first || ' ' || last\ntotal = price * qty"}
            className="input resize-none"
          />
        </Field>
      )}

      {/* ── JOIN ── */}
      {node.type === "JOIN" && (
        <div className="space-y-3">
          <Field label="Join Type">
            <select
              value={config.joinType ?? "INNER"}
              onChange={(e) => set("joinType", e.target.value)}
              className="input"
            >
              {["INNER", "LEFT", "RIGHT", "FULL"].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Join Key" helper="Column name to join on">
            <input
              value={config.joinKey ?? ""}
              onChange={(e) => set("joinKey", e.target.value)}
              placeholder="e.g. id"
              className="input"
            />
          </Field>
          <Field label="Join Source" helper="Table or step # to join with">
            <input
              value={config.joinSource ?? ""}
              onChange={(e) => set("joinSource", e.target.value)}
              placeholder="e.g. users_table"
              className="input"
            />
          </Field>
        </div>
      )}

      {/* ── FILTER ── */}
      {node.type === "FILTER" && (
        <Field label="Filter Condition" helper="SQL-like WHERE clause (e.g. status = 'active' AND age > 18)">
          <textarea
            value={config.filterCondition ?? ""}
            onChange={(e) => set("filterCondition", e.target.value)}
            rows={3}
            placeholder={"status = 'active' AND age > 18"}
            className="input resize-none"
          />
        </Field>
      )}

      {/* ── CATEGORIZE ── */}
      {node.type === "CATEGORIZE" && (
        <div className="space-y-3">
          <Field label="Field to Categorize" helper="Column name">
            <input
              value={config.categorizeField ?? ""}
              onChange={(e) => set("categorizeField", e.target.value)}
              placeholder="e.g. amount"
              className="input"
            />
          </Field>
          <Field label="Categories" helper="One per line: label: condition (e.g. Low: amount < 100)">
            <textarea
              value={config.categories ?? ""}
              onChange={(e) => set("categories", e.target.value)}
              rows={4}
              placeholder={"Low: amount < 100\nMedium: amount >= 100 AND amount < 1000\nHigh: amount >= 1000"}
              className="input resize-none"
            />
          </Field>
        </div>
      )}

      {/* ── AGGREGATE ── */}
      {node.type === "AGGREGATE" && (
        <div className="space-y-3">
          <Field label="Group By" helper="Comma-separated columns">
            <input
              value={config.groupBy ?? ""}
              onChange={(e) => set("groupBy", e.target.value)}
              placeholder="e.g. region, category"
              className="input"
            />
          </Field>
          <Field label="Aggregations" helper="One per line: alias = FUNCTION(column) (e.g. total = SUM(amount))">
            <textarea
              value={config.aggregations ?? ""}
              onChange={(e) => set("aggregations", e.target.value)}
              rows={4}
              placeholder={"total = SUM(amount)\ncount = COUNT(*)\navg_price = AVG(price)"}
              className="input resize-none"
            />
          </Field>
        </div>
      )}

      {/* ── SORT ── */}
      {node.type === "SORT" && (
        <div className="space-y-3">
          <Field label="Sort Field">
            <input
              value={config.sortField ?? ""}
              onChange={(e) => set("sortField", e.target.value)}
              placeholder="e.g. created_at"
              className="input"
            />
          </Field>
          <Field label="Direction">
            <select
              value={config.sortDirection ?? "ASC"}
              onChange={(e) => set("sortDirection", e.target.value)}
              className="input"
            >
              <option value="ASC">Ascending (A→Z)</option>
              <option value="DESC">Descending (Z→A)</option>
            </select>
          </Field>
        </div>
      )}

      {/* ── PIVOT ── */}
      {node.type === "PIVOT" && (
        <div className="space-y-3">
          <Field label="Row Field" helper="Column for pivot rows">
            <input
              value={config.pivotRows ?? ""}
              onChange={(e) => set("pivotRows", e.target.value)}
              placeholder="e.g. product"
              className="input"
            />
          </Field>
          <Field label="Column Field" helper="Column for pivot columns">
            <input
              value={config.pivotColumns ?? ""}
              onChange={(e) => set("pivotColumns", e.target.value)}
              placeholder="e.g. month"
              className="input"
            />
          </Field>
          <Field label="Value Field" helper="Column for pivot values">
            <input
              value={config.pivotValues ?? ""}
              onChange={(e) => set("pivotValues", e.target.value)}
              placeholder="e.g. revenue"
              className="input"
            />
          </Field>
        </div>
      )}

      {/* ── OUTPUT ── */}
      {node.type === "OUTPUT" && (
        <div className="space-y-3">
          <Field label="Output Layer">
            <select
              value={config.outputLayer ?? "SILVER"}
              onChange={(e) => set("outputLayer", e.target.value)}
              className="input"
            >
              <option value="SILVER">Silver — Cleaned data</option>
              <option value="BRONZE">Bronze — Enriched data</option>
              <option value="GOLD">Gold — Aggregated KPIs</option>
            </select>
          </Field>
          <Field label="Output Table Name" helper="Name for the resulting lakehouse table">
            <input
              value={config.outputTable ?? ""}
              onChange={(e) => set("outputTable", e.target.value)}
              placeholder="e.g. clean_orders"
              className="input"
            />
          </Field>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Small UI primitives
// ──────────────────────────────────────────────

function Field({ label, helper, children }: { label: string; helper?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-slate-300">{label}</label>
      {children}
      {helper && <p className="text-[10px] text-slate-500">{helper}</p>}
    </div>
  );
}

function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer group">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500/50"
      />
      <span className="text-xs text-slate-300 group-hover:text-white transition-colors">{label}</span>
    </label>
  );
}

// ──────────────────────────────────────────────
// Layout — same CSS shared across subcomponents
// ──────────────────────────────────────────────

const inputClass =
  "w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 transition-colors";

/* inject a scoped style block for the input class used throughout */
function Styles() {
  return (
    <style>{`
      .input {
        width: 100%;
        padding: 8px 12px;
        border-radius: 8px;
        background: rgb(15 23 42);
        border: 1px solid rgb(51 65 85);
        color: #fff;
        font-size: 12px;
      }
      .input::placeholder { color: rgb(100 116 139); }
      .input:focus { outline: none; border-color: rgb(16 185 129); }
      select.input { appearance: none; }
    `}</style>
  );
}

// ──────────────────────────────────────────────
// MAIN PAGE
// ──────────────────────────────────────────────

function NewPipelineContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Pre-fill from query params (e.g. from source card "Create Pipeline" button)
  const prefilledSourceId = searchParams.get("sourceId") || "";
  const prefilledSourceName = searchParams.get("sourceName") || "";
  // Pre-fill from lakehouse detail page
  const prefilledSourceTable = searchParams.get("sourceTable") || "";
  const prefilledSourceLayer = (searchParams.get("sourceLayer") || "").toUpperCase(); // BRONZE | SILVER | GOLD
  const prefilledTargetLayer = searchParams.get("targetLayer")?.toUpperCase() || "";

  const displaySource = prefilledSourceName || prefilledSourceTable;
  const hasLakehouseSource = !!(prefilledSourceTable && prefilledSourceLayer);

  const [name, setName] = useState(displaySource ? `${displaySource} Pipeline` : "");
  const [description, setDescription] = useState("");
  const [sourceId, setSourceId] = useState(prefilledSourceId);
  const [nodes, setNodes] = useState<PipelineNode[]>(() => {
    // Auto-add SOURCE and OUTPUT nodes when coming from a data source card
    if (prefilledSourceId) {
      const sourceNode: PipelineNode = {
        id: randomId(),
        type: "SOURCE",
        order: 1,
        config: { sourceId: prefilledSourceId },
      };
      let tblName = prefilledSourceName.toLowerCase().replace(/[^a-z0-9]/g, "_") + "_clean";
      if (/^[0-9]/.test(tblName)) tblName = "t_" + tblName;
      const outputNode: PipelineNode = {
        id: randomId(),
        type: "OUTPUT",
        order: 2,
        config: { outputLayer: "SILVER", outputTable: tblName },
      };
      return [sourceNode, outputNode];
    }
    return [];
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showTemplates, setShowTemplates] = useState(true);

  const canvasRef = useRef<HTMLDivElement>(null);

  // ── Pipeline Templates ──
  type TemplateName = "quick-clean" | "raw-bronze" | "aggregation" | "full-etl" | "medallion" | "join-enrich" | "custom";

  interface TemplateStep {
    type: StepType;
    overrides?: Record<string, any>;
  }

  const TEMPLATES: { id: TemplateName; icon: string; label: string; desc: string; steps: TemplateStep[] }[] = [
    {
      id: "raw-bronze",
      icon: "🟤",
      label: "Raw → Bronze",
      desc: "Simpan data mentah ke Bronze layer — tanpa transformasi",
      steps: [{ type: "SOURCE" }, { type: "OUTPUT", overrides: { outputLayer: "BRONZE" } }],
    },
    {
      id: "quick-clean",
      icon: "🧹",
      label: "Quick Clean → Silver",
      desc: "Bersihin CSV: hapus duplikat, trim spasi, fill null → simpan ke Silver",
      steps: [{ type: "SOURCE" }, { type: "CLEAN" }, { type: "OUTPUT", overrides: { outputLayer: "SILVER" } }],
    },
    {
      id: "aggregation",
      icon: "📊",
      label: "Aggregation → Gold",
      desc: "Group by + hitung total, rata-rata, count → simpan ke Gold",
      steps: [{ type: "SOURCE" }, { type: "CLEAN" }, { type: "AGGREGATE" }, { type: "OUTPUT", overrides: { outputLayer: "GOLD" } }],
    },
    {
      id: "medallion",
      icon: "🏅",
      label: "Full Medallion",
      desc: "Bronze (raw) → Silver (clean) → Gold (aggregate) — 3 layer pipeline lengkap",
      steps: [
        { type: "SOURCE" },
        { type: "OUTPUT", overrides: { outputLayer: "BRONZE" } },
        { type: "CLEAN" },
        { type: "OUTPUT", overrides: { outputLayer: "SILVER" } },
        { type: "AGGREGATE" },
        { type: "OUTPUT", overrides: { outputLayer: "GOLD" } },
      ],
    },
    {
      id: "full-etl",
      icon: "🔄",
      label: "Full ETL → Silver",
      desc: "Pipeline lengkap: clean → validate → transform → filter → simpan ke Silver",
      steps: [{ type: "SOURCE" }, { type: "CLEAN" }, { type: "VALIDATE" }, { type: "TRANSFORM" }, { type: "FILTER" }, { type: "OUTPUT", overrides: { outputLayer: "SILVER" } }],
    },
    {
      id: "join-enrich",
      icon: "🔗",
      label: "Join & Enrich → Silver",
      desc: "Gabung 2 tabel lalu transform hasilnya → simpan ke Silver",
      steps: [{ type: "SOURCE" }, { type: "JOIN" }, { type: "TRANSFORM" }, { type: "OUTPUT", overrides: { outputLayer: "SILVER" } }],
    },
  ];

  const handleTemplateClick = useCallback(
    (tpl: typeof TEMPLATES[number] | null) => {
      setShowTemplates(false);
      if (!tpl) return; // custom — keep current nodes (or empty)

      const srcId = prefilledSourceId || sourceId;
      let tblName = (prefilledSourceTable || prefilledSourceName).toLowerCase().replace(/[^a-z0-9]/g, "_") + "_result";
      // PostgreSQL doesn't allow table names starting with digits
      if (/^[0-9]/.test(tblName)) tblName = "t_" + tblName;

      const newNodes: PipelineNode[] = tpl.steps.map((step, i) => ({
        id: randomId(),
        type: step.type,
        order: i + 1,
        config: {
          ...defaultConfig[step.type],
          ...(step.type === "SOURCE" && srcId ? { sourceId: srcId } : {}),
          ...(step.type === "SOURCE" && hasLakehouseSource ? { sourceTable: prefilledSourceTable, sourceLayer: prefilledSourceLayer } : {}),
          ...(step.type === "OUTPUT" ? { outputLayer: step.overrides?.outputLayer || "SILVER", outputTable: tblName + (step.overrides?.outputLayer ? "_" + step.overrides.outputLayer.toLowerCase() : "") } : {}),
          ...(step.overrides || {}),
        },
      }));
      setNodes(newNodes);
      setSelectedId(null);
    },
    [prefilledSourceId, prefilledSourceName, prefilledSourceTable, sourceId],
  );

  // ── Add node from toolbox ──
  const addNode = useCallback(
    (type: StepType) => {
      const newNode: PipelineNode = {
        id: randomId(),
        type,
        order: nodes.length + 1,
        config: { ...defaultConfig[type] },
      };
      const updated = [...nodes, newNode];
      setNodes(updated);
      setSelectedId(newNode.id);
    },
    [nodes],
  );

  // ── Move node up/down ──
  const moveNode = useCallback(
    (id: string, direction: "up" | "down") => {
      setNodes((prev) => {
        const idx = prev.findIndex((n) => n.id === id);
        if (idx < 0) return prev;
        const target = direction === "up" ? idx - 1 : idx + 1;
        if (target < 0 || target >= prev.length) return prev;
        const swapped = [...prev];
        [swapped[idx], swapped[target]] = [swapped[target], swapped[idx]];
        return swapped.map((n, i) => ({ ...n, order: i + 1 }));
      });
    },
    [],
  );

  // ── Update config for selected node ──
  const updateConfig = useCallback(
    (patch: ConfigState) => {
      setNodes((prev) =>
        prev.map((n) =>
          n.id === selectedId ? { ...n, config: { ...n.config, ...patch } } : n,
        ),
      );
    },
    [selectedId],
  );

  // ── Delete node ──
  const deleteNode = useCallback(
    (id: string) => {
      setNodes((prev) => {
        const filtered = prev.filter((n) => n.id !== id);
        return filtered.map((n, i) => ({ ...n, order: i + 1 }));
      });
      if (selectedId === id) setSelectedId(null);
    },
    [selectedId],
  );

  // ── Save pipeline ──
  const handleSave = async () => {
    if (!name.trim()) {
      setError("Pipeline name is required");
      return;
    }
    if (nodes.length === 0) {
      setError("Add at least one step");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const steps = nodes.map((n) => ({
        type: n.type,
        order: n.order,
        config: JSON.stringify(n.config),
        inputLayer: n.type === "SOURCE" ? (n.config as ConfigState).outputLayer || "SILVER" : null,
        outputLayer: n.type === "OUTPUT" ? (n.config as ConfigState).outputLayer || "SILVER" : null,
        outputTable: n.type === "OUTPUT" ? (n.config as ConfigState).outputTable || null : null,
      }));

      const body = {
        name: name.trim(),
        description: description.trim() || null,
        sourceId: sourceId ? Number(sourceId) : null,
        steps,
      };

      const res = await fetch("/api/pipelines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      router.push(`/pipelines/${data.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  // ── Selected node ──
  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;

  return (
    <div className="h-screen flex flex-col bg-[#0b0f1f] text-slate-200">
      <Styles />

      {/* === TOP BAR === */}
      <header className="shrink-0 h-14 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-900/60 backdrop-blur">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/pipelines")}
            className="text-slate-400 hover:text-white text-sm"
          >
            ← Back
          </button>
          <div className="h-5 w-px bg-slate-700" />
          <h1 className="font-bold text-white text-sm">Pipeline Designer</h1>
        </div>
        <div className="flex items-center gap-3">
          {error && (
            <span className="text-red-400 text-xs">{error}</span>
          )}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Pipeline name..."
            className="w-48 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
          />
          <input
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            placeholder="Source ID"
            className="w-28 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 rounded-lg bg-emerald-500 text-slate-950 text-sm font-bold hover:bg-emerald-400 disabled:opacity-50 transition-all"
          >
            {saving ? "Saving..." : "💾 Save Pipeline"}
          </button>
        </div>
      </header>

      {/* === BODY: 3-column === */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── LEFT SIDEBAR: Toolbox ── */}
        <aside className="w-56 shrink-0 border-r border-slate-800 bg-slate-900/40 backdrop-blur overflow-y-auto p-4 space-y-3">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
            🧰 Step Toolbox
          </h3>
          <p className="text-[10px] text-slate-500 -mt-3 mb-4">
            Click a step type to add it to your pipeline
          </p>
          {STEP_TYPES.map((step) => (
            <button
              key={step.type}
              onClick={() => addNode(step.type)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-700/50 bg-slate-800/60 hover:bg-slate-800 hover:border-slate-600 transition-all text-left group"
            >
              <span className="text-lg">{step.icon}</span>
              <span className="text-xs font-medium text-slate-300 group-hover:text-white">
                {step.label}
              </span>
            </button>
          ))}
        </aside>

        {/* ── CENTER: Canvas ── */}
        <main className="flex-1 overflow-y-auto p-8" ref={canvasRef}>
          {/* Template picker */}
          {showTemplates && (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-6">
              <div className="space-y-2">
                <div className="text-5xl">🎯</div>
                <h2 className="text-xl font-bold text-white">Pilih Template Pipeline</h2>
                <p className="text-sm text-slate-400 max-w-sm">
                  Pilih template di bawah atau klik <span className="text-white font-medium">✏️ Custom</span> untuk bikin dari nol
                </p>
                {prefilledSourceId && (
                  <p className="text-xs text-emerald-400/70">
                    📥 Source: <span className="font-mono">{prefilledSourceName}</span>
                  </p>
                )}
                {hasLakehouseSource && (
                  <p className="text-xs text-emerald-400/70">
                    📥 Lakehouse: <span className="font-mono">{prefilledSourceTable}</span>
                    <span className={`ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      prefilledSourceLayer === "BRONZE" ? "bg-amber-500/10 text-amber-400" :
                      prefilledSourceLayer === "SILVER" ? "bg-slate-500/10 text-slate-400" :
                      "bg-emerald-500/10 text-emerald-400"
                    }`}>{prefilledSourceLayer}</span>
                    {prefilledTargetLayer && (
                      <span className="ml-1">→ <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        prefilledTargetLayer === "GOLD" ? "bg-emerald-500/10 text-emerald-400" :
                        "bg-slate-500/10 text-slate-400"
                      }`}>{prefilledTargetLayer}</span></span>
                    )}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 max-w-2xl w-full">
                {TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => handleTemplateClick(tpl)}
                    className="text-left p-5 rounded-2xl border border-slate-700/50 bg-slate-800/40 hover:bg-slate-800 hover:border-emerald-500/40 transition-all group"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-3xl">{tpl.icon}</span>
                      <div>
                        <p className="font-bold text-white text-sm group-hover:text-emerald-400 transition-colors">
                          {tpl.label}
                        </p>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider">
                          {tpl.steps.length} steps
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">{tpl.desc}</p>
                    <div className="mt-3 flex items-center gap-1 flex-wrap">
                      {tpl.steps.map((s, i) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-950 border border-slate-700 text-slate-400">
                          {s.type}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}

                {/* Custom / from scratch */}
                <button
                  onClick={() => handleTemplateClick(null)}
                  className="text-left p-5 rounded-2xl border border-dashed border-slate-700/50 bg-slate-800/20 hover:bg-slate-800/50 hover:border-slate-500 transition-all group col-span-2"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">✏️</span>
                    <div>
                      <p className="font-bold text-white text-sm group-hover:text-amber-400 transition-colors">
                        Custom Pipeline
                      </p>
                      <p className="text-xs text-slate-400">
                        Mulai dari canvas kosong, tambah step manual dari toolbox
                      </p>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Nodes canvas (when template hidden) */}
          {!showTemplates && nodes.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-3">
              <div className="text-5xl">🧩</div>
              <h3 className="text-lg font-bold text-white">Empty Canvas</h3>
              <p className="text-sm text-slate-400 max-w-xs">
                Click a step type from the toolbox on the left to start building your pipeline.
              </p>
              <button
                onClick={() => setShowTemplates(true)}
                className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-sm hover:bg-slate-700 transition-all"
              >
                ← Back to Templates
              </button>
            </div>
          )}

          {!showTemplates && nodes.length > 0 && (
            <div className="flex flex-col items-center gap-6 py-4">
              {/* Reset to templates link */}
              <button
                onClick={() => setShowTemplates(true)}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1"
              >
                ← Pilih template lain
              </button>
              {nodes.map((node, idx) => {
                const info = STEP_TYPES.find((s) => s.type === node.type)!;
                const isSelected = node.id === selectedId;

                return (
                  <div key={node.id} className="flex flex-col items-center w-full max-w-md">
                    {/* Connecting line above (except first) */}
                    {idx > 0 && (
                      <div className="flex flex-col items-center gap-0.5">
                        <div className="w-0.5 h-5 bg-slate-600" />
                        <div className="w-3 h-3 rounded-full border border-slate-600 bg-slate-800 flex items-center justify-center">
                          <span className="text-[8px] text-slate-500">▼</span>
                        </div>
                        <div className="w-0.5 h-2 bg-slate-600" />
                      </div>
                    )}

                    {/* Node card */}
                    <div
                      onClick={() => setSelectedId(isSelected ? null : node.id)}
                      className={`w-full rounded-2xl border p-4 cursor-pointer transition-all group ${
                        isSelected
                          ? "border-emerald-500/50 bg-slate-800/80 shadow-lg shadow-emerald-500/10"
                          : "border-slate-700/50 bg-slate-800/40 hover:border-slate-600 hover:bg-slate-800/60"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{info.icon}</span>
                          <div>
                            <p className="text-sm font-bold text-white">{info.label}</p>
                            <p className="text-[10px] text-slate-500">
                              Step #{node.order}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              moveNode(node.id, "up");
                            }}
                            disabled={idx === 0}
                            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Move up"
                          >
                            ▲
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              moveNode(node.id, "down");
                            }}
                            disabled={idx === nodes.length - 1}
                            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Move down"
                          >
                            ▼
                          </button>
                        </div>
                      </div>

                      {/* Mini config preview */}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {Object.entries(node.config).map(([k, v]) => {
                          if (v === undefined || v === null || v === "" || v === false) return null;
                          const display = typeof v === "boolean" ? k : `${k}: ${String(v).slice(0, 30)}`;
                          return (
                            <span
                              key={k}
                              className="text-[9px] px-1.5 py-0.5 rounded bg-slate-950 border border-slate-700 text-slate-500 truncate max-w-[160px]"
                            >
                              {display}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>

        {/* ── RIGHT PANEL: Config ── */}
        <aside className="w-72 shrink-0 border-l border-slate-800 bg-slate-900/40 backdrop-blur overflow-y-auto p-4">
          {selectedNode ? (
            <ConfigPanel
              node={selectedNode}
              config={selectedNode.config as ConfigState}
              onChange={updateConfig}
              onDelete={() => deleteNode(selectedNode.id)}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-3">
              <div className="text-3xl">⚙️</div>
              <h3 className="text-sm font-bold text-white">Step Config</h3>
              <p className="text-xs text-slate-500 max-w-[180px]">
                Click a step on the canvas to edit its configuration here.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export default function NewPipelinePage() {
  return (
    <Suspense fallback={<div className="h-screen bg-[#0b0f1f] flex items-center justify-center"><div className="text-slate-400">Loading...</div></div>}>
      <NewPipelineContent />
    </Suspense>
  );
}
