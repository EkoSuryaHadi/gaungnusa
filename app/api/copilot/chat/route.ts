import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/prisma";

// ── Config ──────────────────────────────────────────────────────
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";
const DEEPSEEK_BASE_URL = "https://ai.sumopod.com/v1";
const DEEPSEEK_MODEL = "deepseek-v4-pro";
const MAX_QUERY_ROWS = 20;

// ── Types ───────────────────────────────────────────────────────
interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

// ── System Prompt ───────────────────────────────────────────────
const SYSTEM_PROMPT = `Kamu adalah Gaung AI Copilot untuk platform data lakehouse & ETL.

ATURAN WAJIB — ANTI HALUSINASI:
1. JANGAN PERNAH mengarang data, angka, nama tabel, atau insight. Semua harus dari tool.
2. Sebelum menjawab pertanyaan tentang data, WAJIB cek tool dulu (list_tables → get_schema → query_data).
3. Kalau tool return error atau kosong, bilang jujur: "Data tidak ditemukan" atau "Query gagal: [alasan]".
4. Jangan menebak struktur tabel atau isi data — gunakan get_schema.
5. Kalau tidak yakin, akui keterbatasan. Jangan membuat jawaban yang terdengar meyakinkan tapi palsu.
6. Jawab HANYA berdasarkan hasil tool. Jangan tambahkan informasi yang tidak ada di hasil tool.

HEMAT TOKEN:
- Jawaban singkat & padat. Tidak perlu basa-basi panjang.
- Gunakan format tabel markdown untuk data terstruktur.
- Jangan ulangi seluruh output tool — rangkum insight kuncinya saja.
- Untuk list tabel: cukup nama+layer+jumlah baris, tidak perlu semua metadata.
- Satu jawaban langsung ke inti. Tidak perlu pembuka/penutup bertele-tele.

BAHASA: Indonesia, ringkas, profesional.

LAYER DATA: bronze (mentah) → silver (bersih) → gold (agregat).`;

// ── Tool Definitions ────────────────────────────────────────────
const TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "list_tables",
      description: "List all lakehouse tables (bronze/silver/gold) with row counts",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_schema",
      description: "Get column names & types for a table. REQUIRED before querying.",
      parameters: {
        type: "object",
        properties: {
          table: { type: "string", description: "Table name" },
          layer: { type: "string", enum: ["bronze", "silver", "gold"] },
        },
        required: ["table", "layer"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_data",
      description: "Run SELECT query. Use after get_schema. Max 20 rows returned.",
      parameters: {
        type: "object",
        properties: {
          sql: { type: "string", description: "SELECT query" },
          layer: { type: "string", enum: ["bronze", "silver", "gold"] },
          table: { type: "string", description: "Target table" },
        },
        required: ["sql", "layer", "table"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pipelines",
      description: "List recent ETL pipelines with run status",
      parameters: { type: "object", properties: {} },
    },
  },
];

// ── Security: validate SQL ──────────────────────────────────────
function isSelectOnly(sql: string): boolean {
  const trimmed = sql.trim().toUpperCase();
  // Only allow SELECT statements
  if (!trimmed.startsWith("SELECT")) return false;
  // Block dangerous keywords
  const dangerous = [
    "INSERT",
    "UPDATE",
    "DELETE",
    "DROP",
    "ALTER",
    "TRUNCATE",
    "CREATE",
    "EXEC",
    "EXECUTE",
    "GRANT",
    "REVOKE",
    "MERGE",
    "REPLACE",
  ];
  // Check if any dangerous keyword appears as a standalone word
  const upperWords = trimmed.replace(/[^A-Z0-9_]/g, " ").split(/\s+/);
  for (const word of upperWords) {
    if (dangerous.includes(word)) return false;
  }
  return true;
}

// ── Tool Handlers ───────────────────────────────────────────────
async function handleListTables(): Promise<string> {
  const tables = await prisma.lakehouseTable.findMany({
    select: {
      tableName: true,
      layer: true,
      displayName: true,
      description: true,
      rowsCount: true,
      sizeBytes: true,
    },
    orderBy: [{ layer: "asc" }, { tableName: "asc" }],
    take: 100,
  });

  if (tables.length === 0) {
    return "0 tabel ditemukan.";
  }

  const lines = tables.map(t => `| ${t.tableName} | ${t.layer} | ${t.rowsCount.toLocaleString()} |`);
  return `| Tabel | Layer | Baris |\n|---|---:|---|\n${lines.join("\n")}`;
}

async function handleGetSchema(args: { table: string; layer: string }): Promise<string> {
  const { table, layer } = args;

  // Look up the table metadata from LakehouseTable
  const lakehouseTable = await prisma.lakehouseTable.findFirst({
    where: { tableName: table, layer: layer.toUpperCase() },
  });

  if (!lakehouseTable) {
    return `ERROR: Tabel "${table}" tidak ada di layer ${layer}. Gunakan list_tables.`;
  }

  // Try to get column info from information_schema if the actual table exists in PostgreSQL
  let columnsInfo = "";
  try {
    const schemaName = "public"; // default schema
    const columns = await prisma.$queryRawUnsafe<
      { column_name: string; data_type: string; is_nullable: string }[]
    >(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`,
      schemaName,
      table
    );

    if (columns.length > 0) {
      columnsInfo = columns
        .map(
          (c) =>
            `- \`${c.column_name}\` — ${c.data_type}${c.is_nullable === "YES" ? " (nullable)" : ""}`
        )
        .join("\n");
    }
  } catch {
    // Fallback: use the stored schema JSON
    try {
      const parsed = JSON.parse(lakehouseTable.schema);
      if (Array.isArray(parsed)) {
        columnsInfo = parsed
          .map(
            (c: { name?: string; type?: string; nullable?: boolean }) =>
              `- \`${c.name || "?"}\` — ${c.type || "unknown"}${c.nullable ? " (nullable)" : ""}`
          )
          .join("\n");
      }
    } catch {
      columnsInfo = "(Schema detail tidak tersedia)";
    }
  }

  return (
    `${lakehouseTable.rowsCount.toLocaleString()} baris\\n` +
    `${columnsInfo}`
  );
}

