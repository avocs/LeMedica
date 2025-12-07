// src/lib/types/ocr.ts

/**
 * Represents the OCR text extracted from a single page of a source file.
 * Used as the raw input passed into the AI extraction pipeline.
 */
export type OcrPage = {
  /** Internal unique identifier generated for the uploaded file */
  fileId: string
  /** Human-friendly filename captured during upload */
  fileName: string
  /** 1-based page index to preserve ordering */
  pageNumber: number
  /** Plain text captured by the OCR engine for this specific page */
  rawText: string
}

/**
 * Canonical representation of a clinic package row, matching the bulk CSV spec.
 * Each PackageRow is later serialized into a single CSV row for ingestion.
 *
 * NOTE: `id` is a synthetic, frontend-only key used for table rendering.
 */
export type PackageRow = {
  /** Synthetic row id used only in the frontend table */
  id?: string

  title: string
  description?: string
  details?: string
  hospital_name: string
  treatment_name: string
  sub_treatments?: string
  price: number | null
  original_price?: number | null
  currency: string
  duration?: string
  treatment_category?: string
  anaesthesia?: string
  commission?: number | null
  featured: boolean
  status: "active" | "inactive"
  doctor_name?: string
  is_le_package: boolean
  includes?: string
  image_file_id?: string | null
  hospital_location?: string
  category?: string
  hospital_country?: string
  translation_title?: string
  translation_description?: string
  translation_details?: string
  translation?: string
  _meta?: {
    source_file?: string
    source_page?: number
    confidence_score?: number
    warnings?: string[]
    matcher?: {
      hospitalScore?: number | null
      treatmentScore?: number | null
    }
    // backend may add more fields; UI should ignore unknown keys
  }
}

/**
 * File info as returned by /api/ocr-menus under `files`.
 */
export type FileInfo = {
  file_id: string
  original_name: string
  page_count?: number
}

/**
 * Summary block returned by the backend /api/ocr-menus.
 */
export type OcrSummary = {
  total: number
  valid: number
  withWarnings: number
  invalid: number
}

/**
 * Main response shape for /api/ocr-menus.
 */
export type OcrMenusResponse = {
  success: boolean
  batch_id: string
  files: FileInfo[]
  packages: PackageRow[]
  summary: OcrSummary
}

/* -------------------------------------------------------------------------- */
/*  Frontend-only types for UI & validation                                   */
/* -------------------------------------------------------------------------- */

export type UploadedFileStatus = "pending" | "processing" | "processed" | "error"

export type UploadedFile = {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  status: UploadedFileStatus;
  pageCount?: number;
};

/**
 * Validation error for a single field in a PackageRow.
 */
export type ValidationError = {
  field: string
  message: string
}

/**
 * Result of validating a single PackageRow on the client.
 */
export type RowValidation = {
  rowId: string
  isValid: boolean
  errors: ValidationError[]
}


export const CSV_COLUMNS = [
  "title",
  "description",
  "details",
  "hospital_name",
  "treatment_name",
  "Sub Treatments",
  "price",
  "original_price",
  "currency",
  "duration",
  "treatment_category",
  "anaesthesia",
  "commission",
  "featured",
  "status",
  "doctor_name",
  "is_le_package",
  "includes",
  "image_file_id",
  "hospital_location",
  "category",
  "hospital_country",
  "translation_title",
  "translation_description",
  "translation_details",
  "translation",
] as const;

/* -------------------------------------------------------------------------- */
/*  Constants used by UI components                                           */
/* -------------------------------------------------------------------------- */

// MIME types accepted by the upload panel
export const ACCEPTED_FILE_TYPES: string[] = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
];

// For <input accept="...">
export const ACCEPTED_FILE_EXTENSIONS =
  ".pdf,.jpg,.jpeg,.png,.heic,.heif";

// Currency options for dropdowns
export const CURRENCY_OPTIONS: string[] = [
  "USD",
  "THB",
  "EUR",
  "GBP",
  "SGD",
  "MYR",
  "KRW",
];
