import { NextRequest, NextResponse } from "next/server";
import { PackageRow } from "../../../../types/packages";
import { normalizePackageRow } from "../../../../services/normalizer";
import { generateBulkCsv } from "../../../../services/csvGenerator";

/**
 * POST /api/ocr-menus/preview-csv
 * -------------------------------
 * Utility endpoint that returns CSV content inside JSON for UI previews.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!Array.isArray(body?.packages)) {
      return NextResponse.json(
        { success: false, message: "packages array is required" },
        { status: 400 }
      );
    }

    const normalized = (body.packages as PackageRow[]).map((pkg) =>
      normalizePackageRow(pkg)
    );
    const csvContent = generateBulkCsv(normalized);

    return NextResponse.json({ success: true, csv_content: csvContent });
  } catch (error) {
    console.error("Failed to preview CSV:", error);
    return NextResponse.json(
      { success: false, message: "Failed to preview CSV" },
      { status: 500 }
    );
  }
}

