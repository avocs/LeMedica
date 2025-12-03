import { OcrPage, PackageRow } from "../types/packages";
import { callBedrockForExtraction } from "./bedrockClient";
import { normalizePackageRow } from "./normalizer";

/**
 * extractPackagesFromOcrText
 * --------------------------
 * Builds a structured prompt from OCR output, invokes Claude via Bedrock,
 * and returns normalized PackageRow objects ready for CSV serialization.
 */
export async function extractPackagesFromOcrText(
  ocrPages: OcrPage[]
): Promise<PackageRow[]> {
  if (!ocrPages.length) {
    return [];
  }

  const prompt = buildPrompt(ocrPages);
  const response = await callBedrockForExtraction(prompt, {
    maxTokens: 6000,
    temperature: 0.1,
  });

  const cleaned = sanitizeModelResponse(response);
  const parsed = JSON.parse(cleaned || "{}");
  const packages: any[] = Array.isArray(parsed?.packages) ? parsed.packages : [];

  return packages.map((row) => normalizePackageRow(row));
}

function buildPrompt(pages: OcrPage[]): string {
  const ordered = [...pages].sort((a, b) => {
    if (a.fileId === b.fileId) {
      return a.pageNumber - b.pageNumber;
    }
    return a.fileId.localeCompare(b.fileId);
  });

  const joinedPages = ordered
    .map(
      (page) =>
        `--- PAGE ${page.pageNumber} (${page.fileName}) ---\n${page.rawText}\n`
    )
    .join("\n");

  return `
You are an expert medical-tourism operations assistant.
Convert the noisy OCR snippets below into structured clinic packages.

Rules:
- Respond with valid JSON only (no markdown fences).
- Your JSON must have { "packages": [ ... ] }.
- Every package must contain the following keys: title, hospital_name, treatment_name, price, currency, featured, status, is_le_package, _meta.
- Price, original_price, and commission must be numbers or null.
- Currency must be one of: USD, THB, EUR, GBP, SGD, MYR, KRW. Guess based on context if missing.
- Featured defaults to false, status defaults to "active", is_le_package defaults to false.
- Sub treatments map to the "Sub Treatments" CSV column. Provide comma-separated values if more than one.
- Includes should describe inclusions like accommodations, transfers, consultations, etc.
- Duration describes stays or treatment length using readable text (e.g., "5 nights", "3-4 hours").
- Hospital and treatment names should reuse the clinic wording when obvious.
- _meta must include { "source_file": "<filename>", "source_page": <pageNumber>, "confidence_score": 0.0-1.0 }.

CSV header order for reference:
title,description,details,hospital_name,treatment_name,Sub Treatments,price,original_price,currency,duration,treatment_category,anaesthesia,commission,featured,status,doctor_name,is_le_package,includes,image_file_id,hospital_location,category,hospital_country,translation_title,translation_description,translation_details,translation

OCR INPUT:
${joinedPages}
`;
}

function sanitizeModelResponse(value: string): string {
  return value
    .trim()
    .replace(/^```json/i, "")
    .replace(/^```/, "")
    .replace(/```$/, "")
    .trim();
}

