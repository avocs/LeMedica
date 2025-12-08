// src/services/aiExtractor.ts
import type { PackageRow, OcrPage } from "@/lib/types/ocr";
import { callBedrockForExtraction } from "./bedrockClient";
import { normalizePackageRow } from "./normalizer";

/**
 * extractPackagesFromOcrText
 * --------------------------
 * Groups OCR pages per file, calls Bedrock once per file, and merges
 * all packages. This avoids one huge prompt across multiple files.
 */
export async function extractPackagesFromOcrText(
  ocrPages: OcrPage[]
): Promise<PackageRow[]> {
  if (!ocrPages.length) {
    return [];
  }

  // Group pages by fileId so each Bedrock call only sees one menu/file
  const pagesByFile = new Map<string, OcrPage[]>();
  for (const page of ocrPages) {
    if (!pagesByFile.has(page.fileId)) {
      pagesByFile.set(page.fileId, []);
    }
    pagesByFile.get(page.fileId)!.push(page);
  }

  const allPackages: PackageRow[] = [];

  for (const [fileId, pages] of pagesByFile.entries()) {
    // sort pages for that file
    const orderedPages = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);

    const prompt = buildPromptForSingleFile(orderedPages);
    logPromptStats(fileId, prompt);

    const rawResponse = await callBedrockForExtraction(prompt, {
      maxTokens: 6000,
      temperature: 0.1,
    });

    const cleaned = sanitizeModelResponse(rawResponse);

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned || "{}");
    } catch (err) {
      console.error("[Bedrock OCR] Non-JSON output preview:", rawResponse.slice(0, 500));
      console.error("[Bedrock OCR] Cleaned preview:", cleaned.slice(0, 500));
      throw new Error("Bedrock returned invalid JSON for OCR extraction.");
    }

    const packages: any[] = Array.isArray(parsed?.packages) ? parsed.packages : [];

    const fileName = orderedPages[0]?.fileName ?? "unknown-file";

    const normalizedForFile = packages.map((row, index) => {
      const normalized = normalizePackageRow(row);

      // Ensure _meta exists and has at least source_file/source_page
      const safeMeta = {
        ...(normalized._meta || {}),
        source_file: normalized._meta?.source_file || fileName,
        // don't guess page, but if model didn't set it we leave it undefined
      };

      return {
        ...normalized,
        id: normalized.id || `pkg_${fileId}_${index}_${Date.now()}`,
        _meta: safeMeta,
      } as PackageRow;
    });

    allPackages.push(...normalizedForFile);
  }

  return allPackages;
}

/**
 * buildPromptForSingleFile
 * ------------------------
 * Build a prompt for ONE file only (may still be multi-page).
 */
function buildPromptForSingleFile(pages: OcrPage[]): string {
  const ordered = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const mainFileName = ordered[0]?.fileName ?? "Unknown file";

  const joinedPages = ordered
    .map(
      (page) =>
        `--- PAGE ${page.pageNumber} (${page.fileName}) ---\n${page.rawText}\n`
    )
    .join("\n");

  return `
You are an assistant helping an admin system convert clinic menus into structured package data
for a bulk CSV upload.

This batch of OCR text comes from a single file:
- FILE NAME: "${mainFileName}"
- TOTAL PAGES: ${ordered.length}

The OCR input may:
- Span multiple pages.
- Use two or more-column layouts.
- Mix English, Chinese and regional languages.
- Contain both prices and non-priced explanatory text.

IMPORTANT EXTRACTION RULES
--------------------------
1. Scan **ALL pages** and **ALL lines** – do NOT stop early.
2. For this file, **EVERY clearly priced item must become a separate package**, even inside sections
   like "Express IV Drips", "Premium IV Drips", "IV Vitamin Drips" or "NAD+".
3. Section headers (e.g. "IV DRIP MENU", "Express IV Drips", "Premium IV Drips") are NOT packages
   by themselves unless they clearly show a price and read like a purchasable item.
4. Do not ignore lines just because they are Chinese or bilingual; Chinese-only packages
   must still be captured as packages.

DENSE LAYOUTS (LIKE EXPRESS / PREMIUM IV DRIPS)
-----------------------------------------------
Some menus put many packages into one long paragraph, for example:

  Express IV Drips
  Hydration Drip £100 Sodium Chloride + Bicarbonate + Potassium + Calcium
  MultiVit Drip £125 Basic Hydration + B Complex + 2g Vitamin C
  Energy Drip (Myers Cocktail) £150 Basic Hydration + B Complex + Amino Acids + B12 + Magnesium
  ...

In these dense layouts, you MUST:
- Treat **each "package name + price" pair as a separate package**, even if there is no bullet or line break.
- Typical patterns include:
  - "<Package Name> £100 ..."
  - "<Package Name> 150€ ..."
  - "<Package Name> RM 2,000 ..."
- Use the price tokens (e.g. "£100", "£125", "£150", "£175", etc.) as hard boundaries between packages.
- Everything between two price tokens usually belongs to the **preceding** package as description / details / includes.

Examples of text that SHOULD become packages:
- "Hydration Drip £100 Sodium Chloride + Bicarbonate + Potassium + Calcium"
- "MultiVit Drip £125 Basic Hydration + B Complex + 2g Vitamin C"
- "Energy Drip (Myers Cocktail) £150 Basic Hydration + B Complex + Amino Acids + B12 Methylcobalamin + Magnesium"
- "NAD+ Injection (SC) 60mg £100"
- "NAD+ Drip (IV) 250mg £250"
- "Vitamin C (500mg) £30"
- "Glutathione 600mg £70"

Do **NOT** treat pure explanatory sentences like:
- "Time needed: approx. 20 mins"
- "Save £10 and speed up your drip..."
as packages. These belong in details/description/duration of nearby packages if relevant, or can be ignored.

LOW-CONFIDENCE / AMBIGUOUS ITEMS
--------------------------------
Do **NOT** silently drop possible packages just because the layout is messy.

If you see a text fragment that **probably** represents a purchasable drip, injection or add-on,
but the boundaries are unclear:

- Still create a package.
- Set \`_meta.confidence_score\` to a low value (e.g. 0.3–0.6).
- Add one or more warnings in \`_meta.warnings\`, for example:
  - "Low confidence segmentation: package boundaries may be incorrect"
  - "Title and description may be mixed from neighbouring items"
  - "Price attached with low confidence"
- Only omit text that is clearly not a purchasable item (e.g. disclaimers, headings with no price, general marketing copy).

If you are unsure whether something is a header or a package with price, **prefer to emit it as a package**
with low \`confidence_score\` and a clear warning, rather than dropping it entirely.

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
- If the text is unreadable, leave translation_* as "" and add a warning like
  "OCR text unreadable for this package".

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
- "Low confidence segmentation: package boundaries may be incorrect"

OCR INPUT (THIS FILE ONLY, BY PAGE)
-----------------------------------
${joinedPages}
`;
}

/**
 * sanitizeModelResponse
 * ---------------------
 * 1. Strips obvious markdown fences (``` / ```json).
 * 2. Trims leading/trailing noise outside the FIRST '{' and LAST '}'.
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

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1).trim();
  }

  return cleaned;
}

/**
 * logPromptStats
 * --------------
 * Light logging so you can see if you’re hitting silly prompt sizes.
 */
function logPromptStats(fileId: string, prompt: string) {
  const charCount = prompt.length;
  const approxTokens = Math.round(charCount / 4); // rough-ish
  console.log(
    `[Bedrock OCR] Prompt for file ${fileId}: ${charCount} chars (~${approxTokens} tokens)`
  );
}
