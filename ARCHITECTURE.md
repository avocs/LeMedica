# Clinic Menu OCR → CSV – Architecture

This document explains how the **Clinic Menu OCR → CSV** feature is structured in the LeMedica codebase:

- What each module/file does
- How data flows from **PDF → OCR → AI → JSON → CSV**
- How the **frontend admin UI** interacts with the **backend API**

---

## 1. High-Level Overview

### Goal
Provide an **admin-only tool** that:

1. Uploads clinic menu files (PDF / images)
2. Runs **OCR + AI extraction** on the server
3. Returns a structured list of **PackageRow** objects
4. Lets the admin **edit / validate** those rows in a React UI
5. Regenerates a **bulk-import CSV** compatible with the existing importer
6. Optionally forwards that CSV to `/api/admin/clinic-menus/bulk-import-packages`
7. Saves useful debug artifacts on disk (`ocr_outputs/`, `csv-outputs/`)

---

## 2. Directory Structure (Relevant Parts)

```txt
LeMedica/
│
├─ .env.local                     # Environment variables (API keys, Bedrock config, etc.)
├─ next.config.js                 # Next.js configuration (serverExternalPackages, body limits)
├─ package.json                   # Project dependencies and scripts
├─ tsconfig.json                  # TypeScript configuration
├─ package-lock.json
├─ postcss.config.mjs
├─ tailwind.config.mjs
|
├─ .next/                         # build files
│
├─ src/                           # Source Root
│   ├─ app/                           # Next.js App Router: pages, layouts, API routes
│   │   ├─ layout.tsx                 # Root layout
│   │   ├─ page.tsx                   # Landing page
│   │   │
│   │   ├─ admin/                     # Admin dashboard UI
│   │   │   └─ clinic-menus/          # Clinic menu tools
│   │   │       └─ ocr/               # OCR import UI
│   │   │           └─ page.tsx       # OCR upload and review interface
│   │   │
│   │   └─ api/                       # Server API routes (server-only)
│   │       └─ admin/
│   │           └─ clinic-menus/
│   │               ├─ route.ts       # POST /api/admin/clinic-menus (OCR pipeline entrypoint)
│   │               └─ regenerate-csv/
│   │                   └─ route.ts   # Utility API to regenerate structured CSV outputs
│   │
│   ├─ components/                    # Reusable UI building blocks
│   │   ├─ ocr/                       # OCR-specific UI (tables, previews, status blocks)
│   │   └─ ui/                        # General-purpose UI components (buttons, modals, inputs)
│   │
│   ├─ services/                      # Business logic + integrations (NOT React-specific)
│   │   ├─ aiExtractor.ts             # Groups OCR pages & calls Claude via Bedrock
│   │   ├─ bedrockClient.ts           # AWS Bedrock invocation + model resolution
│   │   ├─ normalizer.ts              # Cleans & normalizes extracted package rows
│   │   └─ ocrProcessor.ts            # Tesseract + PDF parsing (OCR engine driver)
│   │
│   └─ lib/                           # Shared utilities (pure functions, types, helpers)
│       ├─ api/                       # Client-side API helpers for fetch calls
│       └─ types/                     # Type definitions (OcrPage, PackageRow, etc.)
│
├─ data/                          # Local non-production data
│   ├─ images/                    # For README.md visualisation
│   ├─ tessdata/                  # Tesseract .traineddata files (eng, chi_sim, etc.)
│   ├─ tmp/                       # Runtime temp space for debug snapshots
│   └─ references/                # Configs, constants, reference dictionaries
│
├─ tests/                           # Performance check for OCR extractor
│   ├─ perf-check/                  # Quick CSV drop spot for comparison
│   ├─ test-menus/                  # Examples to test on
│   └─ test-menus-folder/           # Example folder to test on
│
└─ node_modules/                  # Installed dependencies (auto-managed)


```

## 3. Data Model

### 3.1 PackageRow (`src/lib/types/ocr.ts`)
This is the canonical row used end-to-end:
- Produced by the AI extraction pipeline
- Edited in the UI
- Serialized into CSV for the bulk importer

These types are shared between:
- `page.tsx`
- `FileUploadPanel`
- `PackageTable`
- API client (`ocr-client.ts`)

