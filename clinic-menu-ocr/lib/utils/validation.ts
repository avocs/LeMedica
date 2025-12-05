/**
 * Client-side validation logic for PackageRow
 */

import type { PackageRow, RowValidation, ValidationError } from "@/lib/types/ocr"

const REQUIRED_FIELDS: (keyof PackageRow)[] = ["title", "hospital_name", "treatment_name", "price", "currency"]

export function validateRow(row: PackageRow): RowValidation {
  const errors: ValidationError[] = []

  // Check required fields
  if (!row.title?.trim()) {
    errors.push({ field: "title", message: "Title is required" })
  }

  if (!row.hospital_name?.trim()) {
    errors.push({ field: "hospital_name", message: "Hospital name is required" })
  }

  if (!row.treatment_name?.trim()) {
    errors.push({ field: "treatment_name", message: "Treatment name is required" })
  }

  if (row.price === null || row.price === undefined) {
    errors.push({ field: "price", message: "Price is required" })
  } else if (isNaN(Number(row.price)) || Number(row.price) < 0) {
    errors.push({ field: "price", message: "Price must be a valid positive number" })
  }

  if (!row.currency?.trim()) {
    errors.push({ field: "currency", message: "Currency is required" })
  }

  // Optional field validations
  if (row.commission !== null && row.commission !== undefined) {
    if (isNaN(Number(row.commission)) || Number(row.commission) < 0 || Number(row.commission) > 100) {
      errors.push({ field: "commission", message: "Commission must be between 0 and 100" })
    }
  }

  if (row.original_price !== null && row.original_price !== undefined) {
    if (isNaN(Number(row.original_price)) || Number(row.original_price) < 0) {
      errors.push({ field: "original_price", message: "Original price must be a valid positive number" })
    }
  }

  return {
    rowId: row.id || "",
    isValid: errors.length === 0,
    errors,
  }
}

export function validateAllRows(rows: PackageRow[]): {
  validations: Map<string, RowValidation>
  summary: { valid: number; invalid: number; withWarnings: number }
} {
  const validations = new Map<string, RowValidation>()
  let valid = 0
  let invalid = 0
  let withWarnings = 0

  rows.forEach((row) => {
    const validation = validateRow(row)
    validations.set(row.id || "", validation)

    if (validation.isValid) {
      valid++
    } else {
      invalid++
    }

    if (row._meta?.warnings && row._meta.warnings.length > 0) {
      withWarnings++
    }
  })

  return {
    validations,
    summary: { valid, invalid, withWarnings },
  }
}

export function getFieldError(
  validations: Map<string, RowValidation>,
  rowId: string,
  field: string,
): string | undefined {
  const rowValidation = validations.get(rowId)
  if (!rowValidation) return undefined
  const error = rowValidation.errors.find((e) => e.field === field)
  return error?.message
}

export function isFieldInvalid(validations: Map<string, RowValidation>, rowId: string, field: string): boolean {
  return !!getFieldError(validations, rowId, field)
}
