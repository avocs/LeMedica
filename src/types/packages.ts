/**
 * Represents the OCR text extracted from a single page of a source file.
 * Used as the raw input passed into the AI extraction pipeline.
 */
export type OcrPage = {
  /** Internal unique identifier generated for the uploaded file */
  fileId: string;
  /** Human-friendly filename captured during upload */
  fileName: string;
  /** 1-based page index to preserve ordering */
  pageNumber: number;
  /** Plain text captured by the OCR engine for this specific page */
  rawText: string;
};

/**
 * Canonical representation of a clinic package row, matching the bulk CSV spec.
 * Each PackageRow is later serialized into a single CSV row for ingestion.
 */
export type PackageRow = {
  title: string;
  description?: string;
  details?: string;
  hospital_name: string;
  treatment_name: string;
  sub_treatments?: string;
  price: number | null;
  original_price?: number | null;
  currency: string;
  duration?: string;
  treatment_category?: string;
  anaesthesia?: string;
  commission?: number | null;
  featured: boolean;
  status: "active" | "inactive";
  doctor_name?: string;
  is_le_package: boolean;
  includes?: string;
  image_file_id?: string | null;
  hospital_location?: string;
  category?: string;
  hospital_country?: string;
  translation_title?: string;
  translation_description?: string;
  translation_details?: string;
  translation?: string;
  _meta?: {
    source_file?: string;
    source_page?: number;
    confidence_score?: number;
    warnings?: string[];
    matcher?: {
      hospitalScore?: number | null;
      treatmentScore?: number | null;
    };
  };
};