---

## 4. Frontend Architecture

### 4.1 Main Page – `src/app/admin/clinic-menus/ocr/page.tsx`
**Component:** `ClinicMenuOcrPage` (top-level React component, client-side)

**Responsibilities:**
- Owns all React state:
  - `files: UploadedFile[]`
  - `packages: PackageRow[]`
  - `summary: OcrMenusResponse["summary"] | null`
  - `fileInfos: FileInfo[]`
  - `batchId: string | null`
  - `csvBlob: Blob | null`
  - `validations: Map<string, RowValidation>`
  - `warningsFilter: "all" | "warnings" | "invalid"`
  - Debug state: `lastResponse`, `lastError`, `requestDuration`, `timestamps`

- Wires up event handlers:
  - `handleProcess` → calls `uploadMenus()` → updates `packages`, `summary`, `fileInfos`, `batchId`
  - `handleUpdatePackage` / `handleDeletePackage` / `handleDuplicatePackage` / `handleAddRow`
  - `handleRegenerateCsv` → calls `regenerateCsv()` and stores `csvBlob`
  - `handleDownloadCsv` → triggers file download
  - `handleUploadToAdmin` → calls `uploadCsvToAdmin()`
  - `handleApplyJson` → replaces packages from edited JSON

- Child components:
  - `<FileUploadPanel />`
  - `<OcrSummaryPanel />`
  - `<PackageTable />`
  - `<JsonPreviewPanel />`
  - `<DebugPanel />`
  - `<ActionBar />`
  - `<Toaster />` (global toast provider)

---

### 4.2 File Upload – `src/components/ocr/file-upload-panel.tsx`
**Responsibilities:**
- UI for drag-and-drop and file list
- Uses `ACCEPTED_FILE_TYPES` / `ACCEPTED_FILE_EXTENSIONS` for validation
- Emits:
  - `onFilesChange(UploadedFile[])`
  - `onProcess()` when user clicks *Process menus*
- Does not talk to backend directly; only manages file-selection UI and sends files upward to `page.tsx`.

---

### 4.3 Summary Panel – `src/components/ocr/ocr-summary-panel.tsx`
**Inputs:**
- `summary: OcrMenusResponse["summary"] | null`
- `packages: PackageRow[]`
- `files: FileInfo[]`
- `batchId: string | null`
- `warningsFilter + onFilterChange`

**Responsibilities:**
- Show counts:
  - Total, with warnings, invalid
- Show batch ID
- Aggregated warnings across all rows
- Controls for filtering:
  - “Show all”
  - “Warnings only”
  - “Invalid only”

---

### 4.4 Package Table – `src/components/ocr/package-table.tsx`
**Inputs:**
- `packages: PackageRow[]`
- `validations: Map<string, RowValidation>`
- `warningsFilter`

**Handlers:** `onUpdate`, `onDelete`, `onDuplicate`, `onAddRow`

**Responsibilities:**
- Editable grid for `PackageRow[]`

**Column logic:**
- `ALL_COLUMNS` defines column metadata (label + key)
- `DEFAULT_VISIBLE_COLUMNS` is initial state (all CSV columns except meta)
- Column toggling via “Columns” popover

**Cell rendering:**
- Text inputs (title, description, etc.)
- Numeric inputs (price, original_price, commission)
- Selects (status, currency)
- Checkboxes (featured, is_le_package)

**Validation:**
- Field-level: `getFieldError` / `isFieldInvalid` (from `lib/validation`)
- Row-level:
  - Warning badges (`_meta.warnings`)
  - Low confidence badge (`_meta.confidence_score < 0.7`)
  - Row background for invalid rows

**Other features:**
- Pagination: `itemsPerPage` (default 20)
- Detail view: `<Sheet>` opens with all fields + translation + meta

---

### 4.5 JSON Preview – `src/components/ocr/json-preview-panel.tsx`
**Inputs:**
- `packages: PackageRow[]`
- `batchId: string | null`
- `onApplyJson(newPackages: PackageRow[])`

