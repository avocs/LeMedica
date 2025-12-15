// src/services/ocrProcessor.ts
import { promises as fs } from "fs";
import { mkdirSync } from "fs";
import { NextRequest } from "next/server";
import { join, resolve } from "path";
import { randomUUID } from "crypto";
import pdfParse from "pdf-parse";
import { createWorker, PSM } from "tesseract.js";
import sharp from "sharp";
import type { OcrPage } from "@/lib/types/ocr";

const OCR_DEBUG_DIR = join(process.cwd(), "data", "tmp", "ocr-debug");
const OCR_DEBUG_ENABLED = process.env.OCR_DEBUG === "1";

const MAX_FILE_SIZE_BYTES =
  Number(process.env.OCR_MAX_FILE_MB || 50) * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
]);

const OCR_LANGS = "eng+chi_sim";
const OCR_TIMEOUT_MS = Number(process.env.OCR_TIMEOUT_MS || 150000);

// Tesseract tuning: try 6 for block text; 11 helps sparse menus.
// You can override with env later if you want.
// const TESS_PSM = String(process.env.OCR_TESS_PSM || "6");
const TESS_OEM = String(process.env.OCR_TESS_OEM || "1"); // 1 = LSTM only

function resolveTessPSM(): PSM {
  const raw = process.env.OCR_TESS_PSM;

  switch (raw) {
    case "0": return PSM.OSD_ONLY;
    case "1": return PSM.AUTO_OSD;
    case "3": return PSM.AUTO;
    case "4": return PSM.SINGLE_COLUMN;
    case "6": return PSM.SINGLE_BLOCK;        // ✅ best for menus
    case "11": return PSM.SPARSE_TEXT;         // ✅ good fallback
    default:  return PSM.SINGLE_BLOCK;
  }
}



type SavedFile = {
  fileId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
};

export async function handleUploadAndExtractOcr(req: NextRequest): Promise<{
  batchId: string;
  ocrPages: OcrPage[];
  filesMeta: { file_id: string; original_name: string; page_count?: number }[];
}> {
  const batchId = generateFriendlyBatchId();

  const formData = await req.formData();
  const incomingFiles = extractFilesFromFormData(formData);

  if (!incomingFiles.length) {
    throw createHttpError(
      400,
      "No file provided. Please append `file` or `files[]` to FormData."
    );
  }

  const savedFiles: SavedFile[] = [];
  for (const f of incomingFiles) {
    validateIncomingFile(f);

    const fileId = randomUUID();
    const baseName = (f.name || `upload-${fileId}`).split(/[\\/]/).pop() || `upload-${fileId}`;
    const buffer = Buffer.from(await f.arrayBuffer());

    savedFiles.push({
      fileId,
      fileName: baseName,
      mimeType: f.type,
      buffer,
    });
  }

  const ocrPages = await runOcrOnFiles(savedFiles);
  const filesMeta = summarizeFiles(savedFiles, ocrPages);

  if (OCR_DEBUG_ENABLED) {
    await saveOcrDebugSnapshot(batchId, ocrPages);
  }

  return { batchId, ocrPages, filesMeta };
}

export async function runOcrOnFiles(files: SavedFile[]): Promise<OcrPage[]> {
  const pages: OcrPage[] = [];

  for (const file of files) {
    if (file.mimeType === "application/pdf") {
      const pdfPages = await runOcrOnPdfSmart(file);
      pages.push(...pdfPages);
      continue;
    }

    // Images (jpeg/png/heic/heif): preprocess → tesseract
    const pre = await preprocessImageForOcr(file.buffer);
    const text = await runTesseract(pre);
    pages.push({
      fileId: file.fileId,
      fileName: file.fileName,
      pageNumber: 1,
      rawText: cleanText(text),
    });
  }

  return pages;
}

/**
 * PDF handling strategy:
 * 1) Try extracting selectable text via pdf-parse (fast and accurate for "raw PDFs")
 * 2) If empty/weak, fallback to OCR the PDF buffer as a single block.
 *
 * NOTE: Page-perfect OCR for scanned PDFs requires rendering pages to images
 * (pdfjs/poppler) which adds extra dependencies. This keeps it simple.
 */
async function runOcrOnPdfSmart(file: SavedFile): Promise<OcrPage[]> {
  const buffer = file.buffer;
  const pageTexts: string[] = [];

  const options = {
    pagerender: async (pageData: any) => {
      const textContent = await pageData.getTextContent();
      const textItems = textContent.items
        .map((item: { str?: string }) => item?.str ?? "")
        .join(" ");
      const cleaned = cleanText(textItems);
      pageTexts.push(cleaned);
      return cleaned;
    },
  };

  let parsedText = "";
  try {
    const parsed = await pdfParse(buffer, options as any);
    parsedText = cleanText(parsed?.text || "");
  } catch (e) {
    // If pdf-parse fails, we still try OCR fallback below.
    parsedText = "";
  }

  const usableText = parsedText && parsedText.replace(/\s+/g, "").length > 50;

  if (usableText) {
    // pdf-parse already filled pageTexts via pagerender; fallback to parsedText chunking if needed
    if (!pageTexts.length) {
      pageTexts.push(parsedText);
    }
    return pageTexts.map((rawText, i) => ({
      fileId: file.fileId,
      fileName: file.fileName,
      pageNumber: i + 1,
      rawText,
    }));
  }

  // Fallback: scanned / image PDF → OCR whole PDF buffer (single "page")
  // (Tesseract can sometimes handle PDF input; if it fails, you'll see it in logs.)
  const text = await runTesseract(buffer);
  return [
    {
      fileId: file.fileId,
      fileName: file.fileName,
      pageNumber: 1,
      rawText: cleanText(text),
    },
  ];
}