async function handleQueryData(args: { sql: string; layer: string; table: string }): Promise<string> {
  const { sql } = args;

  // Security: only allow SELECT
  if (!isSelectOnly(sql)) {
    return "ERROR: Hanya query SELECT yang diizinkan untuk keamanan data.";
  }

  // Enforce row limit by wrapping
  let limitedSql = sql.trim();
  // Remove trailing semicolon for wrapping
  if (limitedSql.endsWith(";")) {
    limitedSql = limitedSql.slice(0, -1);
  }
  // Add LIMIT if not present
  if (!/LIMIT\s+\d+/i.test(limitedSql)) {
    limitedSql = `${limitedSql} LIMIT ${MAX_QUERY_ROWS}`;
  } else {
    // Enforce max limit
    limitedSql = limitedSql.replace(/LIMIT\s+(\d+)/i, (_m, limit) => {
      const n = parseInt(limit, 10);
      return `LIMIT ${Math.min(n, MAX_QUERY_ROWS)}`;
    });
  }

  try {
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(limitedSql);

    if (rows.length === 0) {
      return "Query berhasil tapi tidak ada data yang cocok (0 baris).";
    }

    // Format as markdown table
    const columns = Object.keys(rows[0]);
    const header = `| ${columns.join(" | ")} |`;
    const separator = `| ${columns.map(() => "---").join(" | ")} |`;
    const body = rows
      .map((row) => `| ${columns.map((c) => String(row[c] ?? "")).join(" | ")} |`)
      .join("\n");

    return `Hasil (${rows.length} baris):\n\n${header}\n${separator}\n${body}`;
  } catch (err: any) {
    return `ERROR: ${err.message || "SQL error"}`;
  }
}

