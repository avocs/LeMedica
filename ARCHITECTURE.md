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
6. Optionally forwards that CSV to `/api/admin/bulk-import-packages`
7. Saves useful debug artifacts on disk (`ocr_outputs/`, `csv-outputs/`)

---

## 2. Directory Structure (Relevant Parts)

```txt
src/
  app/
    layout.tsx
    globals.css
    admin/
      clinic-menus/
        ocr/
          page.tsx                 # Main React UI (ClinicMenuOcrPage)

    api/
      ocr-menus/
        route.ts                   # POST /api/ocr-menus     (OCR + AI)
        regenerate-csv/
          route.ts                 # POST /api/ocr-menus/regenerate-csv

  components/
    ocr/
      file-upload-panel.tsx        # Upload + file list + Process button
      ocr-summary-panel.tsx        # Counts + warning summary
      package-table.tsx            # Editable table of PackageRow[]
      json-preview-panel.tsx       # JSON view/edit + download
      action-bar.tsx               # Regenerate CSV, Download, Import
      debug-panel.tsx              # Last response, errors, timings

    ui/                            # shadcn/ui primitives
      button.tsx
      input.tsx
      select.tsx
      table.tsx
      alert.tsx
      toast.tsx
      toaster.tsx
      ...etc

  hooks/
    use-toast.ts                   # Toast helper hook used in page.tsx

  lib/
    types/
      ocr.ts                       # PackageRow, OcrMenusResponse, etc.
    api/
      ocr-client.ts                # Frontend API client wrapper
    validation.ts                  # Row validation + fuzzy matching
    utils.ts                       # cn() helper (clsx + tailwind-merge)

services/
  ocr.ts                           # Tesseract-based OCR (per page)
  normalizer.ts                    # Normalizes PackageRow for CSV
  csvGenerator.ts                  # PackageRow[] → CSV string

ocr_outputs/                       # (Backend) OCR debug snapshots (JSON)
csv-outputs/                       # (Backend) generated CSV files

test_menu_1/                       # (Local) sample menus used by test script
scripts/ or root PowerShell script # PS test runner (curl → APIs)




