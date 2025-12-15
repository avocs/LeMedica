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
You are a backend extraction worker. Convert clinic menu OCR text into structured JSON for bulk CSV upload.

IMPORTANT: This is a **tool call**, not a chat.  
- Do NOT ask questions.  
- Do NOT explain your reasoning.  
- Do NOT comment on missing pages or placeholders.  
- **Return ONLY a single JSON object** as described below.

FILE CONTEXT
------------
- FILE NAME: "${mainFileName}"
- TOTAL PAGES: ${ordered.length}

Some pages may be empty or have weak OCR; just skip non-usable text without commenting on it.

GLOBAL EXTRACTION RULES
-----------------------
1. Scan ALL pages and ALL lines that contain text.
2. **EVERY clearly priced item is a separate package**, even inside sections like:
   - IV drips (e.g. "Signature Drip", "Express IV Drips", "Premium IV Drips")
   - Vitamin drips / injections
   - Session-based services (Compression Therapy, Red Light Therapy, Hyperbaric Oxygen Therapy, Infrared Sauna, etc.)
3. A line/block is a package if it has:
   - a name/title, AND
   - a price (e.g. "£100", "£25", "RM 1,500").
4. Section headings with NO price are NOT packages.
5. Do NOT ignore non-English or bilingual lines; Chinese/Thai-only packages are still valid.
6. If you are unsure whether something is a package, **prefer to include it** with low confidence instead of silently dropping it.

SEGMENTATION (MUST FOLLOW)
--------------------------
You MUST extract packages using PRICE ANCHORS.

1) Scan OCR text and identify all price anchors in the form:
   - currency symbol + number (e.g. £100, RM 150, ฿2,500, S$80, $120)
   - number + currency code/keyword (e.g. 150 MYR, 120 USD)
   - "from £55" counts as a price anchor as well.
2) Each price anchor defines ONE package.
3) For each price anchor:
   - title = nearest plausible item name within ~1–2 lines around the anchor.
   - description/details = text immediately adjacent that looks like inclusions/ingredients/duration.
4) If borders are unclear (dense menus):
   - DO NOT give up.
   - Still emit one package per price anchor.
   - If title is uncertain, set a minimal title like "Package – £100" (or "Package – RM150") and lower confidence.

MINIMUM OUTPUT REQUIREMENT
--------------------------
If you detect N distinct price anchors in the OCR for this file, you MUST output AT LEAST N packages
(unless some anchors are exact duplicates referring to the same item).
If you output fewer packages than anchors, add warnings explaining which anchors could not be mapped.

OCR NOISE HANDLING
------------------
- OCR may contain random characters. Ignore isolated garbage tokens not near price anchors.
- NEVER invent missing words/characters.
- If text near a price anchor is incomplete/noisy, still output the package with:
  - _meta.confidence_score between 0.3 and 0.6
  - a warning: "OCR text incomplete/noisy near price anchor"

SERVICE + SESSION BUNDLES
-------------------------
For bundles like:

  Compression Therapy ...
  Intro Session (first time only) £10
  1 Session £25
  5 Sessions £110
  10 Sessions £190

  Red Light Therapy from £55
  1 x Session £55
  5 x Sessions £220
  ...

You must:
- Create a separate package for each **session + price** line.
  Example titles:
  - "Compression Therapy – Intro Session (20 min)"
  - "Compression Therapy – 5 Sessions"
  - "Red Light Therapy – 10 Sessions"
  - "Hyperbaric Oxygen Therapy – 60 Minute 5 Sessions"
- Put exact prices into \`price\`.
- Put durations like "20 mins", "60 mins" into \`duration\` when clear.
- If duration is ambiguous, still emit the package, but lower \`_meta.confidence_score\` and add a warning.


OUTPUT FORMAT (STRICT)
----------------------
Return **only** a single JSON object with this exact shape (no markdown, no comments):

{
  "packages": [ { ... }, ... ]
}

Each package object MUST include ALL of the following keys:

- title: string
- description: string
- details: string
- hospital_name: string
- treatment_name: string
- sub_treatments: string
- price: number | null
- original_price: number | null
- currency: "USD" | "THB" | "EUR" | "GBP" | "SGD" | "MYR" | "KRW" | "CNY"
- duration: string
- treatment_category: string
- anaesthesia: string
- commission: number | null
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

DEFAULTS WHEN UNKNOWN
---------------------
If any value is unknown or not present in the OCR text:
- Use "" for strings.
- Use null for numeric fields (price, original_price, commission).
- Use false for booleans (featured, is_le_package) unless clearly true.
- Use "active" for status if unclear.
- _meta.source_file = the file name for that page.
- _meta.source_page = the page number.
- _meta.confidence_score between 0.0 and 1.0 (your best guess).

LANGUAGE & TRANSLATION
----------------------
- If the package text is already in ENGLISH:
  - Keep title/description/details in English.
  - translation_title / translation_description / translation_details = "".
  - translation = "" or "EN".
- If the package text is NOT English (e.g. Chinese, Thai):
  - Keep the original language in title/description/details.
  - Provide ENGLISH translations:
    - translation_title: title → ENGLISH
    - translation_description: description → ENGLISH
    - translation_details: details → ENGLISH
    - translation = short language code, e.g. "ZH", "TH->ZH".
- If the text is unreadable:
  - leave translation_* = ""
  - add a warning like "OCR text unreadable for this package".

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
- If no canonical name fits, use the closest treatment_name match.

FIELD MAPPING HINTS
-------------------
- Each distinct line or block with a price (e.g. "Hydration Drip £100") is its own package.
- Use the local price symbol or context to infer currency, e.g.:
    - "£" → GBP
    - "RM" → MYR
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

Remember: **Do not output anything except the JSON object**.

OCR TEXT (THIS FILE ONLY, BY PAGE)
----------------------------------
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

  // Strip common markdown fences like ```json ... ```
  cleaned = cleaned
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  // If it already looks like JSON (starts with { or [ and ends with } or ])
  // just return it as-is.
  if (/^[\[{]/.test(cleaned) && /[\]}]$/.test(cleaned)) {
    return cleaned;
  }

  // Fallback: grab from first '{' or '[' to last '}' or ']'
  const firstCurly = cleaned.indexOf("{");
  const lastCurly = cleaned.lastIndexOf("}");
  const firstSquare = cleaned.indexOf("[");
  const lastSquare = cleaned.lastIndexOf("]");

  const starts = [firstCurly, firstSquare].filter((i) => i !== -1);
  const ends = [lastCurly, lastSquare].filter((i) => i !== -1);

  if (!starts.length || !ends.length) {
    // Nothing better to do – return as-is and let JSON.parse throw for logging
    return cleaned;
  }

  const start = Math.min(...starts);
  const end = Math.max(...ends);

  return cleaned.slice(start, end + 1).trim();
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
