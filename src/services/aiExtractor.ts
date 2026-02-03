// src/services/aiExtractorPhased.ts

import fs from "fs";
import path from "path";
import type { PackageRow, OcrPage } from "@/lib/types/ocr";
import { callBedrockForExtraction } from "./bedrockClient";
import { normalizePackageRow } from "./normalizer";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

type ExtractionOptions = {
  jobId?: string;
  logPrompts?: boolean;
  enablePhase2?: boolean; // canonical mapping (default: false for quota safety)
};

type RawPackage = {
  title: string;
  description: string;
  details: string;
  price: number | null;
  currency: string;
  duration: string;
  _meta: {
    source_page?: number;
    confidence_score: number;
    warnings: string[];
  };
};

/* ------------------------------------------------------------------ */
/* Constants                                                          */
/* ------------------------------------------------------------------ */

const DEBUG_ROOT = path.resolve("data/tmp/phased_ocr_debug");

/* ------------------------------------------------------------------ */
/* Public API (DROP-IN)                                               */
/* ------------------------------------------------------------------ */

export async function extractPackagesFromOcrText(
  ocrPages: OcrPage[],
  options: ExtractionOptions = {}
): Promise<PackageRow[]> {
  if (!ocrPages.length) return [];

  const jobId = options.jobId ?? `batch_${Date.now()}`;
  const enablePhase2 = options.enablePhase2 ?? false;

  const jobDir = path.join(DEBUG_ROOT, jobId);
  fs.mkdirSync(jobDir, { recursive: true });

  const pagesByFile = new Map<string, OcrPage[]>();
  for (const page of ocrPages) {
    if (!pagesByFile.has(page.fileId)) {
      pagesByFile.set(page.fileId, []);
    }
    pagesByFile.get(page.fileId)!.push(page);
  }

  const allPackages: PackageRow[] = [];

  for (const [fileId, pages] of pagesByFile.entries()) {
    const orderedPages = [...pages].sort(
      (a, b) => a.pageNumber - b.pageNumber
    );
    const fileName = orderedPages[0]?.fileName ?? "unknown-file";

    const filePrefix = `${fileId}_${sanitizeFileName(fileName)}`;

    /* ================================================================ */
    /* PHASE 0 — OCR → LEGIBLE TEXT                                     */
    /* ================================================================ */

    const phase0Prompt = buildSemanticCleanupPrompt(orderedPages);
    logPromptStats(fileId, phase0Prompt, "PHASE0");

    const phase0Response = await callBedrockForExtraction(phase0Prompt, {
      maxTokens: 2500,
      temperature: 0,
    });

    writeDebug(
      jobDir,
      `${filePrefix}_phase0_semantic.txt`,
      phase0Response
    );

    /* ================================================================ */
    /* PHASE 1 — LEGIBLE TEXT → RAW JSON                                */
    /* ================================================================ */

    const phase1Prompt = buildRawExtractionPrompt(
      phase0Response,
      orderedPages
    );
    logPromptStats(fileId, phase1Prompt, "PHASE1");

    const phase1Response = await callBedrockForExtraction(phase1Prompt, {
      maxTokens: 3000,
      temperature: 0.1,
    });

    writeDebug(
      jobDir,
      `${filePrefix}_phase1_raw.json`,
      phase1Response
    );

    const phase1Json = parseJsonStrict(
      phase1Response,
      "Phase 1 (raw extraction)"
    );

    const rawPackages: RawPackage[] = Array.isArray(phase1Json?.packages)
      ? phase1Json.packages
      : [];

    /* ================================================================ */
    /* PHASE 2 — CANONICAL MAPPING (OPTIONAL)                           */
    /* ================================================================ */

    let finalPackages: any[] = rawPackages;

    if (enablePhase2) {
      const phase2Prompt = buildCanonicalMappingPrompt(
        orderedPages,
        rawPackages
      );
      logPromptStats(fileId, phase2Prompt, "PHASE2");

      const phase2Response = await callBedrockForExtraction(phase2Prompt, {
        maxTokens: 4000,
        temperature: 0.1,
      });

      writeDebug(
        jobDir,
        `${filePrefix}_phase2_canonical.json`,
        phase2Response
      );

      const phase2Json = parseJsonStrict(
        phase2Response,
        "Phase 2 (canonical)"
      );

      finalPackages = Array.isArray(phase2Json?.packages)
        ? phase2Json.packages
        : [];
    }

    /* ================================================================ */
    /* NORMALIZATION                                                    */
    /* ================================================================ */

    const normalized = finalPackages.map((row, index) => {
      const normalizedRow = normalizePackageRow(row);

      return {
        ...normalizedRow,
        id:
          normalizedRow.id ??
          `pkg_${fileId}_${index}_${Date.now()}`,
        _meta: {
          ...(normalizedRow._meta || {}),
          source_file:
            normalizedRow._meta?.source_file || fileName,
          confidence_score:
            normalizedRow._meta?.confidence_score ?? 0.5,
        },
      } as PackageRow;
    });

    allPackages.push(...normalized);
  }

  return allPackages;
}