/**
 * Preprocess image buffers for OCR:
 * - Convert to PNG (stable)
 * - Grayscale
 * - Normalize contrast
 * - Light sharpening
 * - Optional upscale to improve tiny text
 * - Threshold to reduce noise
 */
async function preprocessImageForOcr(input: Buffer): Promise<Buffer> {
  try {
    const img = sharp(input, { failOn: "none" }).rotate(); // auto-orient

    // Inspect size; upscale small captures
    const meta = await img.metadata();
    const width = meta.width ?? 0;

    const targetWidth =
      width && width < 1400 ? Math.min(2200, Math.round(width * 2)) : undefined;

    const out = await img
      .resize(targetWidth ? { width: targetWidth, withoutEnlargement: false } : undefined)
      .grayscale()
      .normalise()
      .sharpen()
      .threshold(180)
      .png()
      .toBuffer();

    return out;
  } catch {
    // If preprocessing fails, fall back to original buffer
    return input;
  }
}

async function runTesseract(buffer: Buffer): Promise<string> {
  const worker = await createWorker(OCR_LANGS, 1, {
    workerPath: "./node_modules/tesseract.js/src/worker-script/node/index.js",
  });

  try {
    await worker.setParameters({
      tessedit_pageseg_mode: resolveTessPSM(),
      tessedit_ocr_engine_mode: TESS_OEM,
      preserve_interword_spaces: "1",
    });

    const recognizePromise = worker.recognize(buffer);

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () =>
          reject(
            new Error(
              `Tesseract OCR timed out after ${OCR_TIMEOUT_MS} ms (languages: ${OCR_LANGS})`
            )
          ),
        OCR_TIMEOUT_MS
      );
    });

    const result: any = await Promise.race([recognizePromise, timeoutPromise]);
    return result?.data?.text || "";
  } finally {
    try {
      await worker.terminate();
    } catch {
      // ignore
    }
  }
}

async function saveOcrDebugSnapshot(batchId: string, pages: OcrPage[]) {
  try {
    mkdirSync(OCR_DEBUG_DIR, { recursive: true });

    // Write per-page files only (simpler and usually enough)
    for (const page of pages) {
      const safeFile = page.fileName.replace(/[^\w.-]+/g, "_");
      const debugName = `${batchId}_p${page.pageNumber}_${safeFile}.txt`;
      const debugPath = join(OCR_DEBUG_DIR, debugName);

      const content =
        `BATCH: ${batchId}\n` +
        `FILE:  ${page.fileName}\n` +
        `PAGE:  ${page.pageNumber}\n` +
        `----------------------------------------\n` +
        page.rawText;

      await fs.writeFile(debugPath, content, "utf8");
    }

    console.log(`[OCR DEBUG] Saved text snapshots for batch ${batchId} → ${OCR_DEBUG_DIR}`);
  } catch (err) {
    console.error("[OCR DEBUG] Failed to save snapshot:", err);
  }
}

function validateIncomingFile(file: File) {
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw createHttpError(400, "Unsupported file type. Upload PDF, JPG, PNG, or HEIC.");
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw createHttpError(
      413,
      `File exceeds max size of ${Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024))} MB.`
    );
  }
}

function extractFilesFromFormData(formData: FormData): File[] {
  const files: File[] = [];

  for (const entry of formData.getAll("file")) if (entry instanceof File) files.push(entry);
  for (const entry of formData.getAll("files")) if (entry instanceof File) files.push(entry);
  for (const entry of formData.getAll("files[]")) if (entry instanceof File) files.push(entry);

  return files;
}

function summarizeFiles(files: SavedFile[], pages: OcrPage[]) {
  return files.map((file) => ({
    file_id: file.fileId,
    original_name: file.fileName,
    page_count: pages.filter((p) => p.fileId === file.fileId).length,
  }));
}

function cleanText(text: string): string {
  return (text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function createHttpError(status: number, message: string) {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
}

function generateFriendlyBatchId(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");

  const y = now.getFullYear();
  const m = pad(now.getMonth() + 1);
  const d = pad(now.getDate());
  const hh = pad(now.getHours());
  const mm = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  const rand = Math.random().toString(36).slice(2, 6);

  return `b_${y}${m}${d}_${hh}${mm}${ss}_${rand}`;
}
