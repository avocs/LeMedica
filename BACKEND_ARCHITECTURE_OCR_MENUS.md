# Clinic Menu OCR → CSV Backend Architecture
_NOTE:_ as of 05/12 this is outdated still

http://localhost:3000/admin/clinic-menus/ocr 

## High-Level Flow

```
Frontend (medical-records/MedicalRecordsView.tsx or v0 Admin UI)
  -> POST /api/ocr-menus  (FormData { file | files[] })
      -> handleUploadAndExtractOcr (src/services/ocr.ts)
      -> extractPackagesFromOcrText (src/services/aiExtractor.ts)
          -> callBedrockForExtraction (src/services/bedrockClient.ts)
      -> normalizePackageRow + validatePackageBatch (src/services/normalizer.ts)
      -> Response: { batch_id, files, packages, summary }

Frontend (after manual edits)
  -> POST /api/ocr-menus/regenerate-csv  (JSON { packages })
      -> normalizePackageRow
      -> generateBulkCsv (src/services/csvGenerator.ts)
      -> Optional forward to /api/admin/bulk-import-packages
      -> Response: text/csv stream

Frontend (debugging)
  -> POST /api/ocr-menus/preview-csv
      -> normalizePackageRow
      -> generateBulkCsv
      -> Response: { csv_content }
```

## File-by-File Guide

- `medical-records/medical-records/PDFProcessor.tsx`  
  Client-side PDF helper that already produces the `FormData` contract (`file` or `files[]`) reused by `/api/ocr-menus`. No code change is required; point uploads at `/api/ocr-menus`.

- `medical-records/medical-records/MedicalRecordsView.tsx`  
  Existing UI that will call the OCR endpoint. When adding clinic-menu upload actions, POST the `FormData` to `/api/ocr-menus`.

- `medical-records/medical-records/page.tsx`  
  Wrapper that renders the view; no backend logic but referenced here for navigation.

- `bedrock-config.ts/bedrock-config.ts`  
  Centralized AWS Bedrock client configuration. The OCR pipeline imports `bedrockClient` and the Claude model IDs from here to avoid duplicating credentials or model names.

- `src/types/packages.ts`  
  Declares `OcrPage` and `PackageRow` with detailed comments so every service shares the same shape. Update this file when the CSV schema evolves.

- `src/lib/matching.ts`  
  Fuzzy-matching helpers for hospital and treatment names using the whitelists documented in `BULK_CSV_UPLOAD_GUIDE.md`. `normalizePackageRow` relies on these helpers to auto-correct OCR drift.

- `src/services/ocr.ts`  
  Owns multipart parsing, file validation, temp storage (`tmp/ocr-uploads`), PDF/page rendering, and Tesseract OCR. Exported helpers:
  - `handleUploadAndExtractOcr(req: NextRequest)`
  - `runOcrOnFiles(files: SavedFile[])`

- `src/services/aiExtractor.ts`  
  Builds the long-form Claude prompt, calls Bedrock, strips markdown fences, and normalizes the AI output. Export:
  - `extractPackagesFromOcrText(ocrPages: OcrPage[])`

- `src/services/bedrockClient.ts`  
  Thin wrapper over `bedrock-config.ts` that exposes `callBedrockForExtraction(prompt, options)`. Handles inference profile resolution and response decoding.

- `src/services/normalizer.ts`  
  Contains:
  - `normalizePackageRow(row)` – trims strings, parses numbers, enforces currency codes, default booleans, and captures warnings.
  - `validatePackageBatch(rows)` – splits results into valid / warnings / invalid buckets to help the UI.

- `src/services/csvGenerator.ts`  
  Serializes normalized rows into the exact header order described in `BULK_CSV_UPLOAD_GUIDE.md`. Functions:
  - `toBulkCsvRow(row)`
  - `generateBulkCsv(rows)`

- `src/app/api/ocr-menus/route.ts`  
  Main OCR pipeline endpoint. Accepts `FormData` (keys: `file` for single uploads, `files[]` for multi) and returns `{ packages, summary }`. **URL to call:** `/api/ocr-menus` (POST).

- `src/app/api/ocr-menus/regenerate-csv/route.ts`  
  Accepts `{ packages }` JSON, regenerates CSV, and optionally forwards the CSV to `/api/admin/bulk-import-packages`. Responds with `text/csv`. **URL:** `/api/ocr-menus/regenerate-csv` (POST).

- `src/app/api/ocr-menus/preview-csv/route.ts`  
  Debug endpoint returning `{ csv_content }` JSON for quick previews. **URL:** `/api/ocr-menus/preview-csv` (POST).

- `BULK_CSV_UPLOAD_GUIDE.md`  
  Source of truth for CSV headers, allowed values, and descriptions. Referenced when validating and matching data.

## Routing Cheat Sheet

| Endpoint | Method | Purpose | Body |
|----------|--------|---------|------|
| `/api/ocr-menus` | POST | Upload PDF/image, run OCR + AI, return structured packages | `FormData` with `file` (single) or `files[]` (multi) |
| `/api/ocr-menus/regenerate-csv` | POST | Convert edited PackageRow[] into CSV (stream) and optionally forward to importer | JSON `{ packages: PackageRow[], forwardToImporter?: boolean }` |
| `/api/ocr-menus/preview-csv` | POST | Same as regenerate but returns CSV inside JSON for debugging | JSON `{ packages: PackageRow[] }` |

Always ensure your frontend points to these paths exactly to avoid 404s. After adding or modifying API routes, restart `next dev` so App Router picks up the new `route.ts` files.

