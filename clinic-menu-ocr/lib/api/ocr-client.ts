/**
 * API Client for Clinic Menu OCR operations
 *
 * Handles communication with:
 * - POST /api/ocr-menus
 * - POST /api/ocr-menus/regenerate-csv
 * - POST /api/admin/bulk-import-packages
 */

import type { OcrMenusResponse, PackageRow, RegenerateCsvPayload } from "@/lib/types/ocr"

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || ""

/**
 * Upload menu files for OCR processing
 */
export async function uploadMenus(files: File[]): Promise<OcrMenusResponse> {
  const formData = new FormData()

  if (files.length === 1) {
    formData.append("file", files[0])
  } else {
    files.forEach((file) => {
      formData.append("files[]", file)
    })
  }

  const response = await fetch(`${API_BASE}/api/ocr-menus`, {
    method: "POST",
    body: formData,
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new OcrApiError(
      errorData.message || `OCR request failed with status ${response.status}`,
      response.status,
      errorData,
    )
  }

  const data = await response.json()

  // Add local IDs to packages for React keys
  data.packages = data.packages.map((pkg: PackageRow, index: number) => ({
    ...pkg,
    id: `pkg_${data.batch_id}_${index}`,
  }))

  return data
}

/**
 * Regenerate CSV from edited packages
 */
export async function regenerateCsv(payload: RegenerateCsvPayload): Promise<Blob> {
  const response = await fetch(`${API_BASE}/api/ocr-menus/regenerate-csv`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new OcrApiError(`CSV regeneration failed: ${errorText}`, response.status, { raw: errorText })
  }

  return response.blob()
}

/**
 * Upload CSV to admin bulk importer
 */
export async function uploadCsvToAdmin(
  csvBlob: Blob,
  batchId: string,
  options: { confirmAutoCreate?: boolean; clearExisting?: boolean },
): Promise<{ success: boolean; message: string; raw?: string }> {
  const formData = new FormData()
  formData.append("file", csvBlob, `clinic-menu-packages-${batchId}.csv`)
  formData.append("confirmAutoCreate", options.confirmAutoCreate ? "true" : "false")
  formData.append("clearExisting", options.clearExisting ? "true" : "false")

  const response = await fetch(`${API_BASE}/api/admin/bulk-import-packages`, {
    method: "POST",
    body: formData,
  })

  const responseText = await response.text()

  // Try to parse as JSON first
  try {
    const jsonResponse = JSON.parse(responseText)
    if (!response.ok) {
      throw new OcrApiError(jsonResponse.message || "Bulk import failed", response.status, jsonResponse)
    }
    return { success: true, message: jsonResponse.message || "Import successful", raw: responseText }
  } catch {
    // Handle non-JSON responses
    if (!response.ok) {
      throw new OcrApiError(`Import failed: ${responseText.substring(0, 200)}`, response.status, { raw: responseText })
    }
    return { success: true, message: responseText || "Import completed", raw: responseText }
  }
}

/**
 * Custom error class for OCR API errors
 */
export class OcrApiError extends Error {
  status: number
  data: unknown

  constructor(message: string, status: number, data: unknown) {
    super(message)
    this.name = "OcrApiError"
    this.status = status
    this.data = data
  }
}
