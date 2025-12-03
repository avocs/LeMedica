import { NextRequest, NextResponse } from "next/server";
import { PackageRow } from "../../../../types/packages";
import { normalizePackageRow } from "../../../../services/normalizer";
import { generateBulkCsv } from "../../../../services/csvGenerator";

/**
 * POST /api/ocr-menus/regenerate-csv
 * ----------------------------------
 * Accepts a JSON payload { packages: PackageRow[], forwardToImporter?: boolean }
 * and responds with a CSV file (text/csv) that mirrors the bulk import template.
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

    const normalizedPackages = (body.packages as PackageRow[]).map((pkg) =>
      normalizePackageRow(pkg)
    );
    const csvContent = generateBulkCsv(normalizedPackages);

    let importerStatus: string | undefined;
    if (body.forwardToImporter) {
      const importerResult = await forwardCsvToImporter(csvContent, {
        confirmAutoCreate: body.confirmAutoCreate,
        clearExisting: body.clearExisting,
      });
      importerStatus = importerResult;
    }

    const fileName = body.fileName || "clinic-menu-packages.csv";
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

