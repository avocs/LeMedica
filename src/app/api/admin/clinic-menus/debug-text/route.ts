// src/app/api/admin/clinic-menus/debug-text/route.ts
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { join } from "path";

const OCR_DEBUG_DIR = join(process.cwd(), "data", "tmp", "ocr-debug");

type DebugTextFile = {
  name: string;
  content: string;
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const batchId = searchParams.get("batchId");

  if (!batchId) {
    return NextResponse.json(
      { message: "Missing batchId query parameter" },
      { status: 400 }
    );
  }

  try {
    // List files in data/tmp/ocr-debug
    const files = await fs.readdir(OCR_DEBUG_DIR);

    // Only files for this batch
    const matched = files.filter((f) => f.includes(batchId));

    const debugFiles: DebugTextFile[] = [];

    for (const fileName of matched) {
      const fullPath = join(OCR_DEBUG_DIR, fileName);
      const content = await fs.readFile(fullPath, "utf8");
      debugFiles.push({
        name: fileName,
        content,
      });
    }

    return NextResponse.json({ files: debugFiles }, { status: 200 });
  } catch (err) {
    console.error("[Debug Text] Failed to read OCR debug files:", err);
    return NextResponse.json(
      { message: "Failed to load debug text" },
      { status: 500 }
    );
  }
}
