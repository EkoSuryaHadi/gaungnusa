import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeFileSync } from "fs";
import path from "path";
import os from "os";
import { jobQueue } from "@/lib/queue";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const sourceId = parseInt(id, 10);
  if (isNaN(sourceId)) {
    return NextResponse.json({ error: "Invalid source ID" }, { status: 400 });
  }

  const source = await prisma.dataSource.findFirst({
    where: {
      id: sourceId,
      userId: session.userId,
      ...(session.tenantId ? { tenantId: session.tenantId } : {}),
    },
  });

  if (!source) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  if (source.type !== "DATABASE" && source.type !== "API") {
    return NextResponse.json(
      { error: "Only Database and API sources can be synchronized manually" },
      { status: 400 }
    );
  }

  // Update status to SYNCING
  const updatedSource = await prisma.dataSource.update({
    where: { id: source.id },
    data: { status: "SYNCING" },
  });

  // Run the appropriate worker in the background
  if (source.type === "DATABASE") {
    runDatabaseSync(source.id, source.name, JSON.parse(source.config), session.tenantId ?? null);
  } else {
    runApiSync(source.id, source.name, JSON.parse(source.config), session.tenantId ?? null);
  }

  return NextResponse.json({
    ...updatedSource,
    status: "SYNCING",
    message: "Synchronization enqueued in the background.",
  });
}

/**
 * Executes python3 worker/db_fetcher.py via JobQueue
 */
function runDatabaseSync(
  sourceId: number,
  sourceName: string,
  config: Record<string, unknown>,
  tenantId: number | null
) {
  const configPath = path.join(os.tmpdir(), `gaung_db_source_${sourceId}.json`);
  writeFileSync(
    configPath,
    JSON.stringify({
      sourceId,
      config,
    })
  );

  jobQueue.enqueue({
    id: `db_sync_${sourceId}`,
    type: "db_sync",
    sourceId,
    args: [configPath],
    scriptPath: path.join(process.cwd(), "worker", "db_fetcher.py"),
    onComplete: async (code, stdout, stderr) => {
      const success = code === 0;
      try {
        if (success) {
          // Parse results from stdout JSON
          const result: {
            status: string;
            rows: number;
            columns: string[];
            column_count: number;
            bronze_table: string;
          } = JSON.parse(stdout.trim());

          const columnsJson = JSON.stringify(
            result.columns.map((c) => ({ name: c, type: "TEXT" }))
          );

          // Update DataSource metadata
          await prisma.dataSource.update({
            where: { id: sourceId },
            data: {
              status: "ACTIVE",
              lastSyncAt: new Date(),
              rowsCount: result.rows,
              columnsCount: result.column_count,
            },
          });

          // Register table in LakehouseTable
          await prisma.lakehouseTable.upsert({
            where: {
              layer_tableName: {
                layer: "BRONZE",
                tableName: result.bronze_table,
              },
            },
            update: {
              rowsCount: result.rows,
              schema: columnsJson,
              updatedAt: new Date(),
            },
            create: {
              layer: "BRONZE",
              tableName: result.bronze_table,
              displayName: `${sourceName} (DB)`,
              schema: columnsJson,
              rowsCount: result.rows,
              sourceId,
              isSystem: true,
              ...(tenantId ? { tenantId } : {}),
            },
          });
        } else {
          throw new Error(stderr || "db_fetcher failed");
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[DB Sync Error for Source #${sourceId}]:`, msg);
        await prisma.dataSource.update({
          where: { id: sourceId },
          data: { status: "ERROR" },
        }).catch(() => {});
      }
    },
    onError: async (err) => {
      console.error(`[DB Sync Spawn Error for Source #${sourceId}]:`, err.message);
      await prisma.dataSource.update({
        where: { id: sourceId },
        data: { status: "ERROR" },
      }).catch(() => {});
    }
  });
}

/**
 * Executes python3 worker/api_fetcher.py via JobQueue
 */
function runApiSync(
  sourceId: number,
  sourceName: string,
  config: Record<string, unknown>,
  tenantId: number | null
) {
  jobQueue.enqueue({
    id: `api_sync_${sourceId}`,
    type: "api_sync",
    sourceId,
    args: [JSON.stringify(config), String(sourceId), sourceName],
    scriptPath: path.join(process.cwd(), "worker", "api_fetcher.py"),
    onComplete: async (code, stdout, stderr) => {
      const success = code === 0;
      try {
        if (success) {
          // Parse result pattern from stdout
          // Format: [RESULT] status=success rows={stored_count} table={table_name}
          const match = stdout.match(/\[RESULT\] status=success rows=(\d+) table=(.+)/);
          if (!match) {
            throw new Error("Could not parse api_fetcher RESULT output");
          }

          const rows = parseInt(match[1], 10);
          const tableName = match[2].trim();

          // Dynamically discover columns from Database Schema for the newly created bronze table
          const cols = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
            `SELECT column_name FROM information_schema.columns 
             WHERE table_schema = 'bronze' AND table_name = $1`,
            tableName
          );

          const columns = cols.map((c) => c.column_name);
          const columnsJson = JSON.stringify(
            columns.map((c) => ({ name: c, type: "TEXT" }))
          );

          // Update DataSource with column count
          await prisma.dataSource.update({
            where: { id: sourceId },
            data: {
              status: "ACTIVE",
              lastSyncAt: new Date(),
              rowsCount: rows,
              columnsCount: columns.length,
            },
          });

          // Register table in LakehouseTable
          await prisma.lakehouseTable.upsert({
            where: {
              layer_tableName: {
                layer: "BRONZE",
                tableName,
              },
            },
            update: {
              rowsCount: rows,
              schema: columnsJson,
              updatedAt: new Date(),
            },
            create: {
              layer: "BRONZE",
              tableName,
              displayName: `${sourceName} (API)`,
              schema: columnsJson,
              rowsCount: rows,
              sourceId,
              isSystem: true,
              ...(tenantId ? { tenantId } : {}),
            },
          });
        } else {
          throw new Error(stderr || "api_fetcher failed");
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[API Sync Error for Source #${sourceId}]:`, msg);
        await prisma.dataSource.update({
          where: { id: sourceId },
          data: { status: "ERROR" },
        }).catch(() => {});
      }
    },
    onError: async (err) => {
      console.error(`[API Sync Spawn Error for Source #${sourceId}]:`, err.message);
      await prisma.dataSource.update({
        where: { id: sourceId },
        data: { status: "ERROR" },
      }).catch(() => {});
    }
  });
}