**Responsibilities:**
- Show pretty-printed JSON for packages
- “Edit JSON” mode:
  - Textarea/editor
  - Parse & validate JSON on submit
  - Call `onApplyJson` to replace packages in state
- “Download JSON” button:
  - Downloads `clinic-menu-packages-<batchId>.json` (or fallback)

---

### 4.6 Action Bar – `src/components/ocr/action-bar.tsx`
**Inputs:**
- `packages`
- `validations`
- `batchId`
- `csvBlob`
- `isRegenerating`
- `isImporting`

**Handlers:**
- `onRegenerateCsv`
- `onDownloadCsv`
- `onUploadToAdmin`
- `timestamps` (last OCR, CSV, import)

**Responsibilities:**
- Persistent bottom bar with:
  - Regenerate CSV
  - Download CSV
  - Import options: `confirmAutoCreate`, `clearExisting`
  - Upload CSV to Admin
- Also shows:
  - Last action timestamps
  - Quick CSV header info (using `CSV_COLUMNS`)

---

### 4.7 Debug Panel – `src/components/ocr/debug-panel.tsx`
**Inputs:**
- `lastResponse: OcrMenusResponse | null`
- `lastError: { message: string; status?: number; data?: unknown } | null`
- `requestDuration: number | null`

**Responsibilities:**
- Display:
  - Raw last response (trimmed/pretty)
  - Last API error (message + status + data snippet)
  - Timing info for last OCR request

---

## 5. Backend: OCR & CSV Pipelines

### 5.1 OCR Upload & AI Extraction – `src/app/api/clinic-menus/route.ts`
**Endpoint:** `POST /api/clinic-menus`

**Responsibilities:**
- Parse `multipart/form-data`:
  - Accepts `file` or `files[]`
  - Validate file type & size (`ALLOWED_MIME_TYPES`)
- Save each file to temp folder (`TEMP_DIR`)
- Generate `fileId` via `randomUUID()`
- Run OCR: `runOcrOnFiles(savedFiles)` from `services/ocr.ts`
- Produces `OcrPage[]` (page-level text blobs)
- Call AI extraction:
  - Sends `OcrPage[]` to Bedrock (or other LLM) with structured prompt
  - Returns `PackageRow[]`
- Add `_meta` fields (source_file, source_page, confidence, warnings)
- Construct response:
  - `batch_id` via `generateFriendlyBatchId()`
  - `files: FileInfo[]`
  - `summary: { total, valid, withWarnings, invalid }`
  - `success: true`
- (Optional) `OCR_DEBUG_ENABLED`: save debug snapshot into `ocr_outputs/`

---

### 5.2 Tesseract Wrapper – `services/ocr.ts`
**Responsibilities:**
- Wrap `Tesseract.recognize` safely:
  - Timeouts via `OCR_TIMEOUT_MS`
  - Language config via `OCR_LANGS`
  - Disable PDF output (`tessjs_create_pdf: "0"`)
- Return clean string text for each page
- Attach file/page metadata into `OcrPage`

---

### 5.3 Normalization & CSV – `services/normalizer.ts` & `services/csvGenerator.ts`
**Function:** `normalizePackageRow(pkg: PackageRow): PackageRow`
- Ensure required fields are not undefined
- Defaults: `featured = false`, `status = "active"`, `is_le_package = false`
- Trim strings
- Normalize numeric values
- Provide consistent shape for CSV generation

**Function:** `generateBulkCsv(rows: PackageRow[]): string`
- Emit CSV with exact header sequence required by bulk importer:
  ```
  title,description,details,hospital_name,treatment_name,Sub Treatments,price,original_price,currency,duration,treatment_category,anaesthesia,commission,featured,status,doctor_name,is_le_package,includes,image_file_id,hospital_location,category,hospital_country,translation_title,translation_description,translation_details,translation
  ```
- Serialize each row according to that order
- Handle null/undefined values cleanly

---

## 6. Backend: CSV Regeneration & Import

### 6.1 Regenerate CSV – `src/app/api/ocr-menus/regenerate-csv/route.ts`
**Endpoint:** `POST /api/ocr-menus/regenerate-csv`

**Request:**
- Either:
  - `{ packages: PackageRow[] }`
  - Full OCR response `{ success, batch_id, files, packages, summary }`
