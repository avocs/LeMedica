import { promises as fs } from "fs";
import { mkdirSync } from "fs";
import { NextRequest } from "next/server";
import { join } from "path";
import { randomUUID } from "crypto";
import Tesseract from "tesseract.js";
import pdfParse from "pdf-parse";
import { OcrPage } from "../types/packages";

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
  const formData = await req.formData();
  const incomingFiles = extractFilesFromFormData(formData);

  if (!incomingFiles.length) {
    throw createHttpError(400, "No file provided. Please append `file` to FormData.");
  }

  const savedFiles: SavedFile[] = [];

  for (const file of incomingFiles) {
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      throw createHttpError(400, "Unsupported file type. Please upload PDF, JPG, PNG, or HEIC.");
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw createHttpError(
        413,
        `File exceeds the maximum allowed size of ${Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024))} MB.`
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

  return {
    batchId: randomUUID(),
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
 * Runs Tesseract OCR on each page of the uploaded files and returns
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

    const text = await runTesseract(await fs.readFile(file.path));
    pages.push({
      fileId: file.fileId,
      fileName: file.fileName,
      pageNumber: 1,
      rawText: cleanText(text),
    });
  }

  return pages;
}

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

  if (!pageTexts.length && parsed.text) {
    parsed.text
      .split(/\n{2,}/)
      .map((chunk) => cleanText(chunk))
      .filter(Boolean)
      .forEach((chunk) => pageTexts.push(chunk));
  }

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

async function runTesseract(buffer: Buffer): Promise<string> {
  const result = await Tesseract.recognize(buffer, "eng", {
    tessjs_create_pdf: "0",
  });
  return result.data.text || "";
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").replace(/[^\x20-\x7E]+/g, " ").trim();
}

function ensureTempDirectory() {
  mkdirSync(TEMP_DIR, { recursive: true });
}

function extractFilesFromFormData(formData: FormData): File[] {
  const files: File[] = [];
  const primary = formData.get("file");
  if (primary instanceof File) {
    files.push(primary);
  }
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

