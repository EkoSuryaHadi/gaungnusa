import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { parse } from "csv-parse/sync";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sources = await prisma.dataSource.findMany({
    where: {
      userId: session.userId,
      ...(session.tenantId ? { tenantId: session.tenantId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(sources);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const name = formData.get("name") as string | null;

    if (!file || !name) {
      return NextResponse.json({ error: "File and name are required" }, { status: 400 });
    }

    if (!file.name.endsWith(".csv")) {
      return NextResponse.json({ error: "Only CSV files are accepted" }, { status: 400 });
    }

    const uploadDir = path.join(process.cwd(), "uploads");
    await mkdir(uploadDir, { recursive: true });

    const fileName = `${Date.now()}_${file.name}`;
    const filePath = path.join(uploadDir, fileName);

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    // Parse CSV to count rows and infer columns
    const content = buffer.toString("utf-8");
    let rowsCount = 0;
    let columnsCount = 0;
    try {
      const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
        relax_quotes: true,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const typed = records as any[];
      rowsCount = typed.length;
      columnsCount = typed.length > 0 ? Object.keys(typed[0]).length : 0;
    } catch (e) {
      // Parsing failed, still save the file
    }

    const source = await prisma.dataSource.create({
      data: {
        userId: session.userId,
        tenantId: session.tenantId ?? null,
        name,
        type: "CSV",
        fileName: file.name,
        fileSize: buffer.length,
        filePath: fileName,
        rowsCount,
        columnsCount,
        config: JSON.stringify({ originalName: file.name }),
      },
    });

    return NextResponse.json(source);
  } catch (error: any) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
