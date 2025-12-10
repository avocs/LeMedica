// src/app/api/clinic-menus/route.ts
// all that goes in this folder are server endpoints mounted at api/*, the backend
//  GET, POST, PUT, PATCH, DELETE server handlers
//  API transformation and routing
//  File processing endpoints (CSV generation, OCR pipeline)
//  Server-side logic your UI calls with fetch("/api/...")
//  Anything that should not be exposed to the client directly

import { NextRequest, NextResponse } from "next/server";
import { handleUploadAndExtractOcr } from "../../../../services/ocr";
import { extractPackagesFromOcrText } from "../../../../services/aiExtractor";
import { PackageRow} from "@/lib/types/ocr";
import {
  normalizePackageRow,
  validatePackageBatch,
} from "../../../../services/normalizer";

import { promises as fs } from "fs";
import { mkdirSync } from "fs";
import { join } from "path";

const OCR_OUTPUT_DIR = join(process.cwd(), "outputs","ocr");
export const runtime = "nodejs";

/**
 * POST
 * -------------------
 * 1. Accepts PDF / image uploads (FormData: file or files[]).
 * 2. Runs OCR + Bedrock extraction.
 * 3. Normalizes & validates packages.
 * 4. Returns JSON with { success, batch_id, files, packages, summary }.
 * 5. ✅ Also saves the same JSON payload as a pretty-printed file:
 *      ./ocr_outputs/<batch_id>.json
 */
export async function POST(req: NextRequest) {
  try {
    // 1) Upload + OCR
    console.log("[Route] Calling uploads...");
    const { batchId, ocrPages, filesMeta } = await handleUploadAndExtractOcr(req);
    // console.log("[Extractor] Got ocrPages:", ocrPages);

    // 2) AI extraction → raw PackageRow[]
    console.log("[Route] calling bedrock...");
    const extractedPackages = await extractPackagesFromOcrText(ocrPages);

    // 3) Normalise + validate
    const normalizedPackages: PackageRow[] = extractedPackages.map((pkg) =>
      normalizePackageRow(pkg)
    );

    const { validPackages, packagesWithWarnings, invalidPackages } =
      validatePackageBatch(normalizedPackages);

    const summary = {
      total: normalizedPackages.length,
      valid: validPackages.length,
      withWarnings: packagesWithWarnings.length,
      invalid: invalidPackages.length,
    };

    const responseBody = {
      success: true,
      batch_id: batchId,
      files: filesMeta,
      packages: normalizedPackages,
      summary,
    };

    // 4) ✅ Persist a pretty-printed JSON snapshot to ./ocr_outputs/<batch_id>.json
    await persistOcrResult(batchId, responseBody);

    // 5) Return JSON response as usual
    return NextResponse.json(responseBody, { status: 200 });
  } catch (error: any) {
    console.error("OCR menu processing failed:", error);
    const message =
      error?.message || "OCR / AI extraction failed. Please try again.";

    const status = typeof error?.status === "number" ? error.status : 500;

    return NextResponse.json(
      {
        success: false,
        message,
      },
      { status }
    );
  }
}

// ---------------------------------------------------------------------------
// Helper: Save OCR result as pretty-printed JSON
// ---------------------------------------------------------------------------
async function persistOcrResult(batchId: string, data: any) {
  try {
    // Ensure ./ocr_outputs exists
    mkdirSync(OCR_OUTPUT_DIR, { recursive: true });

    // File name: <batch_id>.json
    const filePath = join(OCR_OUTPUT_DIR, `${batchId}.json`);

    // Pretty-printed JSON with 2-space indent
    const json = JSON.stringify(data, null, 2);

    await fs.writeFile(filePath, json, "utf8");
    console.log(`[OCR] Saved JSON snapshot → ${filePath}`);
  } catch (err) {
    // Don't crash the request if file writing fails – just log it
    console.error("Failed to persist OCR JSON result:", err);
  }
}
