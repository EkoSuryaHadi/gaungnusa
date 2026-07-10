import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";
const DEEPSEEK_BASE_URL = "https://ai.sumopod.com/v1";
const DEEPSEEK_MODEL = "deepseek-v4-pro";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Auth check
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const sourceId = parseInt(id);

    // 2. Fetch the source details
    const source = await prisma.dataSource.findFirst({
      where: {
        id: sourceId,
        userId: session.userId,
        ...(session.tenantId ? { tenantId: session.tenantId } : {}),
      },
    });

    if (!source) {
      return NextResponse.json({ error: "Data source not found" }, { status: 404 });
    }

    if (!source.filePath) {
      return NextResponse.json({ error: "No file associated with this data source" }, { status: 400 });
    }

    const filePath = path.join(process.cwd(), "uploads", source.filePath);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "File not found on disk" }, { status: 404 });
    }

    // 3. Extract columns and sample rows (first 10 rows)
    let columns: string[] = [];
    let previewRows: Record<string, any>[] = [];

    const ext = source.filePath.split(".").pop()?.toLowerCase();

    if (ext === "csv") {
      // Memory-safe stream reading for CSV
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
            } else if (lineCount <= 10) {
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
        columns = records.length > 0 ? Object.keys(records[0]) : [];
        previewRows = records.slice(0, 10);
      }
    } else if (ext === "xlsx" || ext === "xls") {
      // Excel parse using XLSX
      const buffer = fs.readFileSync(filePath);
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const records = XLSX.utils.sheet_to_json(firstSheet) as Record<string, any>[];
      columns = records.length > 0 ? Object.keys(records[0]) : [];
      previewRows = records.slice(0, 10);
    } else {
      return NextResponse.json({ error: "Unsupported file extension" }, { status: 400 });
    }

    if (columns.length === 0) {
      return NextResponse.json({ error: "No columns found in file" }, { status: 400 });
    }

    // 4. Construct Prompt
    const prompt = `Analisis file data berikut untuk menentukan domain/kategori data dan buatlah aturan validasi data (validation rules) yang sesuai untuk kolom-kolomnya.
Nama File: ${source.fileName || "unknown"}
Kolom: ${JSON.stringify(columns)}
Sampel Data (maks 10 baris):
${JSON.stringify(previewRows, null, 2)}

Klasifikasikan data ini ke dalam salah satu kategori berikut:
- "IoT / Telemetry" (misalnya data sensor, log perangkat, metrik jaringan)
- "HRD / Employee" (misalnya data karyawan, absensi, slip gaji, kinerja)
- "Penjualan / Sales" (misalnya data transaksi, invoices, e-commerce, pelanggan)
- "Keuangan / Finance" (misalnya data jurnal, kas, pembukuan, bank rekon)
- "Logistik / Supply Chain" (misalnya stok barang, inventaris, pengiriman, gudang)
- "Lainnya / Others" (jika tidak cocok dengan kategori di atas)

PENTING UNTUK ATURAN VALIDASI:
1. Nama kolom yang Anda tulis dalam aturan validasi HARUS PERSIS SAMA dengan nama kolom yang terdaftar pada list "Kolom" di atas (termasuk spasi, huruf besar/kecil, dan karakter khusus seperti tanda kurung). JANGAN mengubah spasi menjadi underscore, mengganti nama kolom, atau menyingkatnya. Contoh: jika nama kolom adalah "Transaction Date", tulis "Transaction Date" bukan "Transaction_Date". Jika nama kolom adalah "Reference No", tulis "Reference No" bukan "Bank_Ref".
2. Tentukan aturan validasi untuk kolom-kolom penting menggunakan format berikut (pisahkan dengan newline \\n):
   - NOT_NULL:nama_kolom (untuk kolom yang wajib diisi dan tidak boleh null/kosong)
   - DATE:nama_kolom (untuk kolom tanggal / timestamp)
   - NUMBER:nama_kolom,min=nilai,max=nilai (untuk kolom angka/float/int, min dan max opsional)
   - UNIQUE:nama_kolom (untuk ID unik)
   - ENUM:nama_kolom,values=nilai1,nilai2 (jika kolom memiliki nilai terbatas)

Kembalikan jawaban dalam format JSON mentah (jangan dibungkus markdown block) seperti ini:
{
  "category": "KATEGORI_YANG_TERDETEKSI",
  "explanation": "Penjelasan singkat dalam bahasa Indonesia mengapa dikategorikan ke sini (maksimal 2-3 kalimat).",
  "validationRules": "ATURAN_VALIDASI_DI_SINI"
}`;

    // 5. Call DeepSeek API
    if (!DEEPSEEK_API_KEY) {
      return NextResponse.json({ error: "DeepSeek API key is not configured" }, { status: 500 });
    }

    const aiRes = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          {
            role: "system",
            content: "Kamu adalah AI Data Classifier yang menganalisis kolom dan data untuk menebak domain/kategori data serta memberikan aturan validasi. Berikan respon hanya dalam bentuk format JSON valid.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.1,
      }),
    });

    if (!aiRes.ok) {
      const errorText = await aiRes.text();
      console.error("DeepSeek API error:", errorText);
      return NextResponse.json({ error: "Failed to call DeepSeek API" }, { status: 502 });
    }

    const aiData = await aiRes.json();
    const responseText = aiData.choices?.[0]?.message?.content || "";

    // 6. Clean and Parse Response JSON
    let category = "Lainnya / Others";
    let explanation = "Gagal mengklasifikasikan data.";
    let validationRules = "";

    try {
      let cleaned = responseText.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
      }
      const parsed = JSON.parse(cleaned);
      if (parsed.category) category = parsed.category;
      if (parsed.explanation) explanation = parsed.explanation;
      if (parsed.validationRules) validationRules = parsed.validationRules;
    } catch (parseErr) {
      console.error("Failed to parse DeepSeek JSON response:", responseText, parseErr);
    }

    // 7. Update DataSource config to store the classification
    let currentConfig: Record<string, any> = {};
    try {
      if (source.config) {
        currentConfig = JSON.parse(source.config);
      }
    } catch (e) {
      // keep empty
    }

    const updatedConfig = {
      ...currentConfig,
      category,
      explanation,
      validationRules,
    };

    await prisma.dataSource.update({
      where: { id: source.id },
      data: {
        config: JSON.stringify(updatedConfig),
      },
    });

    return NextResponse.json({
      success: true,
      category,
      explanation,
      validationRules,
    });
  } catch (error: any) {
    console.error("Classification route error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