async function handleGetPipelines(): Promise<string> {
  const pipelines = await prisma.pipeline.findMany({
    select: {
      name: true,
      status: true,
      description: true,
      runs: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { status: true, startedAt: true, finishedAt: true, duration: true },
      },
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  if (pipelines.length === 0) {
    return "0 pipeline.";
  }

  const lines = pipelines.map((p) => {
    const lastRun = p.runs[0];
    const lastRunStatus = lastRun
      ? lastRun.status
      : "Belum run";
    return `| ${p.name} | ${p.status} | ${lastRunStatus} |`;
  });

  return `| Pipeline | Status | Last Run |\n|---|---|---|\n${lines.join("\n")}`;
}

// ── Execute a single tool call ──────────────────────────────────
async function executeToolCall(toolCall: ToolCall): Promise<string> {
  const { name, arguments: argsJson } = toolCall.function;
  let args: Record<string, unknown> = {};

  try {
    args = JSON.parse(argsJson);
  } catch {
    return `ERROR: Gagal parse arguments untuk tool "${name}".`;
  }

  switch (name) {
    case "list_tables":
      return await handleListTables();
    case "get_schema":
      return await handleGetSchema(args as { table: string; layer: string });
    case "query_data":
      return await handleQueryData(args as { sql: string; layer: string; table: string });
    case "get_pipelines":
      return await handleGetPipelines();
    default:
      return `ERROR: Tool "${name}" tidak dikenal.`;
  }
}

// ── DeepSeek API Call ───────────────────────────────────────────
async function callDeepSeek(
  messages: ChatMessage[],
  withTools: boolean = true
): Promise<{
  content: string | null;
  toolCalls: ToolCall[] | null;
  finishReason: string;
}> {
  const body: Record<string, unknown> = {
    model: DEEPSEEK_MODEL,
    messages,
    temperature: 0.1,
    max_tokens: 600,
  };

  if (withTools) {
    body.tools = TOOLS;
    body.tool_choice = "auto";
  }

  const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DeepSeek API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  const message = choice?.message;

  return {
    content: message?.content || null,
    toolCalls: message?.tool_calls || null,
    finishReason: choice?.finish_reason || "stop",
  };
}

// ── POST Handler ────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    // 1. Auth check
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse body
    const body = await req.json();
    const { messages: userMessages, conversationId } = body as {
      messages?: { role: string; content: string }[];
      conversationId?: string;
    };

    if (!userMessages || !Array.isArray(userMessages) || userMessages.length === 0) {
      return NextResponse.json(
        { error: "messages array is required" },
        { status: 400 }
      );
    }

    // 3. Build message array
    const chatMessages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...userMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    // 4. First call to DeepSeek (with tools)
    let response = await callDeepSeek(chatMessages, true);

    // 5. Handle tool calls loop
    const MAX_TOOL_ROUNDS = 5;
    let toolRound = 0;

    while (response.toolCalls && response.toolCalls.length > 0 && toolRound < MAX_TOOL_ROUNDS) {
      toolRound++;

      // Add the assistant message with tool calls (omit content field)
      const msg: ChatMessage = {
        role: "assistant",
        tool_calls: response.toolCalls,
      } as ChatMessage;
      chatMessages.push(msg);

      // Execute each tool call and add results
      for (const tc of response.toolCalls) {
        const result = await executeToolCall(tc);
        chatMessages.push({
          role: "tool",
          content: result,
          tool_call_id: tc.id,
        });
      }

      // Call DeepSeek again with tool results
      response = await callDeepSeek(chatMessages, true);
    }

    // 6. If max rounds reached with pending tool_calls, return what we have
    if (response.toolCalls && response.toolCalls.length > 0) {
      // Execute remaining tool calls to satisfy the messages, then call one more time
      chatMessages.push({
        role: "assistant",
        content: null,
        tool_calls: response.toolCalls,
      } as ChatMessage);
      for (const tc of response.toolCalls) {
        const result = await executeToolCall(tc);
        chatMessages.push({
          role: "tool",
          content: result,
          tool_call_id: tc.id,
        });
      }
      response = await callDeepSeek(chatMessages, true);
    }

    // 7. Return final response
    return NextResponse.json({
      content:
        response.content || "Maaf, saya tidak bisa menjawab pertanyaan itu. Coba tanyakan dengan cara lain ya!",
      conversationId: conversationId || null,
    });
  } catch (err: any) {
    console.error("[copilot/chat] Error:", err);

    // Distinguish API key errors
    if (err.message?.includes("API key")) {
      return NextResponse.json(
        { error: "Konfigurasi AI tidak ditemukan. Hubungi admin." },
        { status: 500 }
      );
    }

    // DeepSeek API errors
    if (err.message?.includes("DeepSeek API error")) {
      return NextResponse.json(
        {
          error:
            "Maaf, layanan AI sedang sibuk. Coba lagi sebentar ya!",
        },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { error: "Terjadi kesalahan internal. Coba lagi nanti." },
      { status: 500 }
    );
  }
}
