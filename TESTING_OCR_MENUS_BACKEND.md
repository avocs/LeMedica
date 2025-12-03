## Windows Setup & Testing Guide

Follow these steps from a Windows 10/11 machine to run and verify the Clinic Menu OCR → CSV backend.

### A. Prerequisites

1. Install Node.js LTS (v18 or v20) from [https://nodejs.org](https://nodejs.org) and restart PowerShell.
2. Clone this repository and open it in PowerShell:
   ```
   git clone <your-fork-url>
   cd LeMedica
   ```
3. Create `.env.local` in the repo root with at least:
   ```
   AWS_REGION=ap-southeast-1
   AWS_ACCESS_KEY_ID=YOUR_KEY
   AWS_SECRET_ACCESS_KEY=YOUR_SECRET
   BEDROCK_MODEL_ID=anthropic.claude-3-haiku-20240307-v1:0
   OCR_MAX_FILE_MB=25
   APP_BASE_URL=http://localhost:3000
   ```

### B. Install & Run

```
npm install
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to ensure Next.js started. To confirm the OCR endpoint exists, open [http://localhost:3000/api/ocr-menus](http://localhost:3000/api/ocr-menus) in a browser; you should see `Method Not Allowed` for GET (meaning the POST route is registered).

### C. Basic OCR Test

Use `curl.exe` from PowerShell (adjust the file path to a local PDF or image):

```
curl.exe -X POST http://localhost:3000/api/ocr-menus ^
  -F "file=@C:\path\to\clinic-menu.pdf"
```

Success response structure:
```json
{
  "success": true,
  "batch_id": "uuid",
  "files": [
    { "file_id": "uuid", "original_name": "clinic-menu.pdf", "page_count": 3 }
  ],
  "packages": [ { "title": "...", "...": "..." } ],
  "summary": { "total": 6, "valid": 4, "withWarnings": 2, "invalid": 0 }
}
```

### D. CSV Regeneration Test

```
curl.exe -X POST http://localhost:3000/api/ocr-menus/regenerate-csv ^
  -H "Content-Type: application/json" ^
  -d "{\"packages\":[{\"title\":\"Test\",\"hospital_name\":\"Bumrungrad Intl\",\"treatment_name\":\"MRI Scan\",\"price\":1200,\"currency\":\"USD\",\"featured\":false,\"status\":\"active\",\"is_le_package\":false}]}" ^
  -o output.csv
```

Open `output.csv` in Excel to verify the header order matches the bulk import template.

### E. Routing / 404 Checklist

If `/api/ocr-menus` 404s:
1. Ensure `src/app/api/ocr-menus/route.ts` exists and exports `export async function POST`.
2. Confirm folder names are lowercase and match the URL segments.
3. Restart `npm run dev` after adding new routes (App Router caches route manifests).
4. Double-check the frontend or curl is targeting `/api/ocr-menus` (not `/api/medical-records`).

### F. Bedrock Sanity Test

Create `scripts/bedrock-smoke.ts` (or run in `node` REPL):

```ts
import { callBedrockForExtraction } from "../src/services/bedrockClient";

async function main() {
  const response = await callBedrockForExtraction('Return {"packages":[]} exactly.');
  console.log(response);
}

main();
```

Run with `npx ts-node scripts/bedrock-smoke.ts` (or temporarily add a package script). If you see authentication errors, double-check the AWS credentials and IAM permissions for Bedrock Runtime.

### G. Troubleshooting

| Issue | Quick Fix |
|-------|-----------|
| 404 on `/api/ocr-menus` | Verify route file exists, exports POST, and restart dev server. |
| `Unsupported file type` | Only PDF, JPG, PNG, HEIC/HEIF are accepted. Convert before uploading. |
| `File exceeds the maximum allowed size` | Split/ compress the file or raise `OCR_MAX_FILE_MB` in `.env.local`. |
| Empty OCR result | For PDFs, text extraction relies on embedded text; for scanned PDFs, try uploading the original images. |
| `AWS Bedrock authentication failed` | Check AWS keys, region, and IAM policy for `bedrock:InvokeModel`. |
| `Invalid JSON response from Claude` | Re-run the batch; Claude occasionally returns malformed JSON. The backend surfaces warnings in `_meta`. |
| CSV forwarding errors | `/api/ocr-menus/regenerate-csv` adds an `x-importer-status` header—inspect it and ensure `/api/admin/bulk-import-packages` is reachable. |

This workflow avoids native build dependencies: PDFs fall back to text extraction via `pdf-parse`, while images rely on `tesseract.js`, so `npm install` plus `npm run dev` is all that’s required on Windows.