/* ------------------------------------------------------------------ */
/* PHASE 0 PROMPT                                                     */
/* ------------------------------------------------------------------ */

function buildSemanticCleanupPrompt(pages: OcrPage[]): string {
  const joined = pages
    .map(
      (p) =>
        `--- PAGE ${p.pageNumber} ---\n${p.rawText}`
    )
    .join("\n");

  return `
You are cleaning OCR output.

TASK
----
Rewrite the OCR text into clean, readable, human-legible menu text.

RULES
-----
- DO NOT summarize.
- DO NOT drop items.
- DO NOT invent content.
- Restore line breaks and grouping.
- Preserve original language(s).
- Keep prices exactly as written.
- If structure is unclear, separate items onto new lines.

OUTPUT
------
Return ONLY plain text. No JSON. No explanations.

OCR INPUT
---------
${joined}
`;
}

/* ------------------------------------------------------------------ */
/* PHASE 1 PROMPT                                                     */
/* ------------------------------------------------------------------ */

function buildRawExtractionPrompt(
  cleanedText: string,
  pages: OcrPage[]
): string {
  return `
You are extracting structured data from CLEAN menu text.

TASK
----
Convert the menu text into RAW package JSON.

RULES
-----
- EACH priced item = one package
- Do NOT normalize names
- Do NOT translate
- Do NOT infer hospitals or categories
- Keep text close to source
- Prefer emitting uncertain packages

OUTPUT FORMAT (STRICT JSON ONLY)
--------------------------------
{
  "packages": [
    {
      "title": string,
      "description": string,
      "details": string,
      "price": number | null,
      "currency": string,
      "duration": string,
      "_meta": {
        "source_page": number,
        "confidence_score": number,
        "warnings": string[]
      }
    }
  ]
}

MENU TEXT
---------
${cleanedText}
`;
}

/* ------------------------------------------------------------------ */
/* PHASE 2 PROMPT                                                     */
/* ------------------------------------------------------------------ */

function buildCanonicalMappingPrompt(
  pages: OcrPage[],
  rawPackages: RawPackage[]
): string {
  const fileName = pages[0]?.fileName ?? "unknown-file";

  return `
You are a data normalization worker.

TASK
----
Normalize RAW packages into FINAL schema.
Apply canonical treatment names EXACTLY.
Translate non-English content.
Preserve meaning.

${getCanonicalTreatmentBlock()}

OUTPUT FORMAT (STRICT JSON ONLY)
--------------------------------
{
  "packages": [ { FULL PACKAGE ROW } ]
}

RAW PACKAGES
------------
${JSON.stringify(rawPackages, null, 2)}

OCR CONTEXT
-----------
${pages
  .map(
    (p) =>
      `--- PAGE ${p.pageNumber} (${fileName}) ---\n${p.rawText}`
  )
  .join("\n")}
`;
}

/* ------------------------------------------------------------------ */
/* UTILITIES                                                          */
/* ------------------------------------------------------------------ */

function writeDebug(dir: string, name: string, content: string) {
  fs.writeFileSync(path.join(dir, name), content, "utf8");
}

function sanitizeFileName(name: string) {
  return name.replace(/[^\w.-]+/g, "_");
}

function parseJsonStrict(value: string, label: string): any {
  const cleaned = sanitizeModelResponse(value);
  try {
    return JSON.parse(cleaned || "{}");
  } catch {
    console.error(`[AI Extractor] ${label} invalid JSON`);
    console.error(cleaned.slice(0, 500));
    throw new Error(`${label} returned invalid JSON`);
  }
}

function sanitizeModelResponse(value: string): string {
  if (!value) return "";
  let cleaned = value.trim();
  cleaned = cleaned
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first !== -1 && last !== -1) {
    return cleaned.slice(first, last + 1);
  }
  return cleaned;
}

function logPromptStats(
  fileId: string,
  prompt: string,
  phase: string
) {
  console.log(
    `[Bedrock OCR][${phase}] ${fileId}: ${prompt.length} chars (~${Math.round(
      prompt.length / 4
    )} tokens)`
  );
}

function getCanonicalTreatmentBlock(): string {
  return `
CANONICAL TREATMENT NAMES
------------------------
Diagnostics:
- Health Checkup
- Cancer Screening
- MRI Scan
- CT Scan
- PET-CT Scan
- Blood Test
- Cardiac Screening

Surgery:
- Hip & Knee Replacement
- Spinal Surgery
- Brain Tumor Surgery
- Heart Valve Repair
- Kidney Transplant
- Liver Transplant
- LASIK Surgery
- Cataract Surgery
- Glaucoma Surgery
- Gastric Sleeve
- Gastric Bypass
- Endoscopic Sleeve Gastroplasty
- Gender-Affirming Surgery
- Pacemaker Implantation
- Prostate Surgery
- Vasectomy Reversal
- Hysterectomy
- Fibroid Removal
- Corneal Transplant
- Deep Brain Stimulation (DBS)
- Epilepsy Surgery
- Spinal Cord Surgery

Wellness:
- IV Therapy
- Anti-Aging Therapy
- Physiotherapy
`;
}
