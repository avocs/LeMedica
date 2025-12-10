// src/lib/api/ocr-client.ts

import type { PackageRow, OcrMenusResponse } from "@/lib/types/ocr";

const BASE_URL = "";

/**
 * uploadMenus
 * -----------
 * Sends one or more files to POST /api/admin/clinic-menus.
 */
function safeErrorMessage(action: string, status: number, body: any): string {
  if (body?.message && typeof body.message === "string") {
    return `${action} failed (${status}): ${body.message}`
  }
  if (body?.error && typeof body.error === "string") {
    return `${action} failed (${status}): ${body.error}`
  }
  return `${action} failed (${status}).`
}

export async function uploadMenus(files: File[]): Promise<OcrMenusResponse> {
  const formData = new FormData()
  files.forEach((file) => formData.append("file", file))

  const res = await fetch("/api/admin/clinic-menus", {
    method: "POST",
    body: formData,
  })

  let body: any = null
  try {
    body = await res.json()
  } catch {
    // ignore
  }

  if (!res.ok) {
    throw new OcrApiError(
      safeErrorMessage("OCR upload", res.status, body),
      { status: res.status, data: body },
    )
  }

  return body as OcrMenusResponse
}

export async function regenerateCsv(payload: {
  batch_id: string
  packages: PackageRow[]
  forwardToImporter?: boolean
  confirmAutoCreate?: boolean
  clearExisting?: boolean
}): Promise<Blob> {
  const res = await fetch("/api/admin/clinic-menus/regenerate-csv", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    let body: any = null
    try {
      body = await res.json()
    } catch {
      // ignore
    }
    throw new OcrApiError(
      safeErrorMessage("CSV regeneration", res.status, body),
      { status: res.status, data: body },
    )
  }

  return await res.blob()
}

export async function uploadCsvToAdmin(
  csvBlob: Blob,
  batchId: string,
  options: { confirmAutoCreate: boolean; clearExisting: boolean },
): Promise<{ message: string }> {
  const formData = new FormData()
  formData.append("file", csvBlob, `clinic-menu-packages-${batchId}.csv`)
  formData.append("confirmAutoCreate", String(options.confirmAutoCreate))
  formData.append("clearExisting", String(options.clearExisting))

  const res = await fetch("/api/admin/clinic-menus/bulk-import-packages", {
    method: "POST",
    body: formData,
  })

  let body: any = null
  try {
    body = await res.json()
  } catch {
    // ignore
  }

  if (!res.ok) {
    throw new OcrApiError(
      safeErrorMessage("Bulk import", res.status, body),
      { status: res.status, data: body },
    )
  }

  return (body ?? { message: "Import complete." }) as { message: string }
}


export class OcrApiError extends Error {
  status?: number
  data?: unknown

  constructor(message: string, opts?: { status?: number; data?: unknown }) {
    super(message)
    this.name = "OcrApiError"
    this.status = opts?.status
    this.data = opts?.data
  }
}