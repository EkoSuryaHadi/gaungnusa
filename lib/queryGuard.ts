/**
 * queryGuard.ts — centralised validation for all DuckDB query construction.
 *
 * Rules:
 *  - Layer names must be one of the three lakehouse tiers.
 *  - Identifiers (table names, column names) must be simple alphanumeric/underscore strings.
 *  - Aggregate functions are restricted to a safe whitelist.
 *  - Raw SQL strings must be SELECT-only (no DML / DDL).
 */

// ── Constants ──────────────────────────────────────────────────────────────

export const VALID_LAYERS = new Set(["bronze", "silver", "gold"]);

/**
 * Allowed aggregate functions for KPI widgets.
 * Extend this list only with safe, read-only aggregate functions.
 */
const VALID_AGG_FNS = new Set(["SUM", "AVG", "COUNT", "MIN", "MAX"]);

/**
 * Keywords that must never appear in a user-supplied SQL string.
 */
const DANGEROUS_SQL_KEYWORDS = [
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
  "COPY",
  "ATTACH",
  "DETACH",
  "LOAD",
  "INSTALL",
];

// ── Validators ─────────────────────────────────────────────────────────────

/**
 * Validate a lakehouse layer name.
 * Throws a TypeError if the value is not in the allowed set.
 */
export function validateLayer(layer: unknown): string {
  if (typeof layer !== "string") {
    throw new TypeError("Layer must be a string.");
  }
  const normalized = layer.toLowerCase().trim();
  if (!VALID_LAYERS.has(normalized)) {
    throw new TypeError(
      `Invalid layer "${layer}". Must be one of: ${[...VALID_LAYERS].join(", ")}.`
    );
  }
  return normalized;
}

/**
 * Validate a SQL identifier (table name or column name).
 * Allows only: letters, digits, underscores, and hyphens.
 * Rejects empty strings, names starting with a digit, and any special characters.
 *
 * Throws a TypeError if the identifier is unsafe.
 */
export function validateIdentifier(name: unknown, label = "Identifier"): string {
  if (typeof name !== "string" || name.trim() === "") {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  const trimmed = name.trim();
  // Only allow safe characters: word chars (a-z, A-Z, 0-9, _) and hyphens
  if (!/^[\w-]+$/.test(trimmed)) {
    throw new TypeError(
      `${label} "${trimmed}" contains invalid characters. Only letters, digits, underscores, and hyphens are allowed.`
    );
  }
  // Must not start with a digit
  if (/^\d/.test(trimmed)) {
    throw new TypeError(`${label} "${trimmed}" must not start with a digit.`);
  }
  return trimmed;
}

/**
 * Validate an aggregate function name for use in KPI widget queries.
 * Throws a TypeError if the function is not in the safe whitelist.
 */
export function validateAggFn(fn: unknown): string {
  if (typeof fn !== "string" || fn.trim() === "") {
    throw new TypeError("Aggregate function must be a non-empty string.");
  }
  const upper = fn.trim().toUpperCase();
  if (!VALID_AGG_FNS.has(upper)) {
    throw new TypeError(
      `Invalid aggregate function "${fn}". Must be one of: ${[...VALID_AGG_FNS].join(", ")}.`
    );
  }
  return upper;
}

/**
 * Validate that a SQL string is a read-only SELECT statement.
 * Returns true if safe, false if a dangerous keyword is detected.
 *
 * This is a defence-in-depth check — not a substitute for parameterized queries.
 */
export function isSelectOnly(sql: string): boolean {
  const trimmed = sql.trim().toUpperCase();
  if (!trimmed.startsWith("SELECT")) return false;
  // Tokenise and check for dangerous keywords
  const tokens = trimmed.replace(/[^A-Z0-9_]/g, " ").split(/\s+/);
  for (const token of tokens) {
    if (DANGEROUS_SQL_KEYWORDS.includes(token)) return false;
  }
  return true;
}

/**
 * Build a safe DuckDB query for widget data.
 * Validates all inputs before interpolation.
 *
 * @param layer  - Lakehouse layer (bronze | silver | gold)
 * @param table  - Table name
 * @param type   - Widget type (to determine query shape)
 * @param xField - Column used as X-axis / KPI measure
 * @param yField - Aggregate function name for KPI widgets
 * @param limit  - Max rows to return (default 1000)
 * @returns A validated SQL string safe to pass to queryDuckDB()
 */
export function buildWidgetQuery(
  layer: unknown,
  table: unknown,
  type: string,
  xField: unknown,
  yField: unknown,
  limit = 1000
): string {
  const safeLayer = validateLayer(layer);
  const safeTable = validateIdentifier(table, "Table name");

  if (type === "KPI" && xField && yField) {
    const safeCol = validateIdentifier(xField, "xField");
    const safeAgg = validateAggFn(yField);
    return `SELECT ${safeAgg}("${safeCol}") as "${safeCol}" FROM "${safeLayer}"."${safeTable}"`;
  }

  return `SELECT * FROM "${safeLayer}"."${safeTable}" LIMIT ${limit}`;
}