- Optional:
  - `forwardToImporter?: boolean`
  - `confirmAutoCreate?: boolean`
  

### 6.2 Forwarding to Bulk Importer – forwardCsvToImporter(...)
Function: 
```ts
async function forwardCsvToImporter(
  csvContent: string,
  options: { confirmAutoCreate?: boolean; clearExisting?: boolean }
): Promise<string>
```

- **Responsibilities:** Builds importer URL and posts CSV for bulk import.
- **Importer URL sources:**
  - **Env:** `process.env.BULK_IMPORT_ENDPOINT`
  - **Base URL:** `APP_BASE_URL + /api/admin/bulk-import-packages`
  - **Default:** `http://localhost:3000/api/admin/bulk-import-packages`
- **FormData payload:**
  - **file:** CSV as Blob
  - **confirmAutoCreate:** Optional flag
  - **clearExisting:** Optional flag
- **Returns:**
  - **Success:** `"success"` on 2xx
  - **Failure:** `"failed:<reason>"` on error

---

### 6.3 Admin Import Endpoint – /api/admin/bulk-import-packages
- **Status:** Existing endpoint (not modified here)
- **Input:** CSV matching the bulk-upload spec
- **Responsibilities:**
  - **Validate CSV**
  - **Create/update packages**
- **UI note:** Shows a Compatibility warning banner until importer rules are verified (OCR output may differ).

---

## 7. Frontend API Client – src/lib/api/ocr-client.ts
- **Role:** Thin typed wrapper around backend routes.
- **Routes used:**
  - **Upload OCR:** `/api/ocr-menus`
  - **Regenerate CSV:** `/api/ocr-menus/regenerate-csv`
  - **Admin import:** `/api/admin/bulk-import-packages`
- **Error handling:** Throws `OcrApiError` with debug-friendly message and parsed error JSON.
- **UI integration:** `page.tsx` consumes these to show toasts and populate the Debug Panel.

---

## 8. Validation & Fuzzy Matching – src/lib/validation.ts

- **Responsibilities:** Fuzzy matching + client-side validation for `PackageRow`.
- **Matching data:** Curated lists (`HOSPITAL_NAMES`, `TREATMENT_NAMES`)
- **Algorithms:**
  - **normalize(value)**
  - **levenshtein(a, b)**
  - **similarityScore(source, candidate)**
- **APIs exposed:**
  - **matchHospitalName(raw)**
  - **matchTreatmentName(raw)**
- **Meta effects:** Populates `_meta.matcher` scores and warnings.

- **Client-side validation:**
  - **validateRow(row):** Returns `RowValidation`
  - **validateAllRows(rows):** Returns `validations: Map` and `summary`
  - **getFieldError(...):** Returns `string | undefined`
  - **isFieldInvalid(...):** Returns `boolean`

- **Rules:**
  - **Required fields:** `title`, `hospital_name`, `treatment_name`, `price`, `currency`
  - **Numeric ranges:** `commission` between 0 and 100; `original_price >= 0`
  - **Row IDs:** Adds UI-only `rowId` and assigns `row.id` if missing

- **Usage:**
  - **Sync:** `page.tsx` calls `validateAllRows` in a `useEffect` to keep UI and summary in sync when `packages` change.

---

## 9. Debugging & Test Harness

### 9.1 OCR Debug Snapshots – ocr_outputs/
- **When enabled:** `OCR_DEBUG_ENABLED`
- **Writes:**
  - **Raw pages:** `OcrPage[]` per page text
  - **LLM context:** Prompts/responses (if implemented)
- **Use cases:**
  - **Trace misses:** If OCR missed content
  - **Explain extraction:** Why AI extraction ignored lines

### 9.2 CSV Outputs – csv-outputs/
- **Source:** `POST /api/admin/clinic-menus/regenerate-csv`
- **File naming:**
  - **Batch-based:** `b_<timestamp>_<suffix>.csv` (e.g., `b_20251205_111900_amgv.csv`)
  - **Explicit:** `fileName` from the request
- **Benefits:**
  - **Compare:** CSV vs importer input
  - **Artifacts:** Keep per-run files for rollback and debugging
