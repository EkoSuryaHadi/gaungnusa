import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const METABASE_URL = process.env.METABASE_URL || 'http://localhost:3001';
const METABASE_USER = process.env.METABASE_USER || 'e.suryahadi@gmail.com';
const METABASE_PASS = process.env.METABASE_PASS || 'Sandimas@2026!';
const METABASE_DB_ID = parseInt(process.env.METABASE_DB_ID || '3');
const METABASE_EMBED_SECRET = process.env.METABASE_EMBED_SECRET || '';

let cachedSession: string | null = null;
let sessionExpiry = 0;

async function getMetabaseSession(): Promise<string> {
  if (cachedSession && Date.now() < sessionExpiry) return cachedSession;

  const res = await fetch(`${METABASE_URL}/api/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: METABASE_USER, password: METABASE_PASS }),
  });
  const data = await res.json();
  cachedSession = data.id;
  sessionExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000;
  return cachedSession!;
}

interface ColumnInfo {
  name: string;
  type: string;
  fieldId: number;
  isNumeric: boolean;
  isDate: boolean;
  isCategory: boolean;
}

async function getTableColumns(session: string, tableName: string): Promise<ColumnInfo[]> {
  const tablesRes = await fetch(`${METABASE_URL}/api/table?db_id=${METABASE_DB_ID}`, {
    headers: { 'X-Metabase-Session': session },
  });
  const tables = await tablesRes.json();

  // Metabase returns array directly (not { data: [...] })
  const tableList = Array.isArray(tables) ? tables : tables.data || [];
  const table = tableList.find((t: any) =>
    t.name.toLowerCase() === tableName.toLowerCase()
  );

  if (!table) throw new Error(`Table "${tableName}" not found in Metabase`);

  const metaRes = await fetch(
    `${METABASE_URL}/api/table/${table.id}/query_metadata`,
    { headers: { 'X-Metabase-Session': session } }
  );
  const meta = await metaRes.json();

  return meta.fields.map((f: any) => ({
    name: f.name,
    type: f.base_type || 'type/Text',
    fieldId: f.id,
    isNumeric: [
      'type/Integer', 'type/BigInteger', 'type/Decimal',
      'type/Float', 'type/Number',
    ].includes(f.base_type),
    isDate: ['type/Date', 'type/DateTime', 'type/Time'].includes(f.base_type),
    isCategory:
      f.semantic_type === 'type/Category' ||
      (['type/Text'].includes(f.base_type) &&
        !f.name.toLowerCase().includes('id')),
  }));
}

async function createCard(
  session: string,
  name: string,
  sql: string,
  display: string,
  vizSettings: any = {}
) {
  const res = await fetch(`${METABASE_URL}/api/card`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Metabase-Session': session,
    },
    body: JSON.stringify({
      name,
      dataset_query: {
        database: METABASE_DB_ID,
        type: 'native',
        native: { query: sql, 'template-tags': {} },
      },
      display,
      description: null,
      visualization_settings: vizSettings,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`Card creation failed (${name}):`, err.slice(0, 200));
    return null;
  }
  return res.json();
}

function safeTable(schema: string, table: string) {
  return `"${schema}"."${table}"`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tableName, schema = 'gold', dashboardTitle, tenantId } = body;

    if (!tableName) {
      return NextResponse.json({ error: 'tableName required' }, { status: 400 });
    }

    const mbSession = await getMetabaseSession();

    // 1. Get column metadata
    const columns = await getTableColumns(mbSession, tableName);
    const numericCols = columns.filter(c => c.isNumeric);
    const categoryCols = columns.filter(c => c.isCategory);
    const dateCols = columns.filter(c => c.isDate);
    const tbl = safeTable(schema, tableName);

    // 2. Create dashboard
    const dashRes = await fetch(`${METABASE_URL}/api/dashboard`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Metabase-Session': mbSession,
      },
      body: JSON.stringify({
        name: dashboardTitle || `${tableName} — ${schema.toUpperCase()}`,
        description: `Auto-generated from Gaung pipeline — ${schema}.${tableName}`,
        parameters: [],
      }),
    });

    if (!dashRes.ok) {
      const err = await dashRes.text();
      throw new Error(`Dashboard creation failed: ${err}`);
    }

    const dashboard = await dashRes.json();
    const dbId = dashboard.id;
    const cards: any[] = [];

    // 3. KPI cards — one per numeric column (max 4)
    for (const col of numericCols.slice(0, 4)) {
      const card = await createCard(
        mbSession,
        `Total ${col.name.replace(/_/g, ' ')}`,
        `SELECT COALESCE(SUM("${col.name}"), 0) AS "total" FROM ${tbl}`,
        'scalar',
        { number_style: 'decimal', decimals: 0 }
      );
      if (card) cards.push({ ...card, _kind: 'kpi' });
    }

    // 4. Record count KPI
    const countCard = await createCard(
      mbSession,
      'Total Records',
      `SELECT COUNT(*) AS "total" FROM ${tbl}`,
      'scalar',
      {}
    );
    if (countCard) cards.push({ ...countCard, _kind: 'kpi' });

    // 5. Bar chart — first numeric vs first category
    if (numericCols.length > 0 && categoryCols.length > 0) {
      const n = numericCols[0].name;
      const c = categoryCols[0].name;
      const card = await createCard(
        mbSession,
        `${n.replace(/_/g, ' ')} by ${c.replace(/_/g, ' ')}`,
        `SELECT "${c}", SUM("${n}") AS "${n}" FROM ${tbl} GROUP BY "${c}" ORDER BY SUM("${n}") DESC LIMIT 20`,
        'bar',
        {}
      );
      if (card) cards.push({ ...card, _kind: 'bar' });
    }

    // 6. Pie chart — second category or second numeric
    if (categoryCols.length >= 2) {
      const c = categoryCols[1].name;
      const card = await createCard(
        mbSession,
        `Distribution by ${c.replace(/_/g, ' ')}`,
        `SELECT "${c}", COUNT(*) AS "count" FROM ${tbl} GROUP BY "${c}" ORDER BY COUNT(*) DESC`,
        'pie',
        {}
      );
      if (card) cards.push({ ...card, _kind: 'pie' });
    } else if (categoryCols.length === 1 && numericCols.length >= 2) {
      const n = numericCols[1].name;
      const c = categoryCols[0].name;
      const card = await createCard(
        mbSession,
        `${n.replace(/_/g, ' ')} by ${c.replace(/_/g, ' ')}`,
        `SELECT "${c}", SUM("${n}") AS "${n}" FROM ${tbl} GROUP BY "${c}" ORDER BY SUM("${n}") DESC`,
        'pie',
        {}
      );
      if (card) cards.push({ ...card, _kind: 'pie' });
    }

    // 7. Line chart — date + numeric if date column exists
    if (dateCols.length > 0 && numericCols.length > 0) {
      const d = dateCols[0].name;
      const n = numericCols[0].name;
      const card = await createCard(
        mbSession,
        `${n.replace(/_/g, ' ')} over Time`,
        `SELECT "${d}", SUM("${n}") AS "${n}" FROM ${tbl} GROUP BY "${d}" ORDER BY "${d}"`,
        'line',
        {}
      );
      if (card) cards.push({ ...card, _kind: 'line' });
    }

    // 8. Detail table
    const allCols = columns.map(c => `"${c.name}"`).join(', ');
    const tableCard = await createCard(
      mbSession,
      `${tableName} — Detail`,
      `SELECT ${allCols} FROM ${tbl} ORDER BY 1 LIMIT 100`,
      'table',
      {}
    );
    if (tableCard) cards.push({ ...tableCard, _kind: 'table' });

    // 9. Add cards to dashboard
    const addedCards: any[] = [];
    for (const card of cards) {
      try {
        const addRes = await fetch(
          `${METABASE_URL}/api/dashboard/${dbId}/cards`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Metabase-Session': mbSession,
            },
            body: JSON.stringify({ cardId: card.id }),
          }
        );
        if (addRes.ok) {
          const added = await addRes.json();
          addedCards.push({ ...added, _kind: card._kind });
        }
      } catch (e) {
        console.error(`Failed adding card ${card.id}:`, e);
      }
    }

    // 10. Position cards
    if (addedCards.length > 0) {
      let row = 0;
      const dashcards = addedCards.map((dc: any, i: number) => {
        const isKPI = dc._kind === 'kpi';
        const pos = {
          id: dc.id,
          card_id: dc.card_id,
          row: isKPI ? 0 : row,
          col: isKPI ? (i * 6) % 24 : 0,
          size_x: isKPI ? 6 : 24,
          size_y: isKPI ? 3 : 5,
          parameter_mappings: [],
          visualization_settings: {},
        };
        if (!isKPI) row += 5;
        return pos;
      });

      await fetch(`${METABASE_URL}/api/dashboard/${dbId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Metabase-Session': mbSession,
        },
        body: JSON.stringify({ dashcards }),
      });
    }

    // 11. Generate public link
    let publicUuid: string | null = null;
    try {
      const pubRes = await fetch(`${METABASE_URL}/api/dashboard/${dbId}/public_link`, {
        method: "POST",
        headers: { "X-Metabase-Session": mbSession },
      });
      if (pubRes.ok) {
        const pubData = await pubRes.json();
        publicUuid = pubData.uuid;
      }
    } catch {}

    // 12. Save to Gaung
    const publicUrl = publicUuid
      ? `${METABASE_URL}/public/dashboard/${publicUuid}`
      : `${METABASE_URL}/dashboard/${dbId}`;

    const gaungDashboard = await prisma.dashboard.create({
      data: {
        name: dashboardTitle || `${tableName} — ${schema.toUpperCase()}`,
        description: `Auto-generated from ${schema}.${tableName}`,
        metabaseId: dbId,
        metabaseUrl: publicUrl,
        sourceTable: tableName,
        sourceLayer: schema,
        tenantId: tenantId || 1,
        userId: 1, // default admin
        layout: '[]',
      },
    });

    return NextResponse.json({
      success: true,
      dashboard: {
        id: gaungDashboard.id,
        metabaseId: dbId,
        embedUrl: publicUrl,
        directUrl: `${METABASE_URL}/dashboard/${dbId}`,
        publicUuid,
        cards: cards.length,
        addedToDashboard: addedCards.length,
      },
    });
  } catch (error: any) {
    console.error('Auto-dashboard error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function generateSignedUrl(dashboardId: number, secret: string): string {
  const crypto = require('crypto');
  const payload = {
    resource: { dashboard: dashboardId },
    params: {},
    exp: Math.round(Date.now() / 1000) + 60 * 60 * 24,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payloadB64)
    .digest('base64url');
  return `${METABASE_URL}/embed/dashboard/${payloadB64}.${signature}#bordered=false&titled=true`;
}
