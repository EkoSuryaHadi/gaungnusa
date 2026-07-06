import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const source = await prisma.dataSource.findFirst({
    where: { id: parseInt(id), userId: session.userId, ...(session.tenantId ? { tenantId: session.tenantId } : {}) },
    include: { pipelines: { include: { steps: true } } },
  });

  if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Try to get CSV preview (stream first 100 lines only for large files)
  let preview: { columns: string[]; rows: Record<string, any>[] } | null = null;
  if (source.filePath) {
    try {
      const filePath = path.join(process.cwd(), "uploads", source.filePath);
      if (fs.existsSync(filePath)) {
        // Read just the header + first 100 data lines to avoid memory issues with large files
        const readStream = fs.createReadStream(filePath, { encoding: "utf-8", highWaterMark: 64 * 1024 });
        let header = "";
        let previewLines: string[] = [];
        let lineCount = 0;
        let remaining = "";

        await new Promise<void>((resolve, reject) => {
          readStream.on("data", (chunk) => {
            const text = typeof chunk === "string" ? chunk : (chunk as Buffer).toString("utf-8");
            remaining += text;
            const lines = remaining.split("\n");
            remaining = lines.pop() || "";

            for (const line of lines) {
              if (lineCount === 0) {
                header = line;
              } else if (lineCount <= 100) {
                previewLines.push(line);
              } else {
                readStream.destroy();
                break;
              }
              lineCount++;
            }
          });
          readStream.on("close", resolve);
          readStream.on("error", reject);
        });

        if (header) {
          const csvText = [header, ...previewLines].join("\n");
          const records = parse(csvText, {
            columns: true,
            skip_empty_lines: true,
            relax_column_count: true,
            relax_quotes: true,
          }) as Record<string, any>[];
          const columns = records.length > 0 ? Object.keys(records[0]) : [];
          preview = { columns, rows: records };
        }
      }
    } catch (e) { /* ignore parse errors */ }
  }

  return NextResponse.json({ ...source, preview });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const source = await prisma.dataSource.findFirst({
    where: { 
      id: parseInt(id), 
      userId: session.userId,
      ...(session.tenantId ? { tenantId: session.tenantId } : {}), 
    },
  });

  // Fallback: if not found with tenantId, try without (legacy sources with NULL tenantId)
  if (!source && session.tenantId) {
    const legacySource = await prisma.dataSource.findFirst({
      where: { id: parseInt(id), userId: session.userId, tenantId: null },
    });
    if (legacySource) {
      // Auto-fix: assign tenantId
      await prisma.dataSource.update({ where: { id: legacySource.id }, data: { tenantId: session.tenantId! } });
      // Delete file
      if (legacySource.filePath) {
        try {
          const fp = path.join(process.cwd(), "uploads", legacySource.filePath);
          if (fs.existsSync(fp)) fs.unlinkSync(fp);
        } catch (e) {}
      }
      await prisma.dataSource.delete({ where: { id: legacySource.id } });
      return NextResponse.json({ success: true });
    }
  }

  if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Delete file
  if (source.filePath) {
    try {
      const filePath = path.join(process.cwd(), "uploads", source.filePath);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (e) {}
  }

  await prisma.dataSource.delete({ where: { id: source.id } });
  return NextResponse.json({ success: true });
}
