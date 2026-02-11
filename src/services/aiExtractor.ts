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

    let phase0Texts: string[] = [];

    for (const page of orderedPages) {
      const phase0Prompt = buildSemanticCleanupPrompt([page]);

      logPromptStats(
        fileId,
        phase0Prompt,
        `PHASE0_P${page.pageNumber}`
      );

      const pageResponse = await callBedrockForExtraction(phase0Prompt, {
        maxTokens: 1000, // per-page, safe
        temperature: 0.1,
      });

      // Hard guard: Nova is allowed to return empty
      if (!pageResponse || !pageResponse.trim()) {
        console.warn(
          `[PHASE0] Empty output for page ${page.pageNumber}, falling back to raw OCR`
        );
        phase0Texts.push(
          `--- PAGE ${page.pageNumber} ---\n${page.rawText}`
        );
        continue;
      }

      writeDebug(
        jobDir,
        `${filePrefix}_phase0_page${page.pageNumber}.txt`,
        pageResponse
      );

      phase0Texts.push(
        `--- PAGE ${page.pageNumber} ---\n${pageResponse}`
      );
    }

    const phase0Response = phase0Texts.join("\n\n");

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

    // to make sure im not tripping
    // console.log("PHASE 1 Prompt length chars:", phase1Prompt.length);
    // console.log("Preview:", phase1Prompt.slice(0, 500));

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
        maxTokens: 3000,
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
      (p) => `--- PAGE ${p.pageNumber} ---\n${p.rawText}`
    )
    .join("\n");

  return `
TASK
====
Rewrite the OCR text so that EACH price appears on its own line with nearby words.

YOU MUST
========
- Preserve ALL items and prices exactly.
- Preserve original language(s).
- Restore line breaks and grouping where possible.
- Keep every priced item on its own line.
- If structure is unclear, still output text verbatim with line breaks.

RULES
=====
- Do NOT summarize.
- Do NOT remove words.
- Do NOT invent text.
- ONLY insert line breaks.
- Group nearby words with their closest price.
- If unsure, keep text but still add line breaks.

OUTPUT RULE
===========
- Return ONLY plain text.
- Returning empty output is NOT allowed.
- If cleanup is not possible, return the OCR text verbatim.

OCR INPUT
=========
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
TASK
====
Extract structured package data from menu text.

HARD REQUIREMENTS
=================
- You MUST return a single valid JSON object.
- The FIRST character of the response MUST be '{'.
- The LAST character of the response MUST be '}'.
- Do NOT include markdown, code fences, or explanations.

PACKAGE RULES
=============
- EACH distinct price/range = ONE package.
- Price anchors include: RM, $, £, €, ฿, numbers with currency.
- If N prices exist, you MUST output at least N packages.
- Returning an empty packages array is NOT allowed if any prices exist.
- If unsure, still emit a package with low confidence.

FAILSAFE
========
- If package boundaries are unclear:
  - Emit one package per price.
  - Title may be "Package – <price>".
  - confidence_score must be < 0.6.

DATA RULES
==========
- Do NOT normalize names.
- Do NOT translate.
- Keep text close to source.
- Prefer emitting uncertain packages over dropping them.

OUTPUT FORMAT (STRICT)
======================
{
  "packages": [
    {
      "title": "",
      "description": "",
      "details": "",
      "price": null,
      "currency": "",
      "duration": "",
      "_meta": {
        "source_page": 0,
        "confidence_score": 0.0,
        "warnings": []
      }
    }
  ]
}

MENU TEXT
=========
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
TASK
====
Normalize RAW packages into FINAL schema.

HARD REQUIREMENTS
=================
- Return ONLY a single valid JSON object.
- First character MUST be '{', last MUST be '}'.
- Do NOT include markdown or explanations.

NORMALIZATION RULES
===================
- Apply canonical treatment names EXACTLY when applicable.
- Translate non-English content to English.
- Preserve original meaning.
- Do NOT drop packages.

${getCanonicalTreatmentBlock()}

OUTPUT FORMAT
=============
{
  "packages": [ { FULL PACKAGE ROW } ]
}

RAW PACKAGES
============
${JSON.stringify(rawPackages, null, 2)}

OCR CONTEXT
===========
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
