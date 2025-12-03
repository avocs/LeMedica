import { PackageRow } from "../types/packages";

export const CSV_HEADERS = [
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
];

/**
 * toBulkCsvRow
 * ------------
 * Maps a normalized PackageRow into an array of string values using the
 * exact header order required by BULK_CSV_UPLOAD_GUIDE.md.
 */
export function toBulkCsvRow(row: PackageRow): string[] {
  return [
    row.title ?? "",
    row.description ?? "",
    row.details ?? "",
    row.hospital_name ?? "",
    row.treatment_name ?? "",
    row.sub_treatments ?? "",
    row.price != null ? row.price.toString() : "",
    row.original_price != null ? row.original_price.toString() : "",
    row.currency ?? "",
    row.duration ?? "",
    row.treatment_category ?? "",
    row.anaesthesia ?? "",
    row.commission != null ? row.commission.toString() : "",
    row.featured ? "TRUE" : "FALSE",
    row.status,
    row.doctor_name ?? "",
    row.is_le_package ? "TRUE" : "FALSE",
    row.includes ?? "",
    row.image_file_id ?? "",
    row.hospital_location ?? "",
    row.category ?? "",
    row.hospital_country ?? "",
    row.translation_title ?? "",
    row.translation_description ?? "",
    row.translation_details ?? "",
    row.translation ?? "",
  ];
}

/**
 * generateBulkCsv
 * ---------------
 * Serializes a list of PackageRow objects into the official bulk CSV format.
 */
export function generateBulkCsv(rows: PackageRow[]): string {
  const lines = [CSV_HEADERS.join(",")];
  for (const row of rows) {
    const values = toBulkCsvRow(row).map(csvEscape);
    lines.push(values.join(","));
  }
  return lines.join("\n");
}

function csvEscape(value: string): string {
  if (value === undefined || value === null) return "";
  const needsQuotes = /[",\n]/.test(value);
  const sanitized = value.replace(/"/g, '""');
  return needsQuotes ? `"${sanitized}"` : sanitized;
}

