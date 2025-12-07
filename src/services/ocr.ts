import { promises as fs } from "fs";
import { mkdirSync } from "fs";
import { NextRequest } from "next/server";
import { join } from "path";
import { randomUUID } from "crypto";
import Tesseract from "tesseract.js";
import pdfParse from "pdf-parse";
import type { OcrPage } from "@/lib/types/ocr";


const OCR_DEBUG_DIR = join(process.cwd(), "tmp", "ocr-debug");
// Toggle with an env var so prod isn’t spammed
const OCR_DEBUG_ENABLED = process.env.OCR_DEBUG === "1";


const TEMP_DIR = join(process.cwd(), "tmp", "ocr-uploads");
const MAX_FILE_SIZE_BYTES =
  Number(process.env.OCR_MAX_FILE_MB || 25) * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
]);

// -----------------------------------------------------------------------------
// OCR language + timeout config
// -----------------------------------------------------------------------------
// Languages for Tesseract OCR. Override via .env.local, e.g.
//   OCR_LANGS=eng+chi_sim
//   OCR_LANGS=eng+chi_sim+tha+ms
//
// IMPORTANT: More languages = heavier + slower. For Chinese-heavy menus, try:
//   OCR_LANGS=eng+chi_sim
//
const OCR_LANGS = process.env.OCR_LANGS || "eng+chi_sim+tha+ms+kor";

// Max time (ms) we are willing to wait for a single Tesseract.recognize() call.
// Prevents "Chinese JPEG runs forever" hangs.
const OCR_TIMEOUT_MS = Number(process.env.OCR_TIMEOUT_MS || 60000);

/**
 * handleUploadAndExtractOcr
 * -------------------------
 * Accepts uploaded files from a NextRequest, validates them, writes the content
 * to a temp folder, runs OCR per page, and returns a list of OcrPage objects.
 */
export async function handleUploadAndExtractOcr(req: NextRequest): Promise<{
  batchId: string;
  ocrPages: OcrPage[];
  filesMeta: {
    file_id: string;
    original_name: string;
    page_count?: number;
  }[];
}> {
  ensureTempDirectory();

  // 🔹 Generate the batch ID ONCE and reuse it everywhere
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

  for (const file of incomingFiles) {
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      throw createHttpError(
        400,
        "Unsupported file type. Please upload PDF, JPG, PNG, or HEIC."
      );
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw createHttpError(
        413,
        `File exceeds the maximum allowed size of ${Math.round(
          MAX_FILE_SIZE_BYTES / (1024 * 1024)
        )} MB.`
      );
    }

    const fileId = randomUUID();
    const fileName = file.name || `upload-${fileId}`;
    const tempPath = join(TEMP_DIR, `${fileId}-${fileName}`);
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(tempPath, buffer);

    savedFiles.push({
      fileId,
      fileName,
      mimeType: file.type,
      path: tempPath,
    });
  }

  const ocrPages = await runOcrOnFiles(savedFiles);
  const filesMeta = summarizeFiles(savedFiles, ocrPages);

  // 🔹 Only valid now because batchId is defined above
  if (OCR_DEBUG_ENABLED) {
    await saveOcrDebugSnapshot(batchId, ocrPages);
  }

  return {
    batchId,      // reuse the same batchId here
    ocrPages,
    filesMeta,
  };
}


type SavedFile = {
  fileId: string;
  fileName: string;
  mimeType: string;
  path: string;
};

/**
 * runOcrOnFiles
 * --------------
 * Runs OCR on each page of the uploaded files and returns
 * OcrPage objects that retain page ordering and metadata.
 */
export async function runOcrOnFiles(files: SavedFile[]): Promise<OcrPage[]> {
  const pages: OcrPage[] = [];

  for (const file of files) {
    if (file.mimeType === "application/pdf") {
      const pdfPages = await runOcrOnPdf(file);
      pages.push(...pdfPages);
      continue;
    }

    // Image file: use Tesseract directly with multi-language support
    const buffer = await fs.readFile(file.path);
    const text = await runTesseract(buffer);
    pages.push({
      fileId: file.fileId,
      fileName: file.fileName,
      pageNumber: 1,
      rawText: cleanText(text),
    });
  }

  return pages;
}

