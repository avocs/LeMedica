import type { PackageRow, OcrPage } from "@/lib/types/ocr";
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
  const rawResponse = await callBedrockForExtraction(prompt, {
    maxTokens: 6000,
    temperature: 0.1,
  });

  const cleaned = sanitizeModelResponse(rawResponse);

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned || "{}");
  } catch (err) {
    // Log a short preview so you can see what Claude actually returned
    console.error(
      "[Bedrock OCR] Non-JSON output preview:",
      rawResponse.slice(0, 500)
    );
    console.error("[Bedrock OCR] Cleaned preview:", cleaned.slice(0, 500));
    throw new Error("Bedrock returned invalid JSON for OCR extraction.");
  }

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
You are an assistant helping an admin system convert clinic menus into structured package data
for a bulk CSV upload.

The OCR input may:
- Span multiple pages.
- Use two-column layouts.
- Mix English, Chinese and regional languages.

IMPORTANT:
- Scan ALL pages and ALL lines.
- **EVERY clearly priced item must become a separate package**, even inside sections
  like "Express IV Drips" or "Premium IV Drips".
- Do NOT stop after the first few items if more prices appear later.
- Section headers (e.g. "IV DRIP MENU") are NOT packages by themselves unless they
  clearly show a price and read like a purchasable item.

OUTPUT FORMAT
-------------
Return VALID JSON only (no markdown, no backticks, no comments) with this exact top-level shape:

{
  "packages": [ { /* PackageRow */ }, ... ]
}

Each package object must contain ALL of these keys:

- title: string
- description: string
- details: string
- hospital_name: string
- treatment_name: string
- sub_treatments: string
- price: number or null
- original_price: number or null
- currency: "USD" | "THB" | "EUR" | "GBP" | "SGD" | "MYR" | "KRW"
- duration: string
- treatment_category: string
- anaesthesia: string
- commission: number or null
- featured: boolean
- status: "active" | "inactive"
- doctor_name: string
- is_le_package: boolean
- includes: string
- image_file_id: string | null
- hospital_location: string
- category: string
- hospital_country: string
- translation_title: string
- translation_description: string
- translation_details: string
- translation: string
- _meta: {
    source_file: string,
    source_page: number,
    confidence_score: number,
    warnings: string[]
  }

If any value is unknown:
- Use "" for strings
- null for numbers
- false for booleans (featured, is_le_package) unless explicitly stated
- status defaults to "active" if unclear

LANGUAGE & TRANSLATION
----------------------
- If the package text is already in ENGLISH:
  - Keep title / description / details in English.
  - translation_title / translation_description / translation_details → "".
  - translation → "" or "EN".
- If the package text is NOT English (e.g. Chinese, Thai):
  - Keep the original language in title / description / details.
  - Provide a good Chinese translation:
      - translation_title: title translated to Chinese.
      - translation_description: description translated to Chinese.
      - translation_details: details translated to Chinese.
  - Set translation to a short language code like "ZH" or "TH->ZH".
- If the text is unreadable, leave translation_* as "" and add a warning.

CANONICAL TREATMENT NAMES
-------------------------
When you infer or normalize treatment_name, you MUST prefer the following
canonical names whenever they clearly match the menu context. Use these exact
strings (including capitalization and spacing) where appropriate:

Diagnostics:
- "Health Checkup"
- "Cancer Screening"
- "MRI Scan"
- "CT Scan"
- "PET-CT Scan"
- "Blood Test"
- "Cardiac Screening"

Surgery:
- "Hip & Knee Replacement"
- "Spinal Surgery"
- "Brain Tumor Surgery"
- "Heart Valve Repair"
- "Kidney Transplant"
- "Liver Transplant"
- "LASIK Surgery"
- "Cataract Surgery"
- "Glaucoma Surgery"
- "Gastric Sleeve"
- "Gastric Bypass"
- "Endoscopic Sleeve Gastroplasty"
- "Gender-Affirming Surgery"
- "Pacemaker Implantation"
- "Prostate Surgery"
- "Vasectomy Reversal"
- "Hysterectomy"
- "Fibroid Removal"
- "Corneal Transplant"
- "Deep Brain Stimulation (DBS)"
- "Epilepsy Surgery"
- "Spinal Cord Surgery"

Cosmetic & Plastic Surgery:
- "Facial Plastic Surgery"
- "Breast Augmentation"
- "Rhinoplasty"
- "Liposuction"
- "Botox Treatment"
- "Dermal Fillers"
- "Hair Transplant"
- "Laser Resurfacing"
- "Buccal Fat Removal"
- "Chin Augmentation"
- "Teeth Whitening"
- "Veneer"

Treatment:
- "Dental Implants"
- "Root Canal"
- "IVF (In Vitro Fertilization)"
- "IUI (Intrauterine Insemination)"
- "Egg Freezing"
- "HRT (Hormone Replacement Therapy)"

Oncology:
- "Chemotherapy"
- "Radiation Therapy"
- "Immunotherapy"
- "Proton Therapy"

Wellness:
- "Detox Retreats"
- "IV Therapy"
- "Anti-Aging Therapy"
- "Physiotherapy"

Traditional Medicine:
- "Acupuncture"
- "Ayurveda"
- "Thai Massage"

Rules:
- If a menu item clearly matches one of the above, set treatment_name to that exact string.
- If no canonical name fits, you may use a best-effort descriptive treatment_name
  such as "IV Drip Therapy", "Skin Rejuvenation Package", etc.

FIELD MAPPING HINTS
-------------------
- Each distinct line or block with a price (e.g. "Hydration Drip £100") is its own package.
- Use the local price symbol or context to infer currency, e.g.:
    - "£" → GBP
    - "RM" → MYR
    - "฿" → THB
    - "S$" → SGD
    - "$" with US context → USD
- treatment_name: use a canonical name from the list above whenever possible.
- sub_treatments: comma-separated sub-focuses (e.g. "Hydration,Skin Rejuvenation").
- includes: formatted inclusions like "Consultation,Drip,Follow Up".

_Example warnings in _meta.warnings_:
- "Hospital not recognized: …"
- "Treatment not recognized: …"
- "Missing price for package …"
- "Currency not recognized"

CSV header order for reference:
title,description,details,hospital_name,treatment_name,Sub Treatments,price,original_price,currency,duration,treatment_category,anaesthesia,commission,featured,status,doctor_name,is_le_package,includes,image_file_id,hospital_location,category,hospital_country,translation_title,translation_description,translation_details,translation

OCR INPUT (ALL PAGES):
${joinedPages}
`;
}

/**
 * sanitizeModelResponse
 * ---------------------
 * 1. Strips obvious markdown fences (``` / ```json).
 * 2. Trims leading/trailing noise outside the FIRST '{' and LAST '}'.
 *    This protects against Claude adding prose like "I'll help you..."
 *    before the JSON, or extra commentary after it.
 */
function sanitizeModelResponse(value: string): string {
  if (!value) return "";

  let cleaned = value.trim();

  // Strip common markdown fences
  cleaned = cleaned
    .replace(/^```json/i, "")
    .replace(/^```/, "")
    .replace(/```$/, "")
    .trim();

  // Grab only the innermost JSON object: from first '{' to last '}'.
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1).trim();
  }

  return cleaned;
}
