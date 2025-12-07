// src/lib/validation.ts
// Shared validation + fuzzy matching for Clinic Menu OCR → CSV

import type { PackageRow, RowValidation, ValidationError } from "@/lib/types/ocr";

/* -------------------------------------------------------------------------- */
/*  Curated reference data (hospital & treatment names)                       */
/* -------------------------------------------------------------------------- */

const HOSPITAL_NAMES = [
  "Bumrungrad Intl",
  "Mery Plastic Surgery",
  "Pruksa Clinic",
  "SLC hospital",
  "Panacee Medical Center",
  "The Square Clinic",
  "Vethjani Hospital",
  "Phuket Plastic Surgery Institute",
  "Wansiri Hospital",
  "Prince Court",
  "Raffles Medical",
  "Sunway Medical Center",
  "Thomson Hospital",
  "China Medical University Hospital - 中國醫藥大學附設醫院",
];

const TREATMENT_NAMES = [
  "Health Checkup",
  "Cancer Screening",
  "MRI Scan",
  "CT Scan",
  "PET-CT Scan",
  "Blood Test",
  "Cardiac Screening",
  "Hip & Knee Replacement",
  "Spinal Surgery",
  "Brain Tumor Surgery",
  "Heart Valve Repair",
  "Kidney Transplant",
  "Liver Transplant",
  "LASIK Surgery",
  "Cataract Surgery",
  "Glaucoma Surgery",
  "Gastric Sleeve",
  "Gastric Bypass",
  "Endoscopic Sleeve Gastroplasty",
  "Gender-Affirming Surgery",
  "Pacemaker Implantation",
  "Prostate Surgery",
  "Vasectomy Reversal",
  "Hysterectomy",
  "Fibroid Removal",
  "Corneal Transplant",
  "Deep Brain Stimulation (DBS)",
  "Epilepsy Surgery",
  "Spinal Cord Surgery",
  "Facial Plastic Surgery",
  "Breast Augmentation",
  "Rhinoplasty",
  "Liposuction",
  "Botox Treatment",
  "Dermal Fillers",
  "Hair Transplant",
  "Laser Resurfacing",
  "Buccal Fat Removal",
  "Chin Augmentation",
  "Teeth Whitening",
  "Veneer",
  "Dental Implants",
  "Root Canal",
  "IVF (In Vitro Fertilization)",
  "IUI (Intrauterine Insemination)",
  "Egg Freezing",
  "HRT (Hormone Replacement Therapy)",
  "Chemotherapy",
  "Radiation Therapy",
  "Immunotherapy",
  "Proton Therapy",
  "Detox Retreats",
  "IV Therapy",
  "Anti-Aging Therapy",
  "Physiotherapy",
  "Acupuncture",
  "Ayurveda",
  "Thai Massage",
];

const MIN_HOSPITAL_SCORE = 0.72;
const MIN_TREATMENT_SCORE = 0.7;

export const matchingReferenceData = {
  hospitals: HOSPITAL_NAMES,
  treatments: TREATMENT_NAMES,
};

/* -------------------------------------------------------------------------- */
/*  Fuzzy matching helpers (Levenshtein-based)                                */
/* -------------------------------------------------------------------------- */

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] =
          Math.min(matrix[i - 1][j], matrix[i][j - 1], matrix[i - 1][j - 1]) + 1;
      }
    }
  }

  return matrix[a.length][b.length];
}

function similarityScore(source: string, candidate: string): number {
  if (!source || !candidate) return 0;
  const normalizedSource = normalize(source);
  const normalizedCandidate = normalize(candidate);
  if (!normalizedSource.length || !normalizedCandidate.length) return 0;
  const distance = levenshtein(normalizedSource, normalizedCandidate);
  const longest = Math.max(normalizedSource.length, normalizedCandidate.length);
  return 1 - distance / longest;
}

/**
 * Fuzzy match a raw hospital name against the curated list.
 */
export function matchHospitalName(raw: string): { value: string | null; score: number } {
  if (!raw?.trim()) {
    return { value: null, score: 0 };
  }

  let bestMatch: { value: string | null; score: number } = { value: null, score: 0 };

  for (const hospital of HOSPITAL_NAMES) {
    const score = similarityScore(raw, hospital);
    if (score > bestMatch.score) {
      bestMatch = { value: hospital, score };
    }
  }

  if (bestMatch.score < MIN_HOSPITAL_SCORE) {
    return { value: null, score: bestMatch.score };
  }

  return bestMatch;
}

