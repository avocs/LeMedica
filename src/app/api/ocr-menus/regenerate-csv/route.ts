import { NextRequest, NextResponse } from "next/server";
import { PackageRow } from "../../../../types/packages";
import { normalizePackageRow } from "../../../../services/normalizer";
import { generateBulkCsv } from "../../../../services/csvGenerator";
import fs from "fs/promises";
import path from "path";

/**
 * POST /api/ocr-menus/regenerate-csv
 * ----------------------------------
 * Accepts either:
 *  - A direct payload: { packages: PackageRow[], ... }
 *  - The full OCR response from /api/ocr-menus
 *    { success, batch_id, files, packages, summary, ... }
 *
 * Returns a text/csv response that matches the bulk import template.
 * Also writes a copy of the CSV into ./output/csv on the server.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const packagesInput = Array.isArray(body?.packages)
      ? body.packages
      : null;

    if (!packagesInput || !Array.isArray(packagesInput)) {
      return NextResponse.json(
        {
          success: false,
          message:
            "No packages array found. Expected either { packages: [...] } or a full OCR response that includes a 'packages' array.",
        },
        { status: 400 }
      );
    }

    const normalizedPackages = (packagesInput as PackageRow[]).map((pkg) =>
      normalizePackageRow(pkg)
    );
    const csvContent = generateBulkCsv(normalizedPackages);

    // Optional forwarding to importer
    let importerStatus: string | undefined;
    if (body.forwardToImporter) {
      const importerResult = await forwardCsvToImporter(csvContent, {
        confirmAutoCreate: body.confirmAutoCreate,
        clearExisting: body.clearExisting,
      });
      importerStatus = importerResult;
    }

    // 4) Build CSV response
    const batchId: string =
      typeof body.batch_id === "string" && body.batch_id.trim().length > 0
        ? body.batch_id.trim()
        : "clinic-menu-batch";

    // If the batchId already looks like "batch_20251204_215614_omm4",
    // reuse it directly as the base filename. Otherwise, prefix it.
    const defaultBaseName = batchId.startsWith("batch_")
      ? batchId
      : `batch_${batchId}`;

    const fileName =
      typeof body.fileName === "string" && body.fileName.trim().length > 0
        ? body.fileName.trim()
        : `${defaultBaseName}.csv`;

    const headers = new Headers({
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    });

    if (importerStatus) {
      headers.set("x-importer-status", importerStatus);
    }

    return new NextResponse(csvContent, { status: 200, headers });
  } catch (error) {
    console.error("Failed to regenerate CSV:", error);
    return NextResponse.json(
      { success: false, message: "Failed to regenerate CSV" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// Helper: forward CSV to existing bulk importer endpoint
// ---------------------------------------------------------------------------
async function forwardCsvToImporter(
  csvContent: string,
  options: { confirmAutoCreate?: boolean; clearExisting?: boolean }
): Promise<string> {
  const baseUrl =
    process.env.BULK_IMPORT_ENDPOINT ||
    (process.env.APP_BASE_URL
      ? `${process.env.APP_BASE_URL}/api/admin/bulk-import-packages`
      : "http://localhost:3000/api/admin/bulk-import-packages");

  const importerUrl = baseUrl;

  try {
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([csvContent], { type: "text/csv" }),
      "clinic-menu-import.csv"
    );
    if (options.confirmAutoCreate !== undefined) {
      formData.append("confirmAutoCreate", String(options.confirmAutoCreate));
    }
    if (options.clearExisting !== undefined) {
      formData.append("clearExisting", String(options.clearExisting));
    }

    const response = await fetch(importerUrl, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const details = await safeJson(response);
      return `failed:${details?.message || response.statusText}`;
    }

    return "success";
  } catch (error) {
    console.error("Failed to forward CSV to importer:", error);
    return "failed:network_error";
  }
}

async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
