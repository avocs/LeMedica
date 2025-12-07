import type { PackageRow} from "@/lib/types/ocr";
import { matchHospitalName, matchTreatmentName } from "@/lib/validation";

const REQUIRED_FIELDS: Array<keyof PackageRow> = [
  "title",
  "hospital_name",
  "treatment_name",
  "price",
  "currency",
];

const ALLOWED_CURRENCIES = ["USD", "THB", "EUR", "GBP", "SGD", "MYR", "KRW"];

/**
 * normalizePackageRow
 * -------------------
 * Cleans and normalizes a partially filled PackageRow object.
 * - Trims string fields and normalizes currency codes
 * - Parses numeric fields (price, original_price, commission)
 * - Applies default booleans/status values
 * - Runs fuzzy matching helpers and captures warnings
 */
export function normalizePackageRow(row: Partial<PackageRow>): PackageRow {
  const warnings = [...(row._meta?.warnings ?? [])];
  const matcher = { ...(row._meta?.matcher ?? {}) };

  const sanitized: PackageRow = {
    title: normalizeString(row.title),
    description: normalizeOptional(row.description),
    details: normalizeOptional(row.details),
    hospital_name: normalizeString(row.hospital_name),
    treatment_name: normalizeString(row.treatment_name),
    sub_treatments: normalizeOptional(row.sub_treatments),
    price: parseNumber(row.price, "price", warnings),
    original_price: parseOptionalNumber(row.original_price, "original_price", warnings),
    currency: normalizeCurrency(row.currency, warnings),
    duration: normalizeOptional(row.duration),
    treatment_category: normalizeOptional(row.treatment_category),
    anaesthesia: normalizeOptional(row.anaesthesia),
    commission: parseOptionalNumber(row.commission, "commission", warnings),
    featured: normalizeBoolean(row.featured, false),
    status: normalizeStatus(row.status, warnings),
    doctor_name: normalizeOptional(row.doctor_name),
    is_le_package: normalizeBoolean(row.is_le_package, false),
    includes: normalizeOptional(row.includes),
    image_file_id: normalizeOptional(row.image_file_id),
    hospital_location: normalizeOptional(row.hospital_location),
    category: normalizeOptional(row.category),
    hospital_country: normalizeOptional(row.hospital_country),
    translation_title: normalizeOptional(row.translation_title),
    translation_description: normalizeOptional(row.translation_description),
    translation_details: normalizeOptional(row.translation_details),
    translation: normalizeOptional(row.translation),
    _meta: {
      ...row._meta,
      warnings,
      matcher,
    },
  };

  applyMatching("hospital", sanitized, matcher, warnings);
  applyMatching("treatment", sanitized, matcher, warnings);

  return sanitized;
}

/**
 * validatePackageBatch
 * --------------------
 * Splits a list of PackageRow objects into valid / warning / invalid buckets.
 */
export function validatePackageBatch(rows: PackageRow[]): {
  validPackages: PackageRow[];
  packagesWithWarnings: PackageRow[];
  invalidPackages: PackageRow[];
} {
  const validPackages: PackageRow[] = [];
  const packagesWithWarnings: PackageRow[] = [];
  const invalidPackages: PackageRow[] = [];

  for (const row of rows) {
    const missingRequired = REQUIRED_FIELDS.filter((field) => {
      if (field === "price") {
        return row.price === null || row.price === undefined;
      }
      return !row[field]?.toString().trim();
    });

    if (missingRequired.length) {
      row._meta = {
        ...row._meta,
        warnings: [
          ...(row._meta?.warnings ?? []),
          `Missing required fields: ${missingRequired.join(", ")}`,
        ],
      };
      invalidPackages.push(row);
      continue;
    }

    const hasWarnings = (row._meta?.warnings ?? []).length > 0;
    if (hasWarnings) {
      packagesWithWarnings.push(row);
    } else {
      validPackages.push(row);
    }
  }

  return { validPackages, packagesWithWarnings, invalidPackages };
}

function normalizeString(value: string | undefined): string {
  return (value ?? "").trim();
}

function normalizeOptional(value: string | null | undefined): string | undefined {
  const trimmed = (value ?? "").trim();
  return trimmed.length ? trimmed : undefined;
}

function parseNumber(value: any, field: string, warnings: string[]): number | null {
  if (value === null || value === undefined || value === "") {
    warnings.push(`${field} missing; set to null`);
    return null;
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    warnings.push(`${field} is not a number; set to null`);
    return null;
  }
  return parsed;
}

function parseOptionalNumber(
  value: any,
  field: string,
  warnings: string[]
): number | null | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    warnings.push(`${field} is not a number; set to null`);
    return null;
  }
  return parsed;
}

function normalizeCurrency(value: string | undefined, warnings: string[]): string {
  if (!value) {
    warnings.push("currency missing; defaulting to USD");
    return "USD";
  }
  const upper = value.trim().toUpperCase().replace("฿", "THB");
  if (!ALLOWED_CURRENCIES.includes(upper)) {
    warnings.push(`currency ${value} not supported; defaulting to USD`);
    return "USD";
  }
  return upper;
}

function normalizeBoolean(value: any, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    if (["true", "1", "yes"].includes(normalized)) return true;
    if (["false", "0", "no"].includes(normalized)) return false;
  }
  if (typeof value === "number") {
    return value === 1;
  }
  return fallback;
}

function normalizeStatus(value: any, warnings: string[]): "active" | "inactive" {
  if (value === "active" || value === "inactive") {
    return value;
  }
  warnings.push("status missing; defaulting to active");
  return "active";
}

function applyMatching(
  type: "hospital" | "treatment",
  row: PackageRow,
  matcher: Record<string, number | null | undefined>,
  warnings: string[]
) {
  if (type === "hospital" && row.hospital_name) {
    const result = matchHospitalName(row.hospital_name);
    matcher.hospitalScore = result.score;
    if (result.value) {
      row.hospital_name = result.value;
    } else if (row.hospital_name) {
      warnings.push(`Hospital not recognized: ${row.hospital_name}`);
    }
  }

  if (type === "treatment" && row.treatment_name) {
    const result = matchTreatmentName(row.treatment_name);
    matcher.treatmentScore = result.score;
    if (result.value) {
      row.treatment_name = result.value;
    } else {
      warnings.push(`Treatment not recognized: ${row.treatment_name}`);
    }
  }
}

