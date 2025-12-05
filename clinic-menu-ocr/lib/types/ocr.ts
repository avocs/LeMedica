/**
 * Types for Clinic Menu OCR → CSV Admin Tool
 *
 * These types align with the backend API contracts for:
 * - POST /api/ocr-menus
 * - POST /api/ocr-menus/regenerate-csv
 * - POST /api/admin/bulk-import-packages
 */

export type PackageRow = {
  id?: string // Local UI identifier for React keys
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

  // Translation-related fields
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
      hospitalScore?: number
      treatmentScore?: number
    }
    [key: string]: unknown
  }
}

export type FileInfo = {
  file_id: string
  original_name: string
  page_count?: number
}

export type OcrMenusResponse = {
  success: boolean
  batch_id: string
  files: FileInfo[]
  packages: PackageRow[]
  summary: {
    total: number
    valid: number
    withWarnings: number
    invalid: number
  }
}

export type UploadedFile = {
  id: string
  file: File
  name: string
  size: number
  type: string
  status: "pending" | "processing" | "processed" | "error"
  pageCount?: number
  error?: string
}

export type RegenerateCsvPayload = {
  batch_id: string
  packages: PackageRow[]
  forwardToImporter?: boolean
  confirmAutoCreate?: boolean
  clearExisting?: boolean
}

export type ValidationError = {
  field: string
  message: string
}

export type RowValidation = {
  rowId: string
  isValid: boolean
  errors: ValidationError[]
}

// CSV Column order as specified
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
] as const

export const CURRENCY_OPTIONS = ["USD", "THB", "EUR", "GBP", "SGD", "MYR", "KRW"] as const

export const ACCEPTED_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/heic"]

export const ACCEPTED_FILE_EXTENSIONS = ".pdf,.jpg,.jpeg,.png,.heic"
