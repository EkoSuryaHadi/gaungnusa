"use client";

import { useState, useRef, useCallback, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { v4 as randomId } from "uuid";
import { authFetch } from "@/lib/auth-client";

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
  validationMode?: string;
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
  VALIDATE:   { validationRules: "", validationMode: "flag" },
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
// Simple Mode: Goal-Based Wizard
// ──────────────────────────────────────────────

type SimpleGoalId = "clean" | "monthly-report" | "validate" | "dashboard-ready";

interface SimpleGoal {
  id: SimpleGoalId;
  icon: string;
  title: string;
  question: string;
  steps: StepType[];
  outputLayer: string;
  autoConfig: Record<string, Record<string, unknown>>;
  previewLabel: string;
}

const SIMPLE_GOALS: SimpleGoal[] = [
  {
    id: "clean",
    icon: "🧹",
    title: "Bersihkan Data",
    question: "Data saya kotor, ada yang kosong/duplikat",
    steps: ["SOURCE", "CLEAN", "OUTPUT"],
    outputLayer: "SILVER",
    autoConfig: {
      CLEAN: { stripWhitespace: true, deduplicate: true, fillNulls: true, fillNullsValue: "0" },
      OUTPUT: { outputLayer: "SILVER" },
    },
    previewLabel: "Hapus duplikat, isi kosong → Silver",
  },
  {
    id: "monthly-report",
    icon: "📅",
    title: "Laporan Bulanan",
    question: "Saya mau laporan per bulan/status",
    steps: ["SOURCE", "CLEAN", "AGGREGATE", "OUTPUT"],
    outputLayer: "GOLD",
    autoConfig: {
      CLEAN: { stripWhitespace: true, deduplicate: true, fillNulls: false },
      AGGREGATE: {
        groupBy: "Status",
        aggregations: "total = SUM(amount)\ncount = COUNT(*)\navg = AVG(amount)",
      },
      OUTPUT: { outputLayer: "GOLD" },
    },
    previewLabel: "Group per Status, hitung total/rata-rata → Gold",
  },
  {
    id: "validate",
    icon: "🔍",
    title: "Cari Masalah",
    question: "Cek mana data yang error/ganjil",
    steps: ["SOURCE", "CLEAN", "VALIDATE", "OUTPUT"],
    outputLayer: "SILVER",
    autoConfig: {
      CLEAN: { stripWhitespace: true, deduplicate: false, fillNulls: false },
      VALIDATE: {
        validationRules: "NOT_NULL:Bank_Ref\nNUMBER:Difference,min=0\nDATE:Transaction_Date",
        validationMode: "flag",
      },
      OUTPUT: { outputLayer: "SILVER" },
    },
    previewLabel: "Flag baris error, simpan hasil → Silver",
  },
  {
    id: "dashboard-ready",
    icon: "📊",
    title: "Siap Dashboard",
    question: "Langsung tampil di grafik/diagram",
    steps: ["SOURCE", "CLEAN", "AGGREGATE", "OUTPUT"],
    outputLayer: "GOLD",
    autoConfig: {
      CLEAN: { stripWhitespace: true, deduplicate: true, fillNulls: true, fillNullsValue: "0" },
      AGGREGATE: {
        groupBy: "Status",
        aggregations: "total = SUM(amount)\ncount = COUNT(*)\nmin = MIN(amount)\nmax = MAX(amount)\navg = AVG(amount)",
      },
      OUTPUT: { outputLayer: "GOLD" },
    },
    previewLabel: "Semua metrik: MIN, MAX, AVG, SUM, COUNT → Gold",
  },
];

interface SimpleSource {
  type: "datasource" | "lakehouse";
  id: number | string;
  name: string;
  rows: number;
  layer?: string;
  sourceId?: number;
  tableName?: string;
}

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
        <h3 style={{color:"#e8e4db"}} className="font-bold text-sm flex items-center gap-2">
          <span>{info.icon}</span> {info.label} Config
        </h3>
        <button
          onClick={onDelete}
          className="text-xs px-2 py-1 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-all"
        >
          Remove
        </button>
      </div>

      <div style={{color:"#8a8578"}} className="text-[10px] uppercase tracking-wider font-medium">
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
        <div className="space-y-3">
          <Field label="Validation Rules" helper="One rule per line. Supported: NOT_NULL, COMPARE, NUMBER, DATE">
            <textarea
              value={config.validationRules ?? ""}
              onChange={(e) => set("validationRules", e.target.value)}
              rows={6}
              placeholder={"NOT_NULL:Bank_Ref\nCOMPARE:SAP_Amount,Bank_Amount,0\nNUMBER:Difference,min=0\nDATE:Transaction_Date"}
              className="input resize-none"
            />
          </Field>
          <Field label="Mode">
            <select
              value={config.validationMode ?? "flag"}
              onChange={(e) => set("validationMode", e.target.value)}
              className="input"
            >
              <option value="flag">🏷️ Flag — add _validation_issues column</option>
              <option value="drop">🗑️ Drop — remove invalid rows</option>
            </select>
          </Field>
        </div>
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
          {(config.outputLayer ?? "SILVER") === "GOLD" && (
            <div
              style={{
                background: "rgba(212,168,83,0.08)",
                border: "1px solid rgba(212,168,83,0.2)",
                borderRadius: "8px",
                padding: "8px 12px",
                display: "flex",
                alignItems: "flex-start",
                gap: "8px",
              }}
            >
              <span style={{ fontSize: "14px", flexShrink: 0, lineHeight: "18px" }}>⚠️</span>
              <span style={{ fontSize: "11px", color: "#D4A853", lineHeight: "1.5" }}>
                Output ke GOLD memerlukan AGGREGATE, JOIN, atau PIVOT step sebelumnya. Pastikan sudah ditambahkan!
              </span>
            </div>
          )}
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
      <label style={{color:"#8a8578"}} className="block text-xs font-medium">{label}</label>
      {children}
      {helper && <p style={{color:"#6b6760"}} className="text-[10px]">{helper}</p>}
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
        className="rounded border-slate-600 bg-[#1a1917] text-[#D4A853] focus:ring-[#D4A853]/50"
      />
      <span className="text-xs text-[#8a8578] group-hover:text-white transition-colors">{label}</span>
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
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .input {
        width: 100%;
        padding: 8px 12px;
        border-radius: 8px;
        background: #1a1917;
        border: 1px solid rgba(212,168,83,0.12);
        color: #e8e4db;
        font-size: 12px;
      }
      .input::placeholder { color: #6b6760; }
      .input:focus { outline: none; border-color: #D4A853; }
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

  // ── Simple Mode State ──
  const [mode, setMode] = useState<"simple" | "advanced">("simple");
  const [simpleStep, setSimpleStep] = useState<1 | 2 | 3>(1);
  const [selectedGoal, setSelectedGoal] = useState<SimpleGoalId | null>(null);
  const [selectedSource, setSelectedSource] = useState<SimpleSource | null>(null);
  const [sources, setSources] = useState<any[]>([]);
  const [lakehouseTables, setLakehouseTables] = useState<any[]>([]);
  const [simpleRunning, setSimpleRunning] = useState(false);

  // Auto-fill source from query params when in simple mode
  const simpleSourceName = selectedSource?.name || "";
  const simplePipelineName = simpleSourceName && selectedGoal
    ? `${simpleSourceName} - ${SIMPLE_GOALS.find(g => g.id === selectedGoal)?.title || ""}`
    : simpleSourceName
      ? `${simpleSourceName} Pipeline`
      : "";

  // Fetch sources & lakehouse tables for simple mode
  useEffect(() => {
    if (mode !== "simple") return;
    async function fetchData() {
      try {
        const [srcRes, lhRes] = await Promise.all([
          authFetch("/api/sources"),
          authFetch("/api/lakehouse/tables"),
        ]);
        if (srcRes.ok) {
          const srcData = await srcRes.json();
          if (Array.isArray(srcData)) setSources(srcData);
        }
        if (lhRes.ok) {
          const lhData = await lhRes.json();
          if (Array.isArray(lhData)) setLakehouseTables(lhData);
        }
      } catch {}
    }
    fetchData();
  }, [mode]);

  // Auto-select source from query params in simple mode
  useEffect(() => {
    if (mode !== "simple") return;
    if (selectedSource) return; // already selected
    if (prefilledSourceId && prefilledSourceName) {
      setSelectedSource({
        type: "datasource",
        id: Number(prefilledSourceId),
        name: prefilledSourceName,
        rows: 0,
        sourceId: Number(prefilledSourceId),
      });
    } else if (hasLakehouseSource) {
      setSelectedSource({
        type: "lakehouse",
        id: prefilledSourceTable,
        name: prefilledSourceTable,
        rows: 0,
        layer: prefilledSourceLayer,
        tableName: prefilledSourceTable,
      });
    }
  }, [mode, prefilledSourceId, prefilledSourceName, hasLakehouseSource, prefilledSourceTable, prefilledSourceLayer, selectedSource]);

  // Handle simple mode run: POST pipeline → POST run → redirect
  const handleSimpleRun = useCallback(async () => {
    if (!selectedSource || !selectedGoal) return;
    setSimpleRunning(true);
    setError("");

    const goal = SIMPLE_GOALS.find(g => g.id === selectedGoal);
    if (!goal) return;

    try {
      const sourceName = selectedSource.name;
      let tblName = sourceName.toLowerCase().replace(/[^a-z0-9]/g, "_") + "_result";
      if (/^[0-9]/.test(tblName)) tblName = "t_" + tblName;

      const steps = goal.steps.map((stepType, i) => {
        const baseConfig = { ...defaultConfig[stepType] };
        const goalConfig = goal.autoConfig[stepType] || {};

        if (stepType === "SOURCE") {
          if (selectedSource.type === "datasource") {
            baseConfig.sourceId = String(selectedSource.sourceId ?? selectedSource.id);
          } else {
            (baseConfig as any).sourceTable = selectedSource.tableName || selectedSource.name;
            (baseConfig as any).sourceLayer = selectedSource.layer || "BRONZE";
          }
        }

        if (stepType === "OUTPUT") {
          (baseConfig as any).outputLayer = goal.outputLayer;
          (baseConfig as any).outputTable = tblName;
        }

        return {
          type: stepType,
          order: i + 1,
          config: JSON.stringify({ ...baseConfig, ...goalConfig }),
          inputLayer: stepType === "SOURCE" ? goal.outputLayer : null,
          outputLayer: stepType === "OUTPUT" ? goal.outputLayer : null,
          outputTable: stepType === "OUTPUT" ? tblName : null,
        };
      });

      const body = {
        name: simplePipelineName || `${sourceName} - ${goal.title}`,
        description: null,
        sourceId: selectedSource.type === "datasource" ? Number(selectedSource.sourceId ?? selectedSource.id) : null,
        steps,
      };

      // 1. Create pipeline
      const createRes = await authFetch("/api/pipelines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!createRes.ok) {
        const errData = await createRes.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to create pipeline");
      }

      const pipeline = await createRes.json();

      // 2. Run pipeline
      const runRes = await authFetch(`/api/pipelines/${pipeline.id}/run`, {
        method: "POST",
      });

      if (!runRes.ok) {
        // Pipeline created but run failed — redirect to detail anyway
        router.push(`/pipelines/${pipeline.id}?run=failed`);
        return;
      }

      // 3. Redirect to detail with success
      router.push(`/pipelines/${pipeline.id}?success=true`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Pipeline failed");
      setSimpleRunning(false);
    }
  }, [selectedSource, selectedGoal, simplePipelineName, router]);

  const canvasRef = useRef<HTMLDivElement>(null);

  // ── Pipeline Templates ──
  type TemplateName = "quick-clean" | "raw-bronze" | "aggregation" | "full-etl" | "medallion" | "join-enrich" | "gold-monthly" | "gold-top10" | "gold-status" | "gold-kpi" | "custom";

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
    {
      id: "gold-monthly",
      icon: "📅",
      label: "Monthly Rollup → Gold",
      desc: "Agregat per bulan: total, rata-rata, count transaksi → Gold",
      steps: [{ type: "SOURCE" }, { type: "CLEAN" }, { type: "AGGREGATE", overrides: { groupBy: "month", aggregations: "total = SUM(amount)\ncount = COUNT(*)\navg = AVG(amount)" } }, { type: "OUTPUT", overrides: { outputLayer: "GOLD" } }],
    },
    {
      id: "gold-top10",
      icon: "🏆",
      label: "Top 10 → Gold",
      desc: "Top 10 by amount: GROUP BY + ORDER BY DESC LIMIT 10 → Gold",
      steps: [{ type: "SOURCE" }, { type: "CLEAN" }, { type: "AGGREGATE" }, { type: "SORT", overrides: { sortDirection: "DESC" } }, { type: "FILTER", overrides: { filterCondition: "LIMIT 10" } }, { type: "OUTPUT", overrides: { outputLayer: "GOLD" } }],
    },
    {
      id: "gold-status",
      icon: "📊",
      label: "Status Breakdown → Gold",
      desc: "Breakdown per status/kategori: COUNT + SUM per group → Gold",
      steps: [{ type: "SOURCE" }, { type: "CLEAN" }, { type: "CATEGORIZE" }, { type: "AGGREGATE" }, { type: "OUTPUT", overrides: { outputLayer: "GOLD" } }],
    },
    {
      id: "gold-kpi",
      icon: "📈",
      label: "KPI Summary → Gold",
      desc: "Satu tabel ringkasan: MIN, MAX, AVG, SUM, COUNT semua metrik → Gold",
      steps: [{ type: "SOURCE" }, { type: "CLEAN" }, { type: "AGGREGATE", overrides: { aggregations: "min = MIN(amount)\nmax = MAX(amount)\navg = AVG(amount)\nsum = SUM(amount)\ncount = COUNT(*)" } }, { type: "OUTPUT", overrides: { outputLayer: "GOLD" } }],
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

    // Client-side Gold layer validation
    for (const node of nodes) {
      if (node.type === "OUTPUT" && (node.config as ConfigState).outputLayer === "GOLD") {
        const hasPrecedingTransform = nodes.some(
          (n) => (n.type === "AGGREGATE" || n.type === "JOIN" || n.type === "PIVOT") && n.order < node.order
        );
        if (!hasPrecedingTransform) {
          setError("OUTPUT to GOLD layer requires a preceding AGGREGATE, JOIN, or PIVOT step. Add one before the OUTPUT step.");
          setSaving(false);
          return;
        }
      }
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

      const res = await authFetch("/api/pipelines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.status === 401) {
        router.push("/login");
        return;
      }

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
    <div className="h-screen flex flex-col bg-[#0d0d0c] text-[#e8e4db]">
      <Styles />

      {/* === TOP BAR === */}
      <header className="shrink-0 h-14 border-b border-[rgba(212,168,83,0.12)] flex items-center justify-between px-6 bg-[#1a1917]">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/pipelines")}
            style={{color:"#8a8578"}}
            className="hover:text-white text-sm transition-colors"
          >
            ← Back
          </button>
          <div className="h-5 w-px bg-[#6b6760]/40" />
          {/* Mode Toggle */}
          <div style={{background:"rgba(26,25,23,0.8)", border:"1px solid rgba(212,168,83,0.12)"}} className="flex rounded-lg overflow-hidden">
            <button
              onClick={() => { setMode("simple"); setSimpleStep(1); }}
              style={{
                background: mode === "simple" ? "#D4A853" : "transparent",
                color: mode === "simple" ? "#0d0d0c" : "#8a8578",
              }}
              className="px-3 py-1.5 text-xs font-bold transition-all flex items-center gap-1"
            >
              🧭 Simple
            </button>
            <button
              onClick={() => setMode("advanced")}
              style={{
                background: mode === "advanced" ? "#D4A853" : "transparent",
                color: mode === "advanced" ? "#0d0d0c" : "#8a8578",
              }}
              className="px-3 py-1.5 text-xs font-bold transition-all flex items-center gap-1"
            >
              ⚙️ Advanced
            </button>
          </div>
          <div className="h-5 w-px bg-[#6b6760]/40" />
          <h1 style={{color:"#D4A853", fontFamily:"'Newsreader', serif", fontStyle:"italic", fontWeight:700}} className="text-sm">Pipeline Designer</h1>
        </div>
        <div className="flex items-center gap-3">
          {error && (
            <span className="text-red-400 text-xs">{error}</span>
          )}
          {mode === "advanced" && (
            <>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Pipeline name..."
                style={{background:"#1a1917", border:"1px solid rgba(212,168,83,0.12)", color:"#e8e4db"}}
                className="w-48 px-3 py-1.5 rounded-lg text-sm placeholder:text-[#6b6760] focus:outline-none focus:border-[#D4A853] transition-colors"
              />
              <input
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
                placeholder="Source ID"
                style={{background:"#1a1917", border:"1px solid rgba(212,168,83,0.12)", color:"#e8e4db"}}
                className="w-28 px-3 py-1.5 rounded-lg text-sm placeholder:text-[#6b6760] focus:outline-none focus:border-[#D4A853] transition-colors"
              />
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-1.5 rounded-lg bg-[#D4A853] text-[#0d0d0c] text-sm font-bold hover:bg-[#c49b3f] disabled:opacity-50 transition-all"
              >
                {saving ? "Saving..." : "💾 Save Pipeline"}
              </button>
            </>
          )}
        </div>
      </header>

      {/* === BODY === */}
      {mode === "simple" ? (
        /* ── SIMPLE MODE: Goal-Based Wizard ── */
        <div className="flex-1 overflow-y-auto flex flex-col items-center py-8 px-6">
          {/* Step indicator */}
          <div className="flex items-center gap-0 mb-10">
            {[
              { num: 1, label: "Pilih Data" },
              { num: 2, label: "Pilih Tujuan" },
              { num: 3, label: "Review & Jalan" },
            ].map((s, idx) => (
              <div key={s.num} className="flex items-center gap-0">
                <button
                  onClick={() => s.num < simpleStep ? setSimpleStep(s.num as 1 | 2 | 3) : undefined}
                  className="flex items-center gap-2 group"
                  style={{ cursor: s.num < simpleStep ? "pointer" : "default" }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: simpleStep === s.num
                        ? "#D4A853"
                        : simpleStep > s.num
                          ? "rgba(212,168,83,0.2)"
                          : "rgba(212,168,83,0.08)",
                      border: simpleStep === s.num
                        ? "none"
                        : simpleStep > s.num
                          ? "1px solid rgba(212,168,83,0.4)"
                          : "1px solid rgba(212,168,83,0.15)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: simpleStep === s.num
                        ? "#0d0d0c"
                        : simpleStep > s.num
                          ? "#D4A853"
                          : "#6b6760",
                      fontSize: 14,
                      fontWeight: 700,
                      transition: "all 0.3s ease",
                    }}
                  >
                    {simpleStep > s.num ? "✓" : s.num}
                  </div>
                  <span
                    style={{
                      color: simpleStep === s.num ? "#D4A853" : simpleStep > s.num ? "#8a8578" : "#6b6760",
                      fontSize: 13,
                      fontWeight: simpleStep === s.num ? 700 : 400,
                      transition: "color 0.3s ease",
                    }}
                  >
                    {s.label}
                  </span>
                </button>
                {idx < 2 && (
                  <div
                    style={{
                      width: 48,
                      height: 1,
                      background: simpleStep > idx + 1
                        ? "rgba(212,168,83,0.5)"
                        : simpleStep === idx + 1
                          ? "rgba(212,168,83,0.2)"
                          : "rgba(212,168,83,0.06)",
                      margin: "0 8px",
                      transition: "background 0.3s ease",
                    }}
                  />
                )}
              </div>
            ))}
          </div>

          {/* ── Step 1: Pilih Data ── */}
          {simpleStep === 1 && (
            <div className="w-full max-w-2xl space-y-6" style={{ animation: "fadeIn 0.3s ease" }}>
              <div className="text-center space-y-2 mb-6">
                <h2
                  style={{
                    color: "#D4A853",
                    fontFamily: "'Newsreader', serif",
                    fontStyle: "italic",
                    fontWeight: 700,
                    fontSize: 22,
                  }}
                >
                  Pilih Sumber Data
                </h2>
                <p style={{ color: "#8a8578", fontSize: 14 }}>
                  Pilih data yang ingin Anda olah. Bisa dari file upload atau tabel lakehouse.
                </p>
              </div>

              {/* Data Sources */}
              {sources.length > 0 && (
                <div className="space-y-3">
                  <h3 style={{ color: "#e8e4db", fontSize: 13, fontWeight: 600 }}>📥 Data Sources</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {sources.map((src) => (
                      <button
                        key={`src-${src.id}`}
                        onClick={() => {
                          setSelectedSource({
                            type: "datasource",
                            id: src.id,
                            name: src.name,
                            rows: src.rowsCount || 0,
                            sourceId: src.id,
                          });
                          setSimpleStep(2);
                        }}
                        style={{
                          background: "rgba(26,25,23,0.8)",
                          border: "1px solid rgba(212,168,83,0.12)",
                        }}
                        className="text-left p-4 rounded-xl hover:border-[rgba(212,168,83,0.3)] hover:bg-[rgba(212,168,83,0.06)] transition-all group"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <span style={{ fontSize: 24 }}>📄</span>
                          <span
                            style={{
                              background: "rgba(212,168,83,0.1)",
                              color: "#D4A853",
                              fontSize: 9,
                              fontWeight: 700,
                              padding: "2px 8px",
                              borderRadius: 999,
                            }}
                          >
                            CSV
                          </span>
                        </div>
                        <p style={{ color: "#e8e4db", fontSize: 13, fontWeight: 600 }} className="group-hover:text-[#D4A853] transition-colors">
                          {src.name}
                        </p>
                        <p style={{ color: "#6b6760", fontSize: 11, marginTop: 4 }}>
                          {src.rowsCount != null ? `${src.rowsCount} baris` : ""}
                          {src.columnsCount != null ? ` • ${src.columnsCount} kolom` : ""}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Lakehouse Tables */}
              {lakehouseTables.length > 0 && (
                <div className="space-y-3">
                  <h3 style={{ color: "#e8e4db", fontSize: 13, fontWeight: 600, marginTop: 24 }}>🏗️ Lakehouse Tables</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {lakehouseTables.map((tbl) => {
                      const layer = tbl.layer || "SILVER";
                      const lc =
                        layer === "GOLD" ? "#D4A853" : layer === "SILVER" ? "#8a8578" : "#b85c3a";
                      const lbg =
                        layer === "GOLD"
                          ? "rgba(212,168,83,0.12)"
                          : layer === "SILVER"
                            ? "rgba(138,133,120,0.12)"
                            : "rgba(184,92,58,0.12)";

                      return (
                        <button
                          key={`lh-${tbl.id}`}
                          onClick={() => {
                            setSelectedSource({
                              type: "lakehouse",
                              id: tbl.id,
                              name: tbl.tableName || tbl.displayName,
                              rows: tbl.rowsCount || 0,
                              layer: layer,
                              tableName: tbl.tableName,
                            });
                            setSimpleStep(2);
                          }}
                          style={{
                            background: "rgba(26,25,23,0.8)",
                            border: "1px solid rgba(212,168,83,0.12)",
                          }}
                          className="text-left p-4 rounded-xl hover:border-[rgba(212,168,83,0.3)] hover:bg-[rgba(212,168,83,0.06)] transition-all group"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <span style={{ fontSize: 24 }}>🗄️</span>
                            <span
                              style={{
                                background: lbg,
                                color: lc,
                                fontSize: 9,
                                fontWeight: 700,
                                padding: "2px 8px",
                                borderRadius: 999,
                              }}
                            >
                              {layer}
                            </span>
                          </div>
                          <p style={{ color: "#e8e4db", fontSize: 13, fontWeight: 600 }} className="group-hover:text-[#D4A853] transition-colors">
                            {tbl.displayName || tbl.tableName}
                          </p>
                          <p style={{ color: "#6b6760", fontSize: 11, marginTop: 4 }}>
                            {tbl.rowsCount != null ? `${tbl.rowsCount} baris` : ""}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {sources.length === 0 && lakehouseTables.length === 0 && (
                <div className="text-center py-12 space-y-3">
                  <div style={{ fontSize: 48 }}>📭</div>
                  <p style={{ color: "#8a8578", fontSize: 14 }}>Belum ada data tersedia.</p>
                  <p style={{ color: "#6b6760", fontSize: 12 }}>
                    Upload CSV terlebih dahulu di halaman{" "}
                    <span style={{ color: "#D4A853" }}>Data Sources</span>.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Pilih Tujuan ── */}
          {simpleStep === 2 && (
            <div className="w-full max-w-2xl space-y-6" style={{ animation: "fadeIn 0.3s ease" }}>
              <div className="text-center space-y-2 mb-6">
                <h2
                  style={{
                    color: "#D4A853",
                    fontFamily: "'Newsreader', serif",
                    fontStyle: "italic",
                    fontWeight: 700,
                    fontSize: 22,
                  }}
                >
                  Apa yang Ingin Dilakukan?
                </h2>
                <p style={{ color: "#8a8578", fontSize: 14 }}>
                  Pilih tujuan pengolahan data. Pipeline akan otomatis dibuat sesuai pilihan Anda.
                </p>
                {selectedSource && (
                  <p style={{ color: "#6b6760", fontSize: 12, marginTop: 4 }}>
                    📥 Data: <span style={{ fontWeight: 600, color: "#8a8578" }}>{selectedSource.name}</span>
                    {selectedSource.rows > 0 && (
                      <span style={{ marginLeft: 4 }}>({selectedSource.rows} baris)</span>
                    )}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                {SIMPLE_GOALS.map((goal) => (
                  <button
                    key={goal.id}
                    onClick={() => {
                      setSelectedGoal(goal.id);
                      setSimpleStep(3);
                    }}
                    style={{
                      background: "rgba(26,25,23,0.8)",
                      border: "1px solid rgba(212,168,83,0.12)",
                    }}
                    className="text-left p-5 rounded-xl hover:border-[rgba(212,168,83,0.35)] hover:bg-[rgba(212,168,83,0.06)] transition-all group"
                  >
                    <div style={{ fontSize: 32, marginBottom: 12 }}>{goal.icon}</div>
                    <p style={{ color: "#e8e4db", fontSize: 15, fontWeight: 700 }} className="group-hover:text-[#D4A853] transition-colors">
                      {goal.title}
                    </p>
                    <p style={{ color: "#8a8578", fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>
                      "{goal.question}"
                    </p>
                    <div
                      style={{
                        marginTop: 12,
                        padding: "8px 10px",
                        background: "rgba(13,13,12,0.6)",
                        border: "1px solid rgba(212,168,83,0.08)",
                        borderRadius: 8,
                      }}
                    >
                      <p style={{ color: "#6b6760", fontSize: 10, fontWeight: 500 }}>
                        {goal.previewLabel}
                      </p>
                      <div className="flex items-center gap-1 mt-1.5">
                        {goal.steps.map((st, i) => {
                          const si = STEP_TYPES.find(s => s.type === st);
                          return (
                            <span key={i} className="flex items-center gap-0.5">
                              {i > 0 && <span style={{ color: "#6b6760", fontSize: 8 }}>→</span>}
                              <span
                                style={{
                                  background: "#0d0d0c",
                                  color: "#6b6760",
                                  fontSize: 8,
                                  padding: "1px 5px",
                                  borderRadius: 4,
                                }}
                              >
                                {si?.icon} {si?.label}
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="text-center pt-4">
                <button
                  onClick={() => setSimpleStep(1)}
                  style={{ color: "#8a8578" }}
                  className="text-sm hover:text-white transition-colors"
                >
                  ← Kembali pilih data
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Review & Jalan ── */}
          {simpleStep === 3 && selectedSource && selectedGoal && (() => {
            const goal = SIMPLE_GOALS.find(g => g.id === selectedGoal)!;
            const tblName = selectedSource.name.toLowerCase().replace(/[^a-z0-9]/g, "_") + "_result";
            const displayTbl = /^[0-9]/.test(tblName) ? "t_" + tblName : tblName;

            return (
              <div className="w-full max-w-2xl space-y-6" style={{ animation: "fadeIn 0.3s ease" }}>
                <div className="text-center space-y-2 mb-4">
                  <h2
                    style={{
                      color: "#D4A853",
                      fontFamily: "'Newsreader', serif",
                      fontStyle: "italic",
                      fontWeight: 700,
                      fontSize: 22,
                    }}
                  >
                    Review & Jalan
                  </h2>
                  <p style={{ color: "#8a8578", fontSize: 14 }}>
                    Tinjau pipeline yang akan otomatis dibuat. Klik <strong style={{ color: "#D4A853" }}>Jalankan</strong> untuk langsung memproses data.
                  </p>
                </div>

                {/* Pipeline flow preview */}
                <div
                  style={{
                    background: "rgba(26,25,23,0.6)",
                    border: "1px solid rgba(212,168,83,0.15)",
                    borderRadius: 16,
                    padding: "24px",
                  }}
                  className="space-y-0"
                >
                  <h3 style={{ color: "#e8e4db", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    Ringkasan Pipeline
                  </h3>

                  <div className="flex flex-col items-center gap-0">
                    {goal.steps.map((st, i) => {
                      const si = STEP_TYPES.find(s => s.type === st)!;
                      const isOutput = st === "OUTPUT";
                      const layer = goal.outputLayer;
                      const lc = layer === "GOLD" ? "#D4A853" : "#8a8578";
                      const lbg = layer === "GOLD" ? "rgba(212,168,83,0.12)" : "rgba(138,133,120,0.12)";

                      // Build step description
                      let desc = "";
                      if (st === "SOURCE") {
                        desc = `${selectedSource.name}${selectedSource.rows > 0 ? ` (${selectedSource.rows} baris)` : ""}`;
                      } else if (st === "CLEAN") {
                        const cc = goal.autoConfig.CLEAN || {};
                        const parts: string[] = [];
                        if (cc.deduplicate) parts.push("hapus duplikat");
                        if (cc.fillNulls) parts.push("isi kosong");
                        if (cc.stripWhitespace) parts.push("trim spasi");
                        desc = parts.length > 0 ? `Bersihkan: ${parts.join(", ")}` : "Bersihkan data";
                      } else if (st === "VALIDATE") {
                        desc = "Validasi: flag baris error";
                      } else if (st === "AGGREGATE") {
                        const ac = goal.autoConfig.AGGREGATE || {};
                        desc = `Agregat${(ac as any).groupBy ? ` per ${(ac as any).groupBy}` : ""}`;
                      } else if (st === "OUTPUT") {
                        desc = `${layer}: ${displayTbl}`;
                      }

                      return (
                        <div key={i} className="flex flex-col items-center w-full max-w-xs">
                          {i > 0 && (
                            <div className="flex flex-col items-center">
                              <div style={{ background: "rgba(212,168,83,0.25)", width: 2 }} className="h-4" />
                              <div
                                style={{
                                  background: "#1a1917",
                                  border: "1px solid rgba(212,168,83,0.3)",
                                  borderRadius: "50%",
                                  width: 10,
                                  height: 10,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                <span style={{ color: "#D4A853", fontSize: 6 }}>▼</span>
                              </div>
                              <div style={{ background: "rgba(212,168,83,0.25)", width: 2 }} className="h-2" />
                            </div>
                          )}

                          <div
                            style={{
                              background: "rgba(26,25,23,0.9)",
                              border: isOutput
                                ? `1px solid ${lc}`
                                : "1px solid rgba(212,168,83,0.1)",
                              padding: "10px 16px",
                              borderRadius: 12,
                              width: "100%",
                            }}
                          >
                            <div className="flex items-center gap-2.5">
                              <span style={{ fontSize: 18 }}>{si.icon}</span>
                              <div className="flex-1 min-w-0">
                                <p style={{ color: "#e8e4db", fontSize: 12, fontWeight: 600 }}>{si.label}</p>
                                <p style={{ color: "#6b6760", fontSize: 10, marginTop: 2 }} className="truncate">
                                  {desc}
                                </p>
                              </div>
                              {isOutput && (
                                <span
                                  style={{
                                    background: lbg,
                                    color: lc,
                                    fontSize: 8,
                                    fontWeight: 700,
                                    padding: "2px 6px",
                                    borderRadius: 4,
                                  }}
                                >
                                  {layer}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Pipeline name */}
                <div className="space-y-2">
                  <label style={{ color: "#8a8578", fontSize: 12, fontWeight: 500 }}>
                    Nama Pipeline
                  </label>
                  <input
                    value={simplePipelineName}
                    readOnly
                    style={{
                      background: "#1a1917",
                      border: "1px solid rgba(212,168,83,0.15)",
                      color: "#e8e4db",
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: 10,
                      fontSize: 14,
                    }}
                  />
                  <p style={{ color: "#6b6760", fontSize: 10 }}>
                    Nama otomatis dari sumber data & tujuan. Bisa diedit di Advanced Mode.
                  </p>
                </div>

                {/* Actions */}
                <div className="flex flex-col items-center gap-3 pt-2">
                  <button
                    onClick={handleSimpleRun}
                    disabled={simpleRunning}
                    style={{
                      background: "#D4A853",
                      color: "#0d0d0c",
                      border: "none",
                    }}
                    className="px-8 py-3 rounded-xl text-base font-bold hover:bg-[#c49b3f] disabled:opacity-50 transition-all flex items-center gap-2"
                  >
                    {simpleRunning ? (
                      <>⏳ Menjalankan Pipeline...</>
                    ) : (
                      <>▶️ Jalankan Pipeline</>
                    )}
                  </button>

                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setSimpleStep(2)}
                      style={{ color: "#8a8578" }}
                      className="text-sm hover:text-white transition-colors"
                    >
                      ← Kembali
                    </button>
                    <span style={{ color: "#6b6760" }}>•</span>
                    <button
                      onClick={() => setMode("advanced")}
                      style={{ color: "#D4A853" }}
                      className="text-sm hover:underline transition-all"
                    >
                      ⚙️ Buka di Advanced Mode
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      ) : (
        /* ── ADVANCED MODE: 3-column ── */
        <div className="flex-1 flex overflow-hidden">
        {/* ── LEFT SIDEBAR: Toolbox (only when editing, not during template picker) ── */}
        {!showTemplates && (
        <aside className="w-56 shrink-0 border-r border-[rgba(212,168,83,0.12)] bg-[#1a1917]/40 backdrop-blur overflow-y-auto p-4 space-y-2">
          <h3 style={{color:"#D4A853"}} className="text-xs font-bold uppercase tracking-widest mb-3">
            🧰 Step Toolbox
          </h3>
          <p style={{color:"#8a8578"}} className="text-[10px] -mt-2 mb-3">
            Click a step type to add it to your pipeline
          </p>
          {STEP_TYPES.map((step, i) => (
            <div key={step.type}>
              {step.type === "OUTPUT" && i > 0 && (
                <div className="my-2 border-t border-[rgba(212,168,83,0.08)]" />
              )}
              <button
                onClick={() => addNode(step.type)}
                style={{background:"rgba(26,25,23,0.6)", border:"1px solid rgba(212,168,83,0.12)"}}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-[rgba(212,168,83,0.08)] hover:border-[rgba(212,168,83,0.25)] transition-all text-left group"
              >
                <span className="text-lg">{step.icon}</span>
                <span style={{color:"#8a8578"}} className="text-xs font-medium group-hover:text-white transition-colors">
                  {step.label}
                </span>
              </button>
            </div>
          ))}
        </aside>
        )}

        {/* ── CENTER: Canvas ── */}
        <main className="flex-1 overflow-y-auto p-6" ref={canvasRef}>
          {/* Template picker */}
          {showTemplates && (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-5 py-4">
              <div className="space-y-2">
                <div className="text-4xl">🎯</div>
                <h2 style={{color:"#D4A853", fontFamily:"'Newsreader', serif", fontStyle:"italic"}} className="text-xl font-bold">Pilih Template Pipeline</h2>
                <p style={{color:"#8a8578"}} className="text-sm max-w-sm mx-auto">
                  Pilih template di bawah atau klik <span style={{color:"#D4A853", fontWeight:600}}>✏️ Custom</span> untuk bikin dari nol
                </p>
                {prefilledSourceId && (
                  <p style={{color:"#8a8578"}} className="text-xs">
                    📥 Source: <span className="font-mono">{prefilledSourceName}</span>
                  </p>
                )}
                {hasLakehouseSource && (
                  <p style={{color:"#8a8578"}} className="text-xs">
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

              <div className="grid grid-cols-3 gap-3 max-w-3xl w-full">
                {TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => handleTemplateClick(tpl)}
                    style={{background:"rgba(26,25,23,0.8)", border:"1px solid rgba(212,168,83,0.12)"}}
                    className="text-left p-4 rounded-xl hover:bg-[rgba(212,168,83,0.08)] hover:border-[rgba(212,168,83,0.25)] transition-all group"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-2xl">{tpl.icon}</span>
                      <div>
                        <p style={{color:"#e8e4db"}} className="font-bold text-xs group-hover:text-[#D4A853] transition-colors">
                          {tpl.label}
                        </p>
                        <p style={{color:"#6b6760"}} className="text-[9px] uppercase tracking-wider">
                          {tpl.steps.length} steps
                        </p>
                      </div>
                    </div>
                    <p style={{color:"#8a8578"}} className="text-[10px] leading-relaxed line-clamp-2">{tpl.desc}</p>
                    <div className="mt-2 flex items-center gap-1 flex-wrap">
                      {tpl.steps.map((s, i) => (
                        <span key={i} style={{background:"#0d0d0c", border:"1px solid rgba(212,168,83,0.08)", color:"#6b6760"}} className="text-[9px] px-1 py-0.5 rounded">
                          {s.type}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}

                {/* Custom / from scratch */}
                <button
                  onClick={() => handleTemplateClick(null)}
                  style={{background:"rgba(26,25,23,0.4)", border:"1px dashed rgba(212,168,83,0.2)"}}
                  className="text-left p-4 rounded-xl hover:bg-[rgba(212,168,83,0.05)] hover:border-[rgba(212,168,83,0.4)] transition-all group col-span-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">✏️</span>
                    <div>
                      <p style={{color:"#e8e4db"}} className="font-bold text-xs group-hover:text-[#D4A853] transition-colors">
                        Custom Pipeline
                      </p>
                      <p style={{color:"#8a8578"}} className="text-[10px]">
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
              <div className="flex items-center gap-4">
                <div className="text-4xl">⬅️</div>
                <div className="text-5xl">🧩</div>
              </div>
              <h3 style={{color:"#e8e4db"}} className="text-lg font-bold">Empty Canvas</h3>
              <p style={{color:"#8a8578"}} className="text-sm max-w-xs">
                Click a step type from the toolbox <span style={{color:"#D4A853"}}>on the left</span> to start building your pipeline.
              </p>
              <button
                onClick={() => setShowTemplates(true)}
                style={{background:"#1a1917", border:"1px solid rgba(212,168,83,0.12)", color:"#8a8578"}}
                className="px-4 py-2 rounded-xl text-sm hover:bg-[rgba(212,168,83,0.08)] transition-all"
              >
                ← Back to Templates
              </button>
            </div>
          )}

          {!showTemplates && nodes.length > 0 && (
            <div className="flex flex-col items-center gap-4 py-2">
              {/* Reset to templates link */}
              <button
                onClick={() => setShowTemplates(true)}
                style={{color:"#6b6760"}}
                className="text-xs hover:text-[#8a8578] transition-colors flex items-center gap-1"
              >
                ← Pilih template lain
              </button>
              {nodes.map((node, idx) => {
                const info = STEP_TYPES.find((s) => s.type === node.type)!;
                const isSelected = node.id === selectedId;
                const isOutput = node.type === "OUTPUT";
                const layer = (node.config as ConfigState).outputLayer;
                const layerColor = layer === "GOLD" ? "#D4A853" : layer === "SILVER" ? "#8a8578" : "#b85c3a";
                const layerBg = layer === "GOLD" ? "rgba(212,168,83,0.12)" : layer === "SILVER" ? "rgba(138,133,120,0.12)" : "rgba(184,92,58,0.12)";

                return (
                  <div key={node.id} className="flex flex-col items-center w-full max-w-md">
                    {/* Connecting line above (except first) */}
                    {idx > 0 && (
                      <div className="flex flex-col items-center gap-0.5">
                        <div style={{background: "rgba(212,168,83,0.3)", width: 2}} className="h-5" />
                        <div style={{borderColor: "rgba(212,168,83,0.3)", background: "#1a1917"}} className="w-3 h-3 rounded-full border flex items-center justify-center">
                          <span style={{color: "#D4A853", fontSize: 6}}>▼</span>
                        </div>
                        <div style={{background: "rgba(212,168,83,0.3)", width: 2}} className="h-2" />
                      </div>
                    )}

                    {/* Node card */}
                    <div
                      onClick={() => setSelectedId(isSelected ? null : node.id)}
                      style={{
                        background: isSelected ? "rgba(26,25,23,0.9)" : "rgba(26,25,23,0.6)",
                        border: isSelected ? "1px solid rgba(212,168,83,0.5)" : "1px solid rgba(212,168,83,0.1)",
                        boxShadow: isSelected ? "0 0 12px rgba(212,168,83,0.15)" : "none",
                      }}
                      className="w-full rounded-xl p-3 cursor-pointer transition-all group hover:border-[rgba(212,168,83,0.25)]"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="text-xl">{info.icon}</span>
                          <div>
                            <p style={{color:"#e8e4db"}} className="text-xs font-bold">{info.label}</p>
                            <div className="flex items-center gap-1.5">
                              <p style={{color:"#6b6760"}} className="text-[9px]">
                                Step #{node.order}
                              </p>
                              {isOutput && layer && (
                                <span style={{background: layerBg, color: layerColor, fontSize: 8, fontWeight: 700}}
                                  className="px-1.5 py-0.5 rounded uppercase"
                                >
                                  {layer}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              moveNode(node.id, "up");
                            }}
                            disabled={idx === 0}
                            style={{color:"#8a8578"}}
                            className="p-1 rounded-md hover:text-white hover:bg-[#1a1917] disabled:opacity-30 disabled:cursor-not-allowed text-xs"
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
                            style={{color:"#8a8578"}}
                            className="p-1 rounded-md hover:text-white hover:bg-[#1a1917] disabled:opacity-30 disabled:cursor-not-allowed text-xs"
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
                              style={{background:"#0d0d0c", border:"1px solid rgba(212,168,83,0.08)", color:"#6b6760"}}
                              className="text-[8px] px-1.5 py-0.5 rounded truncate max-w-[160px]"
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
        <aside className="w-72 shrink-0 border-l border-[rgba(212,168,83,0.12)] bg-[#1a1917]/40 backdrop-blur overflow-y-auto p-4">
          {selectedNode ? (
            <ConfigPanel
              node={selectedNode}
              config={selectedNode.config as ConfigState}
              onChange={updateConfig}
              onDelete={() => deleteNode(selectedNode.id)}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
              <div className="text-3xl">⚙️</div>
              <div>
                <h3 style={{color:"#D4A853"}} className="text-sm font-bold">Pipeline Builder</h3>
                <p style={{color:"#8a8578"}} className="text-xs mt-1">
                  Click any step to edit its configuration here.
                </p>
              </div>

              {/* Pipeline summary */}
              {nodes.length > 0 && (
                <div style={{background:"rgba(26,25,23,0.6)", border:"1px solid rgba(212,168,83,0.1)"}} className="w-full rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span style={{color:"#8a8578"}} className="text-[11px] font-medium">Pipeline Steps</span>
                    <span style={{color:"#D4A853", fontWeight:700}} className="text-lg">{nodes.length}</span>
                  </div>

                  {/* Layer summary — show all OUTPUT layers */}
                  {nodes.filter(n => n.type === "OUTPUT").length > 0 && (
                    <div className="space-y-1.5">
                      <span style={{color:"#6b6760"}} className="text-[9px] uppercase tracking-wider">Output Layers</span>
                      <div className="flex flex-wrap gap-1.5">
                        {nodes.filter(n => n.type === "OUTPUT").map((n, i) => {
                          const layer = (n.config as ConfigState).outputLayer || "SILVER";
                          const lc = layer === "GOLD" ? "#D4A853" : layer === "SILVER" ? "#8a8578" : "#b85c3a";
                          const lbg = layer === "GOLD" ? "rgba(212,168,83,0.12)" : layer === "SILVER" ? "rgba(138,133,120,0.12)" : "rgba(184,92,58,0.12)";
                          const tbl = (n.config as ConfigState).outputTable;
                          return (
                            <div key={i} style={{background: lbg, borderColor: lc}} className="border rounded-lg px-2.5 py-1.5 min-w-0">
                              <span style={{color: lc, fontSize: 10, fontWeight: 700}} className="uppercase tracking-wider">{layer}</span>
                              {tbl && <span style={{color:"#6b6760"}} className="text-[9px] ml-1 truncate block">{tbl}</span>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Step mini-list */}
                  <div className="space-y-1">
                    {nodes.map((n, i) => {
                      const info = STEP_TYPES.find(s => s.type === n.type)!;
                      return (
                        <div key={n.id} className="flex items-center gap-2 text-[10px]">
                          <span>{info.icon}</span>
                          <span style={{color:"#8a8578"}} className="truncate flex-1">{info.label}</span>
                          <span style={{color:"#6b6760"}}>#{i + 1}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
      )}
    </div>
  );
}

export default function NewPipelinePage() {
  return (
    <Suspense fallback={<div className="h-screen bg-[#0d0d0c] flex items-center justify-center"><div style={{color:"#8a8578"}}>Loading...</div></div>}>
      <NewPipelineContent />
    </Suspense>
  );
}
