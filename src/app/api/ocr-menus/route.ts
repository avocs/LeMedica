import { NextRequest, NextResponse } from "next/server";
import { handleUploadAndExtractOcr } from "../../../services/ocr";
import { extractPackagesFromOcrText } from "../../../services/aiExtractor";
import { validatePackageBatch } from "../../../services/normalizer";

/**
 * POST /api/ocr-menus
 * -------------------
 * Expected FormData fields:
 * - file: File (single)  ← used by medical-records/medical-records/MedicalRecordsView.tsx
 * - files[]: File (optional array, same contract used by PDFProcessor fallback)
 * - mode: 'clinic_menu' | 'lab_report' (optional discriminator; defaults to clinic menu)
 *
 * This route is invoked by the existing medical records UI and the upcoming
 * clinic-menu management UI. It mirrors the FormData contract already used by
 * PDFProcessor.tsx so uploads do not need to change.
 */
export async function POST(req: NextRequest) {
  try {
    const { batchId, ocrPages, filesMeta } = await handleUploadAndExtractOcr(req);
    const packages = await extractPackagesFromOcrText(ocrPages);
    const summary = validatePackageBatch(packages);

    return NextResponse.json({
      success: true,
      batch_id: batchId,
      files: filesMeta,
      packages,
      summary: {
        total: packages.length,
        valid: summary.validPackages.length,
        withWarnings: summary.packagesWithWarnings.length,
        invalid: summary.invalidPackages.length,
      },
    });
  } catch (error: any) {
    console.error("OCR menu processing failed:", error);
    const status = error?.status || 500;
    return NextResponse.json(
      {
        success: false,
        message: error?.message || "Medical record processing failed.",
      },
      { status }
    );
  }
}