async function saveOcrDebugSnapshot(batchId: string, pages: OcrPage[]) {
  try {
    mkdirSync(OCR_DEBUG_DIR, { recursive: true });

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

    console.log(
      `[OCR DEBUG] Saved page-level text for batch ${batchId} to ${OCR_DEBUG_DIR}`
    );
  } catch (err) {
    console.error("[OCR DEBUG] Failed to save snapshot:", err);
  }
}


/**
 * runOcrOnPdf
 * -----------
 * Uses pdf-parse to extract text per page.
 * If pdf-parse returns nothing, we still emit one empty page entry.
 *
 * NOTE: This path is text-based; if you need image-based PDF OCR later,
 * you can add a Tesseract fallback here that rasterizes pages.
 */
async function runOcrOnPdf(file: SavedFile): Promise<OcrPage[]> {
  const buffer = await fs.readFile(file.path);
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

  const parsed = await pdfParse(buffer, options as any);

  // Fallback: if pagerender didn't push anything but parsed.text exists,
  // split by blank lines to approximate pages/sections.
  if (!pageTexts.length && parsed.text) {
    parsed.text
      .split(/\n{2,}/)
      .map((chunk) => cleanText(chunk))
      .filter(Boolean)
      .forEach((chunk) => pageTexts.push(chunk));
  }

  // Still nothing? Emit a single empty page so the AI has the context of
  // "file exists but OCR returned no text".
  if (!pageTexts.length) {
    pageTexts.push("");
  }

  return pageTexts.map((rawText, index) => ({
    fileId: file.fileId,
    fileName: file.fileName,
    pageNumber: index + 1,
    rawText,
  }));
}

/**
 * runTesseract
 * ------------
 * Runs Tesseract OCR on an image buffer using the languages configured
 * by OCR_LANGS (default: eng+chi_sim+tha+ms+kor).
 *
 * Make sure you have the corresponding .traineddata files installed
 * if you are using a native Tesseract installation. For tesseract.js,
 * it will download language data from the CDN on first use.
 *
 * A safety timeout (OCR_TIMEOUT_MS) is applied so a problematic image
 * doesn’t hang the entire request indefinitely.
 */
async function runTesseract(buffer: Buffer): Promise<string> {
  const recognizePromise = Tesseract.recognize(buffer, OCR_LANGS);

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(
      () =>
        reject(
          new Error(
            `Tesseract OCR timed out after ${OCR_TIMEOUT_MS} ms (languages: ${OCR_LANGS})`,
          ),
        ),
      OCR_TIMEOUT_MS,
    );
  });

  const result = await Promise.race([recognizePromise, timeoutPromise]);
  return result.data?.text || "";
}

/**
 * cleanText
 * ---------
 * Normalizes whitespace but preserves line breaks so that menu items
 * remain visually separated for the LLM.
 */
function cleanText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")      // normalise Windows line endings
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")     // collapse spaces/tabs
    .replace(/\n{2,}/g, "\n")    // collapse multiple blank lines
    .trim();
}

function ensureTempDirectory() {
  mkdirSync(TEMP_DIR, { recursive: true });
}

function extractFilesFromFormData(formData: FormData): File[] {
  const files: File[] = [];

  // Single file: "file"
  const primary = formData.get("file");
  if (primary instanceof File) {
    files.push(primary);
  }

  // Multiple files: "files[]"
  const multiples = formData.getAll("files[]");
  for (const entry of multiples) {
    if (entry instanceof File) {
      files.push(entry);
    }
  }

  return files;
}

function summarizeFiles(files: SavedFile[], pages: OcrPage[]) {
  return files.map((file) => ({
    file_id: file.fileId,
    original_name: file.fileName,
    page_count: pages.filter((page) => page.fileId === file.fileId).length,
  }));
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

  const rand = Math.random().toString(36).slice(2, 6); // 4-char slug

  return `b_${y}${m}${d}_${hh}${mm}${ss}_${rand}`;
}