/**
 * Fuzzy match a raw treatment name against the curated list.
 */
export function matchTreatmentName(raw: string): { value: string | null; score: number } {
  if (!raw?.trim()) {
    return { value: null, score: 0 };
  }

  let bestMatch: { value: string | null; score: number } = { value: null, score: 0 };

  for (const treatment of TREATMENT_NAMES) {
    const score = similarityScore(raw, treatment);
    if (score > bestMatch.score) {
      bestMatch = { value: treatment, score };
    }
  }

  if (bestMatch.score < MIN_TREATMENT_SCORE) {
    return { value: null, score: bestMatch.score };
  }

  return bestMatch;
}

/* -------------------------------------------------------------------------- */
/*  Client-side row validation (for the table UI)                             */
/* -------------------------------------------------------------------------- */

const REQUIRED_FIELDS: (keyof PackageRow)[] = [
  "title",
  "hospital_name",
  "treatment_name",
  "price",
  "currency",
];

export function validateRow(row: PackageRow): RowValidation {
  const errors: ValidationError[] = [];

  // Required: title
  if (!row.title?.trim()) {
    errors.push({ field: "title", message: "Title is required" });
  }

  // Required: hospital_name
  if (!row.hospital_name?.trim()) {
    errors.push({ field: "hospital_name", message: "Hospital name is required" });
  }

  // Required: treatment_name
  if (!row.treatment_name?.trim()) {
    errors.push({ field: "treatment_name", message: "Treatment name is required" });
  }

  // Required: price
  if (row.price === null || row.price === undefined) {
    errors.push({ field: "price", message: "Price is required" });
  } else if (isNaN(Number(row.price)) || Number(row.price) < 0) {
    errors.push({
      field: "price",
      message: "Price must be a valid positive number",
    });
  }

  // Required: currency
  if (!row.currency?.trim()) {
    errors.push({ field: "currency", message: "Currency is required" });
  }

  // Optional: commission 0–100
  if (row.commission !== null && row.commission !== undefined) {
    const num = Number(row.commission);
    if (isNaN(num) || num < 0 || num > 100) {
      errors.push({
        field: "commission",
        message: "Commission must be between 0 and 100",
      });
    }
  }

  // Optional: original_price >= 0
  if (row.original_price !== null && row.original_price !== undefined) {
    const num = Number(row.original_price);
    if (isNaN(num) || num < 0) {
      errors.push({
        field: "original_price",
        message: "Original price must be a valid positive number",
      });
    }
  }

  return {
    rowId: row.id || "",
    isValid: errors.length === 0,
    errors,
  };
}

export function validateAllRows(rows: PackageRow[]): {
  validations: Map<string, RowValidation>;
  summary: { valid: number; invalid: number; withWarnings: number };
} {
  const validations = new Map<string, RowValidation>();
  let valid = 0;
  let invalid = 0;
  let withWarnings = 0;

  rows.forEach((row, index) => {
    // Generate a stable row key even if backend did not send an id
    const rowId = row.id ?? `row_${index}`;

    // Run validation on the row; RowValidation.rowId will be overwritten below
    const baseValidation = validateRow(row);

    const validation: RowValidation = {
      ...baseValidation,
      rowId,
    };

    validations.set(rowId, validation);

    if (validation.isValid) {
      valid++;
    } else {
      invalid++;
    }

    if (row._meta?.warnings && row._meta.warnings.length > 0) {
      withWarnings++;
    }
  });

  return {
    validations,
    summary: { valid, invalid, withWarnings },
  };
}
export function getFieldError(
  validations: Map<string, RowValidation>,
  rowId: string,
  field: string,
): string | undefined {
  const rowValidation = validations.get(rowId);
  if (!rowValidation) return undefined;
  const error = rowValidation.errors.find((e) => e.field === field);
  return error?.message;
}

export function isFieldInvalid(
  validations: Map<string, RowValidation>,
  rowId: string,
  field: string,
): boolean {
  return !!getFieldError(validations, rowId, field);
}
